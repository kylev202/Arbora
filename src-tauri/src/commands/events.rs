//! Timetable events (redesign slice D): plain calendar CRUD, no AI. The AI
//! scheduler (slice E) writes here too, but only after the user accepts its
//! proposals (law #2) — nothing in this module decides anything for the user.

use serde::Serialize;
use sqlx::SqlitePool;
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct CalendarEvent {
    pub id: String,
    pub subject_id: Option<String>,
    pub title: String,
    pub start_at: String,
    pub end_at: String,
    pub kind: String,
    pub kind_label: Option<String>,
    pub color: Option<String>,
    pub status: String,
    pub origin: String,
    pub recurrence_group_id: Option<String>,
}

const COLS: &str =
    "SELECT id, subject_id, title, start_at, end_at, kind, kind_label, color, status, origin, recurrence_group_id FROM calendar_events";

async fn fetch(pool: &SqlitePool, id: &str) -> Result<CalendarEvent, String> {
    sqlx::query_as::<_, CalendarEvent>(&format!("{COLS} WHERE id = ?1"))
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "EVENT_NOT_FOUND".to_string())
}

async fn list(
    pool: &SqlitePool,
    from: Option<String>,
    to: Option<String>,
) -> Result<Vec<CalendarEvent>, String> {
    sqlx::query_as::<_, CalendarEvent>(&format!(
        "{COLS} WHERE (?1 IS NULL OR start_at >= ?1) AND (?2 IS NULL OR start_at < ?2)
         ORDER BY start_at"
    ))
    .bind(from)
    .bind(to)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())
}

fn validate_times(start_at: &str, end_at: &str) -> Result<(), String> {
    if start_at >= end_at {
        return Err("event must end after it starts".to_string());
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn upsert(
    pool: &SqlitePool,
    id: Option<String>,
    subject_id: Option<String>,
    title: String,
    start_at: String,
    end_at: String,
    kind: String,
    kind_label: Option<String>,
    color: Option<String>,
    recurrence_group_id: Option<String>,
    status: Option<String>,
) -> Result<CalendarEvent, String> {
    let title = title.trim().to_string();
    if title.is_empty() {
        return Err("title cannot be empty".to_string());
    }
    validate_times(&start_at, &end_at)?;

    // kind_label is only meaningful for the "custom" kind.
    let kind_label = if kind == "custom" { kind_label } else { None };

    match id {
        Some(id) => {
            sqlx::query(
                "UPDATE calendar_events
                 SET subject_id = ?2, title = ?3, start_at = ?4, end_at = ?5, kind = ?6,
                     kind_label = ?7, color = ?8, status = COALESCE(?9, status)
                 WHERE id = ?1",
            )
            .bind(&id)
            .bind(subject_id)
            .bind(&title)
            .bind(&start_at)
            .bind(&end_at)
            .bind(&kind)
            .bind(&kind_label)
            .bind(&color)
            .bind(status)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
            fetch(pool, &id).await
        }
        None => {
            let id = Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT INTO calendar_events
                   (id, subject_id, title, start_at, end_at, kind, kind_label, color,
                    recurrence_group_id, status, origin, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, COALESCE(?10,'planned'), 'user',
                         strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
            )
            .bind(&id)
            .bind(subject_id)
            .bind(&title)
            .bind(&start_at)
            .bind(&end_at)
            .bind(&kind)
            .bind(&kind_label)
            .bind(&color)
            .bind(&recurrence_group_id)
            .bind(status)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
            fetch(pool, &id).await
        }
    }
}

/// Drag-drop reschedule: only the times change; a user moving their own event
/// is normal editing, not a "moved" state (that marks AI-relocated sessions).
async fn move_ev(
    pool: &SqlitePool,
    id: &str,
    start_at: String,
    end_at: String,
) -> Result<CalendarEvent, String> {
    validate_times(&start_at, &end_at)?;
    sqlx::query("UPDATE calendar_events SET start_at = ?2, end_at = ?3 WHERE id = ?1")
        .bind(id)
        .bind(&start_at)
        .bind(&end_at)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    fetch(pool, id).await
}

async fn set_status(pool: &SqlitePool, id: &str, status: &str) -> Result<CalendarEvent, String> {
    sqlx::query("UPDATE calendar_events SET status = ?2 WHERE id = ?1")
        .bind(id)
        .bind(status)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    fetch(pool, id).await
}

// ── Tauri commands ─────────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_events(
    pool: State<'_, SqlitePool>,
    from: Option<String>,
    to: Option<String>,
) -> Result<Vec<CalendarEvent>, String> {
    list(pool.inner(), from, to).await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn upsert_event(
    pool: State<'_, SqlitePool>,
    id: Option<String>,
    subject_id: Option<String>,
    title: String,
    start_at: String,
    end_at: String,
    kind: String,
    kind_label: Option<String>,
    color: Option<String>,
    recurrence_group_id: Option<String>,
    status: Option<String>,
) -> Result<CalendarEvent, String> {
    upsert(
        pool.inner(),
        id,
        subject_id,
        title,
        start_at,
        end_at,
        kind,
        kind_label,
        color,
        recurrence_group_id,
        status,
    )
    .await
}

#[tauri::command]
pub async fn delete_event_group(pool: State<'_, SqlitePool>, group_id: String) -> Result<(), String> {
    sqlx::query("DELETE FROM calendar_events WHERE recurrence_group_id = ?1")
        .bind(&group_id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn move_event(
    pool: State<'_, SqlitePool>,
    id: String,
    start_at: String,
    end_at: String,
) -> Result<CalendarEvent, String> {
    move_ev(pool.inner(), &id, start_at, end_at).await
}

#[tauri::command]
pub async fn set_event_status(
    pool: State<'_, SqlitePool>,
    id: String,
    status: String,
) -> Result<CalendarEvent, String> {
    set_status(pool.inner(), &id, &status).await
}

#[tauri::command]
pub async fn delete_event(pool: State<'_, SqlitePool>, id: String) -> Result<(), String> {
    sqlx::query("DELETE FROM calendar_events WHERE id = ?1")
        .bind(&id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
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
        sqlx::query(
            "INSERT INTO subjects (id,name,color,created_at,updated_at) VALUES ('s1','Bio','#000','t','t')",
        )
        .execute(&pool)
        .await
        .unwrap();
        pool
    }

    #[tokio::test]
    async fn event_crud_and_window_filter() {
        let pool = mem_pool().await;

        let ev = upsert(
            &pool,
            None,
            Some("s1".into()),
            "Bio lecture".into(),
            "2026-07-06T09:00".into(),
            "2026-07-06T10:00".into(),
            "lecture".into(),
            None,
            None,
            None,
            None,
        )
        .await
        .unwrap();
        assert_eq!(ev.status, "planned");
        assert_eq!(ev.origin, "user");

        upsert(
            &pool,
            None,
            None,
            "Dentist".into(),
            "2026-07-20T14:00".into(),
            "2026-07-20T15:00".into(),
            "custom".into(),
            Some("Doctor appointment".into()),
            None,
            None,
            None,
        )
        .await
        .unwrap();

        // Week window only returns the first event.
        let week = list(
            &pool,
            Some("2026-07-06T00:00".into()),
            Some("2026-07-13T00:00".into()),
        )
        .await
        .unwrap();
        assert_eq!(week.len(), 1);
        assert_eq!(week[0].title, "Bio lecture");
        assert_eq!(list(&pool, None, None).await.unwrap().len(), 2);

        // Update via upsert with id; invalid times rejected.
        let moved = move_ev(
            &pool,
            &ev.id,
            "2026-07-07T09:00".into(),
            "2026-07-07T10:30".into(),
        )
        .await
        .unwrap();
        assert_eq!(moved.start_at, "2026-07-07T09:00");
        assert!(move_ev(
            &pool,
            &ev.id,
            "2026-07-07T10:00".into(),
            "2026-07-07T10:00".into()
        )
        .await
        .is_err());

        let done = set_status(&pool, &ev.id, "done").await.unwrap();
        assert_eq!(done.status, "done");
        assert!(
            set_status(&pool, &ev.id, "bogus").await.is_err(),
            "CHECK enforced"
        );

        sqlx::query("DELETE FROM calendar_events WHERE id = ?1")
            .bind(&ev.id)
            .execute(&pool)
            .await
            .unwrap();
        assert_eq!(list(&pool, None, None).await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn subject_cascade_deletes_events() {
        let pool = mem_pool().await;
        upsert(
            &pool,
            None,
            Some("s1".into()),
            "Session".into(),
            "2026-07-06T18:00".into(),
            "2026-07-06T20:00".into(),
            "study".into(),
            None,
            None,
            None,
            None,
        )
        .await
        .unwrap();
        sqlx::query("DELETE FROM subjects WHERE id = 's1'")
            .execute(&pool)
            .await
            .unwrap();
        assert!(list(&pool, None, None).await.unwrap().is_empty());
    }
}
