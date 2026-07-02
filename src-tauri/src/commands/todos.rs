//! Todos for the home panel (redesign slice D). User-created rows here; the AI
//! phase (slice E) inserts `source='ai'` suggestions — which stay freely
//! editable/deferrable, never punitive (a11y-adhd).

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
}

const COLS: &str = "SELECT id, subject_id, title, due, session_slot, kind, done, source FROM todos";

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

async fn insert(
    pool: &SqlitePool,
    subject_id: Option<String>,
    title: &str,
    due: Option<String>,
    kind: Option<String>,
) -> Result<Todo, String> {
    let title = title.trim();
    if title.is_empty() {
        return Err("title cannot be empty".to_string());
    }
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO todos (id, subject_id, title, due, kind, source, created_at)
         VALUES (?1, ?2, ?3, ?4, COALESCE(?5,'task'), 'user',
                 strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
    )
    .bind(&id)
    .bind(subject_id)
    .bind(title)
    .bind(due)
    .bind(kind)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    fetch(pool, &id).await
}

async fn set_done(pool: &SqlitePool, id: &str, done: bool) -> Result<Todo, String> {
    sqlx::query("UPDATE todos SET done = ?2 WHERE id = ?1")
        .bind(id)
        .bind(done)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    fetch(pool, id).await
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
    insert(pool.inner(), subject_id, &title, due, kind).await
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
    sqlx::query("DELETE FROM todos WHERE id = ?1")
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
        )
        .await
        .unwrap();
        let sooner = insert(
            &pool,
            None,
            "Upload slides",
            Some("2026-07-05".into()),
            None,
        )
        .await
        .unwrap();
        let undated = insert(&pool, None, "Tidy notes", None, None).await.unwrap();
        assert_eq!(undated.source, "user");
        assert_eq!(undated.kind, "task");

        let all = list(&pool).await.unwrap();
        assert_eq!(
            all.iter().map(|t| t.id.as_str()).collect::<Vec<_>>(),
            vec![sooner.id.as_str(), later.id.as_str(), undated.id.as_str()],
            "open items sorted by due, undated last"
        );

        // Done items sink to the bottom; un-done restores position.
        set_done(&pool, &sooner.id, true).await.unwrap();
        let all = list(&pool).await.unwrap();
        assert_eq!(all.last().unwrap().id, sooner.id);
        assert!(all.last().unwrap().done);

        assert!(insert(&pool, None, "   ", None, None).await.is_err());

        sqlx::query("DELETE FROM todos WHERE id = ?1")
            .bind(&undated.id)
            .execute(&pool)
            .await
            .unwrap();
        assert_eq!(list(&pool).await.unwrap().len(), 2);
    }
}
