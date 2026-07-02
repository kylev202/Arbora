//! The user profile singleton (`user_profile` row id=1) and the weekly
//! `study_windows` set — onboarding writes them, Settings edits them, and the
//! (later) AI scheduler reads them. Every field is nullable: a fully skipped
//! onboarding is a valid state (redesign slice A). All data stays local (law #3).
//! The AI preset is NOT here — `settings.ai_preset` owns it.

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct UserProfile {
    name: Option<String>,
    year: Option<String>,
    major: Option<String>,
    term_start: Option<String>,
    term_end: Option<String>,
    wake_time: Option<String>,
    sleep_time: Option<String>,
    goal: Option<String>,
}

/// One weekly recurring free-to-study slot. weekday: 0=Monday … 6=Sunday.
#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct StudyWindow {
    id: String,
    weekday: i64,
    start_time: String,
    end_time: String,
}

/// Wire shape the UI sends when replacing the study-window set.
#[derive(Debug, Deserialize)]
pub struct StudyWindowInput {
    pub weekday: i64,
    pub start_time: String,
    pub end_time: String,
}

async fn get(pool: &SqlitePool) -> Result<UserProfile, String> {
    sqlx::query_as::<_, UserProfile>(
        "SELECT name, year, major, term_start, term_end, wake_time, sleep_time, goal
         FROM user_profile WHERE id = 1",
    )
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())
}

#[allow(clippy::too_many_arguments)] // mirrors the singleton's columns, like settings::update
async fn update(
    pool: &SqlitePool,
    name: Option<String>,
    year: Option<String>,
    major: Option<String>,
    term_start: Option<String>,
    term_end: Option<String>,
    wake_time: Option<String>,
    sleep_time: Option<String>,
    goal: Option<String>,
) -> Result<UserProfile, String> {
    if let Some(g) = goal.as_deref() {
        if g != "pass" && g != "high_gpa" {
            return Err(format!("invalid goal: {g:?}"));
        }
    }
    sqlx::query(
        "UPDATE user_profile
         SET name = COALESCE(?1, name),
             year = COALESCE(?2, year),
             major = COALESCE(?3, major),
             term_start = COALESCE(?4, term_start),
             term_end = COALESCE(?5, term_end),
             wake_time = COALESCE(?6, wake_time),
             sleep_time = COALESCE(?7, sleep_time),
             goal = COALESCE(?8, goal),
             updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
         WHERE id = 1",
    )
    .bind(name)
    .bind(year)
    .bind(major)
    .bind(term_start)
    .bind(term_end)
    .bind(wake_time)
    .bind(sleep_time)
    .bind(goal)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    get(pool).await
}

async fn list_windows(pool: &SqlitePool) -> Result<Vec<StudyWindow>, String> {
    sqlx::query_as::<_, StudyWindow>(
        "SELECT id, weekday, start_time, end_time FROM study_windows
         ORDER BY weekday, start_time",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())
}

/// Replace the whole set in one transaction — onboarding and Settings both
/// present the windows as one editable list, so replace-all is the natural write.
async fn replace_windows(
    pool: &SqlitePool,
    windows: Vec<StudyWindowInput>,
) -> Result<Vec<StudyWindow>, String> {
    for w in &windows {
        if !(0..=6).contains(&w.weekday) {
            return Err(format!("invalid weekday: {}", w.weekday));
        }
        if w.start_time >= w.end_time {
            return Err(format!(
                "window must end after it starts: {} ≥ {}",
                w.start_time, w.end_time
            ));
        }
    }
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM study_windows")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    for w in &windows {
        sqlx::query(
            "INSERT INTO study_windows (id, weekday, start_time, end_time, created_at)
             VALUES (?1, ?2, ?3, ?4, strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(w.weekday)
        .bind(&w.start_time)
        .bind(&w.end_time)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }
    tx.commit().await.map_err(|e| e.to_string())?;
    list_windows(pool).await
}

#[tauri::command]
pub async fn get_profile(pool: State<'_, SqlitePool>) -> Result<UserProfile, String> {
    get(pool.inner()).await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn update_profile(
    pool: State<'_, SqlitePool>,
    name: Option<String>,
    year: Option<String>,
    major: Option<String>,
    term_start: Option<String>,
    term_end: Option<String>,
    wake_time: Option<String>,
    sleep_time: Option<String>,
    goal: Option<String>,
) -> Result<UserProfile, String> {
    update(
        pool.inner(),
        name,
        year,
        major,
        term_start,
        term_end,
        wake_time,
        sleep_time,
        goal,
    )
    .await
}

#[tauri::command]
pub async fn list_study_windows(pool: State<'_, SqlitePool>) -> Result<Vec<StudyWindow>, String> {
    list_windows(pool.inner()).await
}

#[tauri::command]
pub async fn set_study_windows(
    pool: State<'_, SqlitePool>,
    windows: Vec<StudyWindowInput>,
) -> Result<Vec<StudyWindow>, String> {
    replace_windows(pool.inner(), windows).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn mem_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        pool
    }

    #[tokio::test]
    async fn empty_profile_is_valid_then_patches() {
        let pool = mem_pool().await;

        // Skipped onboarding: the seeded row is all-NULL and readable.
        let p = get(&pool).await.unwrap();
        assert!(p.name.is_none());
        assert!(p.goal.is_none());

        // Patch a subset; untouched fields stay NULL / keep their value.
        let p = update(
            &pool,
            Some("Kim".into()),
            None,
            None,
            Some("2026-02-24".into()),
            Some("2026-06-20".into()),
            None,
            None,
            Some("high_gpa".into()),
        )
        .await
        .unwrap();
        assert_eq!(p.name.as_deref(), Some("Kim"));
        assert_eq!(p.term_start.as_deref(), Some("2026-02-24"));
        assert_eq!(p.goal.as_deref(), Some("high_gpa"));
        assert!(p.year.is_none(), "skipped field stays NULL");

        let p = update(
            &pool,
            None,
            Some("Year 2".into()),
            None,
            None,
            None,
            None,
            None,
            None,
        )
        .await
        .unwrap();
        assert_eq!(p.name.as_deref(), Some("Kim"), "earlier patch preserved");
        assert_eq!(p.year.as_deref(), Some("Year 2"));

        // Invalid goal is rejected before touching the row.
        assert!(update(
            &pool,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            Some("win".into())
        )
        .await
        .is_err());
    }

    #[tokio::test]
    async fn study_windows_replace_all() {
        let pool = mem_pool().await;
        assert!(list_windows(&pool).await.unwrap().is_empty());

        let set = replace_windows(
            &pool,
            vec![
                StudyWindowInput {
                    weekday: 0,
                    start_time: "19:00".into(),
                    end_time: "21:00".into(),
                },
                StudyWindowInput {
                    weekday: 5,
                    start_time: "09:00".into(),
                    end_time: "11:30".into(),
                },
            ],
        )
        .await
        .unwrap();
        assert_eq!(set.len(), 2);
        assert_eq!(set[0].weekday, 0, "ordered by weekday");

        // Replace shrinks the set atomically.
        let set = replace_windows(
            &pool,
            vec![StudyWindowInput {
                weekday: 2,
                start_time: "14:00".into(),
                end_time: "16:00".into(),
            }],
        )
        .await
        .unwrap();
        assert_eq!(set.len(), 1);
        assert_eq!(set[0].weekday, 2);

        // Invalid rows are rejected and leave the stored set untouched.
        assert!(replace_windows(
            &pool,
            vec![StudyWindowInput {
                weekday: 7,
                start_time: "08:00".into(),
                end_time: "09:00".into()
            }],
        )
        .await
        .is_err());
        assert!(replace_windows(
            &pool,
            vec![StudyWindowInput {
                weekday: 1,
                start_time: "10:00".into(),
                end_time: "10:00".into()
            }],
        )
        .await
        .is_err());
        assert_eq!(
            list_windows(&pool).await.unwrap().len(),
            1,
            "failed replace left set intact"
        );
    }
}
