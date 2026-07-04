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

/// A due date maps to a calm morning marker on the calendar (naive local ISO,
/// matching `calendar_events`). Date-only input is the common case (DatePicker).
fn deadline_window(due: &str) -> (String, String) {
    let date = &due[..due.len().min(10)];
    (format!("{date}T09:00"), format!("{date}T09:30"))
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
            let (start_at, end_at) = deadline_window(due.trim());
            let eid = Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT INTO calendar_events
                   (id, subject_id, title, start_at, end_at, kind, status, origin, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'deadline', 'planned', 'user',
                         strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
            )
            .bind(&eid)
            .bind(subject_id)
            .bind(title)
            .bind(&start_at)
            .bind(&end_at)
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
    let date = &due.trim()[..due.trim().len().min(10)];
    let (next,): (String,) = sqlx::query_as("SELECT date(?1, ?2)")
        .bind(date)
        .bind(modifier)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
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
