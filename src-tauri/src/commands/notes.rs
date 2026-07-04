//! User-authored notes (OneNote-style) + their folder tree. Kept separate from
//! the AI-generated, cited `notes` (see `content.rs`) — these are the user's own
//! writing, no review gate. Subject folders are auto-ensured (one per subject)
//! and a single "Quick notes" folder collects quick captures from the top bar.

use serde::Serialize;
use sqlx::SqlitePool;
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct NoteFolder {
    pub id: String,
    pub subject_id: Option<String>,
    pub parent_id: Option<String>,
    pub name: String,
    pub kind: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct UserNote {
    pub id: String,
    pub folder_id: String,
    pub subject_id: Option<String>,
    pub title: String,
    pub content: String,
    pub created_at: String,
    pub updated_at: String,
}

const FOLDER_COLS: &str =
    "SELECT id, subject_id, parent_id, name, kind, created_at FROM note_folders";
const NOTE_COLS: &str =
    "SELECT id, folder_id, subject_id, title, content, created_at, updated_at FROM user_notes";
const NOW: &str = "strftime('%Y-%m-%dT%H:%M:%SZ','now')";

/// Ensure the singleton "Quick notes" folder and one folder per subject exist.
/// Deterministic ids ('quick', 'subject:<id>') make this idempotent via
/// INSERT OR IGNORE, so it can run cheaply on every folder list.
async fn ensure_folders(pool: &SqlitePool) -> Result<(), String> {
    sqlx::query(&format!(
        "INSERT OR IGNORE INTO note_folders (id, subject_id, parent_id, name, kind, created_at)
         VALUES ('quick', NULL, NULL, 'Quick notes', 'quick', {NOW})"
    ))
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    let subjects: Vec<(String, String)> = sqlx::query_as("SELECT id, name FROM subjects")
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
    for (sid, name) in subjects {
        sqlx::query(&format!(
            "INSERT OR IGNORE INTO note_folders (id, subject_id, parent_id, name, kind, created_at)
             VALUES (?1, ?2, NULL, ?3, 'subject', {NOW})"
        ))
        .bind(format!("subject:{sid}"))
        .bind(&sid)
        .bind(&name)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

async fn folder(pool: &SqlitePool, id: &str) -> Result<NoteFolder, String> {
    sqlx::query_as::<_, NoteFolder>(&format!("{FOLDER_COLS} WHERE id = ?1"))
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "FOLDER_NOT_FOUND".to_string())
}

async fn note(pool: &SqlitePool, id: &str) -> Result<UserNote, String> {
    sqlx::query_as::<_, UserNote>(&format!("{NOTE_COLS} WHERE id = ?1"))
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "NOTE_NOT_FOUND".to_string())
}

// ── Tauri commands ─────────────────────────────────────────────────────────

/// All folders (Quick notes first, then subject folders, then user folders).
#[tauri::command]
pub async fn list_note_folders(pool: State<'_, SqlitePool>) -> Result<Vec<NoteFolder>, String> {
    let pool = pool.inner();
    ensure_folders(pool).await?;
    sqlx::query_as::<_, NoteFolder>(&format!(
        "{FOLDER_COLS} ORDER BY CASE kind WHEN 'quick' THEN 0 WHEN 'subject' THEN 1 ELSE 2 END, created_at"
    ))
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_note_folder(
    pool: State<'_, SqlitePool>,
    name: String,
    parent_id: Option<String>,
) -> Result<NoteFolder, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("folder name cannot be empty".to_string());
    }
    let id = Uuid::new_v4().to_string();
    sqlx::query(&format!(
        "INSERT INTO note_folders (id, subject_id, parent_id, name, kind, created_at)
         VALUES (?1, NULL, ?2, ?3, 'user', {NOW})"
    ))
    .bind(&id)
    .bind(parent_id)
    .bind(name)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;
    folder(pool.inner(), &id).await
}

#[tauri::command]
pub async fn rename_note_folder(
    pool: State<'_, SqlitePool>,
    id: String,
    name: String,
) -> Result<NoteFolder, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("folder name cannot be empty".to_string());
    }
    sqlx::query("UPDATE note_folders SET name = ?2 WHERE id = ?1")
        .bind(&id)
        .bind(name)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    folder(pool.inner(), &id).await
}

/// Delete a user folder (and its notes/subfolders, by cascade). Subject and
/// Quick folders are protected — the guard makes the delete a no-op for them.
#[tauri::command]
pub async fn delete_note_folder(pool: State<'_, SqlitePool>, id: String) -> Result<(), String> {
    sqlx::query("DELETE FROM note_folders WHERE id = ?1 AND kind = 'user'")
        .bind(&id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn list_user_notes(
    pool: State<'_, SqlitePool>,
    folder_id: String,
) -> Result<Vec<UserNote>, String> {
    sqlx::query_as::<_, UserNote>(&format!(
        "{NOTE_COLS} WHERE folder_id = ?1 ORDER BY updated_at DESC"
    ))
    .bind(&folder_id)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_note(pool: State<'_, SqlitePool>, id: String) -> Result<UserNote, String> {
    note(pool.inner(), &id).await
}

#[tauri::command]
pub async fn create_note(
    pool: State<'_, SqlitePool>,
    folder_id: String,
    title: Option<String>,
) -> Result<UserNote, String> {
    let f = folder(pool.inner(), &folder_id).await?;
    let title = title
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty());
    let id = Uuid::new_v4().to_string();
    sqlx::query(&format!(
        "INSERT INTO user_notes (id, folder_id, subject_id, title, content, created_at, updated_at)
         VALUES (?1, ?2, ?3, COALESCE(?4,'Untitled'), '', {NOW}, {NOW})"
    ))
    .bind(&id)
    .bind(&folder_id)
    .bind(&f.subject_id)
    .bind(title)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;
    note(pool.inner(), &id).await
}

#[tauri::command]
pub async fn update_note(
    pool: State<'_, SqlitePool>,
    id: String,
    title: String,
    content: String,
) -> Result<UserNote, String> {
    let title = title.trim();
    sqlx::query(&format!(
        "UPDATE user_notes SET title = COALESCE(NULLIF(?2,''),'Untitled'), content = ?3,
             updated_at = {NOW} WHERE id = ?1"
    ))
    .bind(&id)
    .bind(title)
    .bind(content)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;
    note(pool.inner(), &id).await
}

#[tauri::command]
pub async fn move_note(
    pool: State<'_, SqlitePool>,
    id: String,
    folder_id: String,
) -> Result<UserNote, String> {
    let f = folder(pool.inner(), &folder_id).await?;
    sqlx::query("UPDATE user_notes SET folder_id = ?2, subject_id = ?3 WHERE id = ?1")
        .bind(&id)
        .bind(&folder_id)
        .bind(&f.subject_id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    note(pool.inner(), &id).await
}

#[tauri::command]
pub async fn delete_note(pool: State<'_, SqlitePool>, id: String) -> Result<(), String> {
    sqlx::query("DELETE FROM user_notes WHERE id = ?1")
        .bind(&id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Save a quick capture from the top-bar Quick Note popover into the (ensured)
/// Quick notes folder.
#[tauri::command]
pub async fn create_quick_note(
    pool: State<'_, SqlitePool>,
    content: String,
    title: Option<String>,
) -> Result<UserNote, String> {
    let pool = pool.inner();
    ensure_folders(pool).await?;
    let title = title
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty());
    let id = Uuid::new_v4().to_string();
    sqlx::query(&format!(
        "INSERT INTO user_notes (id, folder_id, subject_id, title, content, created_at, updated_at)
         VALUES (?1, 'quick', NULL, COALESCE(?2,'Quick note'), ?3, {NOW}, {NOW})"
    ))
    .bind(&id)
    .bind(title)
    .bind(content)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    note(pool, &id).await
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
        sqlx::query("INSERT INTO subjects (id,name,color,created_at,updated_at) VALUES ('s1','Bio','#000','t','t')")
            .execute(&pool)
            .await
            .unwrap();
        pool
    }

    #[tokio::test]
    async fn ensure_creates_quick_and_subject_folders_idempotently() {
        let pool = mem_pool().await;
        ensure_folders(&pool).await.unwrap();
        ensure_folders(&pool).await.unwrap(); // second run must not duplicate

        let (quick,): (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM note_folders WHERE kind='quick'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(quick, 1);
        let (subj,): (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM note_folders WHERE kind='subject'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(subj, 1);
    }

    #[tokio::test]
    async fn note_and_folder_lifecycle() {
        let pool = mem_pool().await;
        ensure_folders(&pool).await.unwrap();

        // A note in the subject folder inherits its subject.
        let f = folder(&pool, "subject:s1").await.unwrap();
        assert_eq!(f.subject_id.as_deref(), Some("s1"));
        let id = {
            let nid = Uuid::new_v4().to_string();
            sqlx::query(&format!(
                "INSERT INTO user_notes (id, folder_id, subject_id, title, content, created_at, updated_at)
                 VALUES (?1, 'subject:s1', 's1', 'Cell biology', '<p>hi</p>', {NOW}, {NOW})"
            ))
            .bind(&nid)
            .execute(&pool)
            .await
            .unwrap();
            nid
        };
        let n = note(&pool, &id).await.unwrap();
        assert_eq!(n.subject_id.as_deref(), Some("s1"));
        assert_eq!(n.title, "Cell biology");

        // Deleting the subject cascades its folder + notes.
        sqlx::query("DELETE FROM subjects WHERE id='s1'")
            .execute(&pool)
            .await
            .unwrap();
        assert!(note(&pool, &id).await.is_err(), "note removed with subject");
        assert!(
            folder(&pool, "subject:s1").await.is_err(),
            "folder removed with subject"
        );
    }

    #[tokio::test]
    async fn user_folder_delete_is_guarded_for_protected_kinds() {
        let pool = mem_pool().await;
        ensure_folders(&pool).await.unwrap();

        // Deleting a protected folder by the guarded query is a no-op.
        sqlx::query("DELETE FROM note_folders WHERE id = 'quick' AND kind = 'user'")
            .execute(&pool)
            .await
            .unwrap();
        assert!(
            folder(&pool, "quick").await.is_ok(),
            "quick folder survives"
        );
    }
}
