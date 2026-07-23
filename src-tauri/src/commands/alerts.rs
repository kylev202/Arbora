//! Proactive deadline alerts (ADR-0013). `upcoming_deadlines` is a pure,
//! cross-subject read: every future deadline within a near horizon, each with its
//! subject name and whole-days-until, soonest first. It writes nothing and
//! computes nothing punitive — the UI shows it as a calm, dismissible banner
//! (gold, no countdown pressure). Days are whole calendar days in local time, so
//! "in 3 days" matches the user's wall clock.

use serde::Serialize;
use sqlx::SqlitePool;
use tauri::State;

/// One approaching deadline for the alert banner. `days_until` is whole local
/// days (0 = today). Serialised with `type` to mirror the `Deadline` wire shape.
#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct DeadlineAlert {
    pub id: String,
    pub subject_id: String,
    pub subject_name: String,
    pub title: String,
    pub due_at: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub days_until: i64,
}

/// Future deadlines within `within_days`, across all subjects, soonest first.
async fn fetch_upcoming(pool: &SqlitePool, within_days: i64) -> Result<Vec<DeadlineAlert>, String> {
    let horizon = format!("+{within_days} days");
    sqlx::query_as::<_, DeadlineAlert>(
        "SELECT d.id, d.subject_id, s.name AS subject_name, d.title, d.due_at,
                d.type AS kind,
                CAST(julianday(date(d.due_at)) - julianday(date('now','localtime')) AS INTEGER)
                    AS days_until
         FROM deadlines d JOIN subjects s ON s.id = d.subject_id
         WHERE date(d.due_at) >= date('now','localtime')
           AND date(d.due_at) <= date('now','localtime', ?1)
         ORDER BY d.due_at ASC",
    )
    .bind(&horizon)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())
}

/// Approaching deadlines for the app-wide alert banner. `within_days` is clamped
/// to a sane [1, 60] so a stray value can't turn the calm alert into a firehose.
#[tauri::command]
pub async fn upcoming_deadlines(
    pool: State<'_, SqlitePool>,
    within_days: i64,
) -> Result<Vec<DeadlineAlert>, String> {
    fetch_upcoming(pool.inner(), within_days.clamp(1, 60)).await
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
        sqlx::query("INSERT INTO subjects (id,name,color,created_at,updated_at) VALUES ('s1','Biology','#000','t','t')")
            .execute(&pool).await.unwrap();
        pool
    }

    async fn add_deadline(pool: &SqlitePool, id: &str, title: &str, offset: &str, kind: &str) {
        sqlx::query(
            "INSERT INTO deadlines (id,subject_id,title,due_at,type,created_at)
             VALUES (?1,'s1',?2,strftime('%Y-%m-%dT09:00:00','now','localtime',?3),?4,'t')",
        )
        .bind(id)
        .bind(title)
        .bind(offset)
        .bind(kind)
        .execute(pool)
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn upcoming_within_horizon_only_with_subject_and_days() {
        let pool = mem_pool().await;
        add_deadline(&pool, "past", "Past", "-2 days", "assignment").await;
        add_deadline(&pool, "near", "Midterm", "+3 days", "exam").await;
        add_deadline(&pool, "far", "Final", "+30 days", "exam").await;

        let alerts = fetch_upcoming(&pool, 7).await.unwrap();
        assert_eq!(
            alerts.len(),
            1,
            "past excluded, far beyond horizon excluded"
        );
        let a = &alerts[0];
        assert_eq!(a.id, "near");
        assert_eq!(a.subject_name, "Biology");
        assert_eq!(a.days_until, 3);

        // Serialised as `type`, not the internal `kind` (mirrors `Deadline`).
        let json = serde_json::to_value(a).unwrap();
        assert_eq!(json["type"], "exam");
        assert!(json.get("kind").is_none());
    }

    #[tokio::test]
    async fn ordered_soonest_first() {
        let pool = mem_pool().await;
        add_deadline(&pool, "d5", "Five", "+5 days", "assignment").await;
        add_deadline(&pool, "d1", "One", "+1 days", "assignment").await;

        let alerts = fetch_upcoming(&pool, 7).await.unwrap();
        let ids: Vec<&str> = alerts.iter().map(|a| a.id.as_str()).collect();
        assert_eq!(ids, vec!["d1", "d5"]);
    }
}
