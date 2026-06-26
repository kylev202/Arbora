//! Subject CRUD — the library root. Every other domain (sources, cards, grades…)
//! hangs off a `subject_id`, so this is the first command surface wired in
//! Phase 4. Pure SQLite; no sidecar involved.
//!
//! Each Tauri command is a thin adapter over a plain `async fn` that takes a
//! `&SqlitePool`. That keeps the SQL unit-testable without constructing Tauri
//! `State`, and is the pattern the rest of the phase copies.

use serde::Serialize;
use sqlx::SqlitePool;
use tauri::State;
use uuid::Uuid;

/// Wire shape for a subject — mirrors the TS `Subject` type. `updated_at` is
/// tracked in the DB but is not part of the UI contract, so it is not selected.
#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Subject {
    pub id: String,
    pub name: String,
    pub color: String,
    pub created_at: String,
}

// ── DB layer (plain pool → unit-testable) ──────────────────────────────────

const COLS: &str = "SELECT id, name, color, created_at FROM subjects";

/// Fetch one subject by id, or `SUBJECT_NOT_FOUND`.
async fn fetch(pool: &SqlitePool, id: &str) -> Result<Subject, String> {
    sqlx::query_as::<_, Subject>(&format!("{COLS} WHERE id = ?1"))
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "SUBJECT_NOT_FOUND".to_string())
}

async fn list(pool: &SqlitePool) -> Result<Vec<Subject>, String> {
    sqlx::query_as::<_, Subject>(&format!("{COLS} ORDER BY created_at"))
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())
}

async fn create(pool: &SqlitePool, name: &str, color: &str) -> Result<Subject, String> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO subjects (id, name, color, created_at, updated_at)
         VALUES (?1, ?2, ?3, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
    )
    .bind(&id)
    .bind(name)
    .bind(color)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    fetch(pool, &id).await
}

async fn update(
    pool: &SqlitePool,
    id: &str,
    name: Option<String>,
    color: Option<String>,
) -> Result<Subject, String> {
    sqlx::query(
        "UPDATE subjects
         SET name = COALESCE(?2, name),
             color = COALESCE(?3, color),
             updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
         WHERE id = ?1",
    )
    .bind(id)
    .bind(name)
    .bind(color)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    fetch(pool, id).await
}

async fn delete(pool: &SqlitePool, id: &str) -> Result<(), String> {
    sqlx::query("DELETE FROM subjects WHERE id = ?1")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Tauri commands (thin adapters) ─────────────────────────────────────────

#[tauri::command]
pub async fn list_subjects(pool: State<'_, SqlitePool>) -> Result<Vec<Subject>, String> {
    list(pool.inner()).await
}

#[tauri::command]
pub async fn get_subject(pool: State<'_, SqlitePool>, id: String) -> Result<Subject, String> {
    fetch(pool.inner(), &id).await
}

#[tauri::command]
pub async fn create_subject(
    pool: State<'_, SqlitePool>,
    name: String,
    color: String,
) -> Result<Subject, String> {
    create(pool.inner(), &name, &color).await
}

#[tauri::command]
pub async fn update_subject(
    pool: State<'_, SqlitePool>,
    id: String,
    name: Option<String>,
    color: Option<String>,
) -> Result<Subject, String> {
    update(pool.inner(), &id, name, color).await
}

/// Delete a subject. Sources, chunks, cards, schedules, grades… cascade via the
/// `ON DELETE CASCADE` foreign keys in `0001_initial.sql`.
#[tauri::command]
pub async fn delete_subject(pool: State<'_, SqlitePool>, id: String) -> Result<(), String> {
    delete(pool.inner(), &id).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    /// A migrated in-memory DB. `max_connections(1)` keeps every query on the
    /// same `:memory:` database (separate connections would each get a fresh,
    /// table-less one).
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
    async fn crud_roundtrip() {
        let pool = mem_pool().await;

        let made = create(&pool, "Biology 12", "#4A7C59").await.unwrap();
        assert_eq!(made.name, "Biology 12");
        assert_eq!(made.color, "#4A7C59");
        assert!(!made.id.is_empty(), "id should be a generated uuid");

        assert_eq!(list(&pool).await.unwrap().len(), 1);
        assert_eq!(fetch(&pool, &made.id).await.unwrap().id, made.id);

        // Patch name only → color is preserved by COALESCE.
        let edited = update(&pool, &made.id, Some("Bio".into()), None)
            .await
            .unwrap();
        assert_eq!(edited.name, "Bio");
        assert_eq!(edited.color, "#4A7C59");

        delete(&pool, &made.id).await.unwrap();
        assert!(list(&pool).await.unwrap().is_empty());
        assert_eq!(
            fetch(&pool, &made.id).await.unwrap_err(),
            "SUBJECT_NOT_FOUND"
        );
    }
}
