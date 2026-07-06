//! Todos for the home panel + the dedicated Todos manager (redesign slice D).
//! User-created rows here; the AI phase (slice E) inserts `source='ai'`
//! suggestions — which stay freely editable/deferrable, never punitive
//! (a11y-adhd). A todo with a due date mirrors itself onto the calendar as a
//! `deadline` event; completing a repeating todo spawns its next occurrence.

use serde::Serialize;
use sqlx::SqlitePool;
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Todo {
    pub id: String,
    pub subject_id: Option<String>,
    pub title: String,
    pub due: Option<String>,
    pub session_slot: Option<String>,
    pub kind: String,
    pub done: bool,
    pub source: String,
    pub notes: Option<String>,
    pub repeat: Option<String>,
    pub linked_event_id: Option<String>,
}

const COLS: &str = "SELECT id, subject_id, title, due, session_slot, kind, done, source, \
    notes, repeat, linked_event_id FROM todos";

async fn fetch(pool: &SqlitePool, id: &str) -> Result<Todo, String> {
    sqlx::query_as::<_, Todo>(&format!("{COLS} WHERE id = ?1"))
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "TODO_NOT_FOUND".to_string())
}

async fn list(pool: &SqlitePool) -> Result<Vec<Todo>, String> {
    // Open items first, then by due date (NULLs last), then insertion order.
    sqlx::query_as::<_, Todo>(&format!(
        "{COLS} ORDER BY done, due IS NULL, due, created_at"
    ))
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())
}

/// Add 30 minutes to an "HH:MM", clamped to end-of-day so a late deadline never
/// spills past midnight.
fn plus_30(hm: &str) -> String {
    let (h, m) = hm.split_once(':').unwrap_or((hm, "00"));
    let mins =
        (h.parse::<i32>().unwrap_or(0) * 60 + m.parse::<i32>().unwrap_or(0) + 30).min(23 * 60 + 59);
    format!("{:02}:{:02}", mins / 60, mins % 60)
}

/// Turn a todo's due value into its mirror event window on the calendar (naive
/// local ISO, matching `calendar_events`). A date-only due ("2026-07-12") is the
/// common case → an all-day marker. A due carrying a time ("2026-07-12T14:30")
/// → a 30-minute deadline block at that time. Returns (start, end, all_day).
fn deadline_window(due: &str) -> (String, String, bool) {
    match due.split_once('T') {
        Some((date, time)) if !time.trim().is_empty() => {
            let hm = &time[..time.len().min(5)];
            (
                format!("{date}T{hm}"),
                format!("{date}T{}", plus_30(hm)),
                false,
            )
        }
        _ => {
            let date = &due[..due.len().min(10)];
            (format!("{date}T00:00"), format!("{date}T23:59"), true)
        }
    }
}

/// Keep a `deadline` calendar event in lock-step with a todo's due date. We
/// delete-and-reinsert rather than update in place: nothing references these
/// mirror events, so a fresh id each edit is harmless and keeps the logic
/// idempotent (and self-heals if the user deleted the event on the calendar).
async fn sync_due_event(
    pool: &SqlitePool,
    subject_id: Option<&str>,
    title: &str,
    due: Option<&str>,
    existing_event_id: Option<&str>,
) -> Result<Option<String>, String> {
    if let Some(eid) = existing_event_id {
        sqlx::query("DELETE FROM calendar_events WHERE id = ?1")
            .bind(eid)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
    }
    match due {
        Some(due) if !due.trim().is_empty() => {
            let (start_at, end_at, all_day) = deadline_window(due.trim());
            let eid = Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT INTO calendar_events
                   (id, subject_id, title, start_at, end_at, kind, all_day, status, origin, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'deadline', ?6, 'planned', 'user',
                         strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
            )
            .bind(&eid)
            .bind(subject_id)
            .bind(title)
            .bind(&start_at)
            .bind(&end_at)
            .bind(all_day)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
            Ok(Some(eid))
        }
        _ => Ok(None),
    }
}

/// Advance a due date by the repeat interval, using SQLite's own date math so we
/// need no calendar crate. Returns None when there's no date to advance.
async fn advance_due(
    pool: &SqlitePool,
    due: Option<&str>,
    repeat: &str,
) -> Result<Option<String>, String> {
    let Some(due) = due.filter(|d| !d.trim().is_empty()) else {
        return Ok(None);
    };
    let modifier = match repeat {
        "daily" => "+1 day",
        "weekly" => "+7 days",
        "monthly" => "+1 month",
        _ => return Ok(None),
    };
    let trimmed = due.trim();
    let date = &trimmed[..trimmed.len().min(10)];
    let (next,): (String,) = sqlx::query_as("SELECT date(?1, ?2)")
        .bind(date)
        .bind(modifier)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    // Preserve a wall-clock time on the due date (e.g. "…T14:30") so a timed
    // repeat keeps its slot; a date-only due stays date-only (all-day).
    let next = match trimmed.split_once('T') {
        Some((_, time)) if !time.trim().is_empty() => format!("{next}T{time}"),
        _ => next,
    };
    Ok(Some(next))
}

#[allow(clippy::too_many_arguments)]
async fn insert(
    pool: &SqlitePool,
    subject_id: Option<String>,
    title: &str,
    due: Option<String>,
    kind: Option<String>,
    notes: Option<String>,
    repeat: Option<String>,
) -> Result<Todo, String> {
    let title = title.trim();
    if title.is_empty() {
        return Err("title cannot be empty".to_string());
    }
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO todos (id, subject_id, title, due, kind, notes, repeat, source, created_at)
         VALUES (?1, ?2, ?3, ?4, COALESCE(?5,'task'), ?6, ?7, 'user',
                 strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
    )
    .bind(&id)
    .bind(&subject_id)
    .bind(title)
    .bind(&due)
    .bind(kind)
    .bind(&notes)
    .bind(&repeat)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    let event_id = sync_due_event(pool, subject_id.as_deref(), title, due.as_deref(), None).await?;
    if let Some(eid) = &event_id {
        sqlx::query("UPDATE todos SET linked_event_id = ?2 WHERE id = ?1")
            .bind(&id)
            .bind(eid)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
    }
    fetch(pool, &id).await
}

async fn update(
    pool: &SqlitePool,
    id: &str,
    subject_id: Option<String>,
    title: &str,
    notes: Option<String>,
    due: Option<String>,
    repeat: Option<String>,
) -> Result<Todo, String> {
    let title = title.trim();
    if title.is_empty() {
        return Err("title cannot be empty".to_string());
    }
    let current = fetch(pool, id).await?;
    let event_id = sync_due_event(
        pool,
        subject_id.as_deref(),
        title,
        due.as_deref(),
        current.linked_event_id.as_deref(),
    )
    .await?;
    sqlx::query(
        "UPDATE todos SET subject_id = ?2, title = ?3, notes = ?4, due = ?5, repeat = ?6,
             linked_event_id = ?7 WHERE id = ?1",
    )
    .bind(id)
    .bind(subject_id)
    .bind(title)
    .bind(notes)
    .bind(due)
    .bind(repeat)
    .bind(event_id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    fetch(pool, id).await
}

async fn set_done(pool: &SqlitePool, id: &str, done: bool) -> Result<Todo, String> {
    sqlx::query("UPDATE todos SET done = ?2 WHERE id = ?1")
        .bind(id)
        .bind(done)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    let todo = fetch(pool, id).await?;

    // Completing a repeating todo quietly spawns the next occurrence (never a
    // punitive "you're behind" — just the calm next step).
    if done {
        if let Some(rep) = todo.repeat.as_deref() {
            if let Some(next_due) = advance_due(pool, todo.due.as_deref(), rep).await? {
                insert(
                    pool,
                    todo.subject_id.clone(),
                    &todo.title,
                    Some(next_due),
                    Some(todo.kind.clone()),
                    todo.notes.clone(),
                    Some(rep.to_string()),
                )
                .await?;
            }
        }
    }
    Ok(todo)
}

async fn remove(pool: &SqlitePool, id: &str) -> Result<(), String> {
    // Drop the mirror calendar event first, then the todo.
    sqlx::query(
        "DELETE FROM calendar_events WHERE id = (SELECT linked_event_id FROM todos WHERE id = ?1)",
    )
    .bind(id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM todos WHERE id = ?1")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Tauri commands ─────────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_todos(pool: State<'_, SqlitePool>) -> Result<Vec<Todo>, String> {
    list(pool.inner()).await
}

#[tauri::command]
pub async fn create_todo(
    pool: State<'_, SqlitePool>,
    subject_id: Option<String>,
    title: String,
    due: Option<String>,
    kind: Option<String>,
) -> Result<Todo, String> {
    insert(pool.inner(), subject_id, &title, due, kind, None, None).await
}

#[tauri::command]
pub async fn update_todo(
    pool: State<'_, SqlitePool>,
    id: String,
    subject_id: Option<String>,
    title: String,
    notes: Option<String>,
    due: Option<String>,
    repeat: Option<String>,
) -> Result<Todo, String> {
    update(pool.inner(), &id, subject_id, &title, notes, due, repeat).await
}

#[tauri::command]
pub async fn set_todo_done(
    pool: State<'_, SqlitePool>,
    id: String,
    done: bool,
) -> Result<Todo, String> {
    set_done(pool.inner(), &id, done).await
}

#[tauri::command]
pub async fn delete_todo(pool: State<'_, SqlitePool>, id: String) -> Result<(), String> {
    remove(pool.inner(), &id).await
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
    async fn todo_lifecycle_and_ordering() {
        let pool = mem_pool().await;

        let later = insert(
            &pool,
            None,
            "Read chapter 3",
            Some("2026-07-10".into()),
            None,
            None,
            None,
        )
        .await
        .unwrap();
        let sooner = insert(
            &pool,
            None,
            "Upload slides",
            Some("2026-07-05".into()),
            None,
            None,
            None,
        )
        .await
        .unwrap();
        let undated = insert(&pool, None, "Tidy notes", None, None, None, None)
            .await
            .unwrap();
        assert_eq!(undated.source, "user");
        assert_eq!(undated.kind, "task");

        let all = list(&pool).await.unwrap();
        assert_eq!(
            all.iter().map(|t| t.id.as_str()).collect::<Vec<_>>(),
            vec![sooner.id.as_str(), later.id.as_str(), undated.id.as_str()],
            "open items sorted by due, undated last"
        );

        set_done(&pool, &sooner.id, true).await.unwrap();
        let all = list(&pool).await.unwrap();
        assert!(all.last().unwrap().done);

        assert!(insert(&pool, None, "   ", None, None, None, None)
            .await
            .is_err());
    }

    #[tokio::test]
    async fn due_date_mirrors_a_calendar_event() {
        let pool = mem_pool().await;

        // A todo with a due date creates a linked deadline event.
        let t = insert(
            &pool,
            None,
            "Essay",
            Some("2026-07-12".into()),
            None,
            None,
            None,
        )
        .await
        .unwrap();
        assert!(t.linked_event_id.is_some());
        let (n,): (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM calendar_events WHERE kind = 'deadline'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(n, 1);

        // Clearing the due date drops the mirror event.
        let t = update(&pool, &t.id, None, "Essay", None, None, None)
            .await
            .unwrap();
        assert!(t.linked_event_id.is_none());
        let (n,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM calendar_events")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(n, 0, "mirror event removed when due cleared");

        // Re-adding a due date, then deleting the todo, leaves no orphan event.
        let t = update(
            &pool,
            &t.id,
            None,
            "Essay",
            None,
            Some("2026-07-20".into()),
            None,
        )
        .await
        .unwrap();
        assert!(t.linked_event_id.is_some());
        remove(&pool, &t.id).await.unwrap();
        let (n,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM calendar_events")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(n, 0, "deleting the todo removes its event");
    }

    #[tokio::test]
    async fn due_window_is_all_day_by_date_and_timed_with_a_time() {
        let pool = mem_pool().await;

        // Date-only due → an all-day mirror event spanning the whole day.
        let allday = insert(
            &pool,
            None,
            "Report",
            Some("2026-07-12".into()),
            None,
            None,
            None,
        )
        .await
        .unwrap();
        let (start, end, all_day): (String, String, bool) =
            sqlx::query_as("SELECT start_at, end_at, all_day FROM calendar_events WHERE id = ?1")
                .bind(allday.linked_event_id.unwrap())
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(
            (start.as_str(), end.as_str(), all_day),
            ("2026-07-12T00:00", "2026-07-12T23:59", true)
        );

        // Due carrying a time → a 30-minute timed block at that time.
        let timed = insert(
            &pool,
            None,
            "Call",
            Some("2026-07-12T14:30".into()),
            None,
            None,
            None,
        )
        .await
        .unwrap();
        let (start, end, all_day): (String, String, bool) =
            sqlx::query_as("SELECT start_at, end_at, all_day FROM calendar_events WHERE id = ?1")
                .bind(timed.linked_event_id.unwrap())
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(
            (start.as_str(), end.as_str(), all_day),
            ("2026-07-12T14:30", "2026-07-12T15:00", false)
        );
    }

    #[tokio::test]
    async fn completing_a_repeat_spawns_the_next_occurrence() {
        let pool = mem_pool().await;

        let weekly = insert(
            &pool,
            None,
            "Weekly review",
            Some("2026-07-06".into()),
            None,
            None,
            Some("weekly".into()),
        )
        .await
        .unwrap();

        set_done(&pool, &weekly.id, true).await.unwrap();

        let all = list(&pool).await.unwrap();
        assert_eq!(all.len(), 2, "a fresh occurrence was created");
        let next = all.iter().find(|t| !t.done).unwrap();
        assert_eq!(
            next.due.as_deref(),
            Some("2026-07-13"),
            "advanced by a week"
        );
        assert_eq!(next.repeat.as_deref(), Some("weekly"));
    }
}
