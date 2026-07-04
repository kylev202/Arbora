//! Sources + ingest. `add_source`/`list_sources`/`delete_source` are pure SQLite;
//! `ingest_source` is the first command that talks to the Python sidecar: it POSTs
//! the file, then a background poller streams `ingest:*` events to the UI and, on
//! completion, persists the returned chunk metadata. The sidecar owns the FAISS
//! index; Rust owns every row.

use std::path::Path;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use super::JobHandle;
use crate::sidecar::Sidecar;

/// Wire shape for a source — mirrors the TS `Source` type. Transient ingest
/// `progress`/`step` are not stored; they arrive as events while a job runs.
#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Source {
    pub id: String,
    pub subject_id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub title: String,
    pub file_path: String,
    pub ingest_state: String,
    pub page_count: Option<i64>,
    pub chunk_count: Option<i64>,
    pub error: Option<String>,
    pub week_id: Option<String>,
    /// Optional Drive folder (organization only — never affects AI scoping).
    pub folder_id: Option<String>,
    pub added_at: String,
}

const COLS: &str = "SELECT id, subject_id, type AS kind, title, file_path, ingest_state, \
    page_count, chunk_count, ingest_error AS error, week_id, folder_id, created_at AS added_at FROM sources";

/// Map a file extension to a source type, mirroring the sidecar's `detect_type`.
fn detect_type(file_path: &str) -> Result<&'static str, String> {
    let ext = Path::new(file_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    match ext.as_str() {
        "pdf" => Ok("pdf"),
        "pptx" | "ppt" => Ok("slide"),
        "mp3" | "m4a" | "wav" | "ogg" | "flac" | "aac" | "mp4" | "mkv" | "webm" | "avi" | "mov" => {
            Ok("audio")
        }
        "docx" => Ok("doc"),
        "txt" | "md" | "markdown" => Ok("text"),
        other => Err(format!("unsupported file type: .{other}")),
    }
}

// ── DB layer (plain pool → unit-testable) ──────────────────────────────────

async fn fetch_source(pool: &SqlitePool, id: &str) -> Result<Source, String> {
    sqlx::query_as::<_, Source>(&format!("{COLS} WHERE id = ?1"))
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "SOURCE_NOT_FOUND".to_string())
}

async fn list(pool: &SqlitePool, subject_id: &str) -> Result<Vec<Source>, String> {
    sqlx::query_as::<_, Source>(&format!("{COLS} WHERE subject_id = ?1 ORDER BY created_at"))
        .bind(subject_id)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())
}

async fn insert(
    pool: &SqlitePool,
    subject_id: &str,
    file_path: &str,
    folder_id: Option<&str>,
) -> Result<Source, String> {
    let kind = detect_type(file_path)?;
    let title = Path::new(file_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .map(str::to_string)
        .unwrap_or_else(|| file_path.to_string());
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO sources (id, subject_id, type, file_path, title, folder_id, ingest_state, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'queued', strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
    )
    .bind(&id)
    .bind(subject_id)
    .bind(kind)
    .bind(file_path)
    .bind(&title)
    .bind(folder_id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    fetch_source(pool, &id).await
}

async fn rename(pool: &SqlitePool, id: &str, title: &str) -> Result<Source, String> {
    let title = title.trim();
    if title.is_empty() {
        return Err("title cannot be empty".to_string());
    }
    sqlx::query("UPDATE sources SET title = ?2 WHERE id = ?1")
        .bind(id)
        .bind(title)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    fetch_source(pool, id).await
}

async fn set_state(
    pool: &SqlitePool,
    id: &str,
    state: &str,
    error: Option<&str>,
) -> Result<(), String> {
    sqlx::query("UPDATE sources SET ingest_state = ?2, ingest_error = ?3 WHERE id = ?1")
        .bind(id)
        .bind(state)
        .bind(error)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

async fn mark_processed(
    pool: &SqlitePool,
    id: &str,
    chunk_count: i64,
    page_count: Option<i64>,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE sources
         SET ingest_state = 'processed', ingest_error = NULL, chunk_count = ?2,
             page_count = ?3, ingested_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
         WHERE id = ?1",
    )
    .bind(id)
    .bind(chunk_count)
    .bind(page_count)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

async fn insert_chunks(
    pool: &SqlitePool,
    source_id: &str,
    subject_id: &str,
    chunks: &[ChunkRow],
) -> Result<(), String> {
    for c in chunks {
        sqlx::query(
            "INSERT INTO chunks (id, source_id, subject_id, text, page, timestamp_ms, faiss_id, chunk_index)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(source_id)
        .bind(subject_id)
        .bind(&c.text)
        .bind(c.page)
        .bind(c.timestamp_ms)
        .bind(c.faiss_id)
        .bind(c.chunk_index)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ── Sidecar response shapes ────────────────────────────────────────────────

#[derive(Deserialize)]
struct ChunkRow {
    text: String,
    page: Option<i64>,
    timestamp_ms: Option<i64>,
    faiss_id: i64,
    chunk_index: i64,
}

#[derive(Deserialize)]
struct IngestResultResp {
    chunks: Vec<ChunkRow>,
    chunk_count: i64,
    page_count: Option<i64>,
}

#[derive(Deserialize)]
struct IngestStatusResp {
    state: String,
    progress: f64,
    step: String,
    error: Option<String>,
}

// ── Tauri commands ─────────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_sources(
    pool: State<'_, SqlitePool>,
    subject_id: String,
) -> Result<Vec<Source>, String> {
    list(pool.inner(), &subject_id).await
}

#[tauri::command]
pub async fn add_source(
    pool: State<'_, SqlitePool>,
    subject_id: String,
    file_path: String,
    folder_id: Option<String>,
) -> Result<Source, String> {
    insert(pool.inner(), &subject_id, &file_path, folder_id.as_deref()).await
}

/// One source row by id — used by the reader to resolve the original file path
/// and type for the raw-file preview.
#[tauri::command]
pub async fn get_source(pool: State<'_, SqlitePool>, id: String) -> Result<Source, String> {
    fetch_source(pool.inner(), &id).await
}

/// Rename a source's display title. Pure SQLite; returns the updated row.
#[tauri::command]
pub async fn rename_source(
    pool: State<'_, SqlitePool>,
    id: String,
    title: String,
) -> Result<Source, String> {
    rename(pool.inner(), &id, &title).await
}

/// Delete a source and its chunk rows (cascade). The source's vectors stay in the
/// subject's FAISS index but are unreachable (no chunk row maps to them), so they
/// can never be cited — acceptable for the MVP; index compaction is a later concern.
#[tauri::command]
pub async fn delete_source(pool: State<'_, SqlitePool>, id: String) -> Result<(), String> {
    sqlx::query("DELETE FROM sources WHERE id = ?1")
        .bind(&id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Start ingesting a source: POST it to the sidecar, mark it `processing`, and
/// spawn a poller that streams `ingest:*` events and persists chunks on success.
/// Returns immediately with the job id.
#[tauri::command]
pub async fn ingest_source(
    app: AppHandle,
    pool: State<'_, SqlitePool>,
    sidecar: State<'_, Sidecar>,
    source_id: String,
) -> Result<JobHandle, String> {
    let src = fetch_source(pool.inner(), &source_id).await?;
    let base = sidecar
        .base_url()
        .filter(|_| sidecar.is_ready())
        .ok_or("SIDECAR_UNAVAILABLE")?;
    let token = sidecar.token().to_string();
    let job_id = Uuid::new_v4().to_string();

    let client = reqwest::Client::new();
    client
        .post(format!("{base}/ingest"))
        .header("X-Arbora-Token", &token)
        .json(&serde_json::json!({
            "job_id": job_id,
            "source_id": src.id,
            "subject_id": src.subject_id,
            "file_path": src.file_path,
            "type": src.kind,
        }))
        .send()
        .await
        .map_err(|e| format!("INGEST_FAILED: {e}"))?
        .error_for_status()
        .map_err(|e| format!("INGEST_FAILED: {e}"))?;

    set_state(pool.inner(), &source_id, "processing", None).await?;

    let pool = pool.inner().clone();
    let (job, sid, subject) = (job_id.clone(), source_id.clone(), src.subject_id.clone());
    tauri::async_runtime::spawn(async move {
        poll_ingest(app, pool, base, token, job, sid, subject).await;
    });

    Ok(JobHandle { job_id })
}

/// Poll the sidecar's ingest status, re-emit it as Tauri events, and on `done`
/// persist the chunks + flip the source to `processed`. Runs as a detached task.
async fn poll_ingest(
    app: AppHandle,
    pool: SqlitePool,
    base: String,
    token: String,
    job_id: String,
    source_id: String,
    subject_id: String,
) {
    let client = reqwest::Client::new();
    loop {
        tokio::time::sleep(Duration::from_millis(300)).await;

        let status: IngestStatusResp = match client
            .get(format!("{base}/ingest/{job_id}/status"))
            .header("X-Arbora-Token", &token)
            .send()
            .await
            .and_then(|r| r.error_for_status())
        {
            Ok(resp) => match resp.json().await {
                Ok(s) => s,
                Err(e) => return fail(&app, &pool, &source_id, &job_id, &e.to_string()).await,
            },
            Err(e) => return fail(&app, &pool, &source_id, &job_id, &e.to_string()).await,
        };

        match status.state.as_str() {
            "done" => {
                finish(&app, &pool, &base, &token, &job_id, &source_id, &subject_id).await;
                return;
            }
            "error" => {
                let msg = status.error.unwrap_or_else(|| "ingest failed".into());
                return fail(&app, &pool, &source_id, &job_id, &msg).await;
            }
            _ => {
                let _ = app.emit(
                    "ingest:progress",
                    serde_json::json!({
                        "source_id": source_id, "job_id": job_id,
                        "progress": status.progress, "step": status.step,
                    }),
                );
            }
        }
    }
}

async fn finish(
    app: &AppHandle,
    pool: &SqlitePool,
    base: &str,
    token: &str,
    job_id: &str,
    source_id: &str,
    subject_id: &str,
) {
    let client = reqwest::Client::new();
    let result: Result<IngestResultResp, String> = async {
        client
            .get(format!("{base}/ingest/{job_id}/result"))
            .header("X-Arbora-Token", token)
            .send()
            .await
            .and_then(|r| r.error_for_status())
            .map_err(|e| e.to_string())?
            .json::<IngestResultResp>()
            .await
            .map_err(|e| e.to_string())
    }
    .await;

    let res = match result {
        Ok(r) => r,
        Err(e) => return fail(app, pool, source_id, job_id, &e).await,
    };

    if let Err(e) = insert_chunks(pool, source_id, subject_id, &res.chunks).await {
        return fail(app, pool, source_id, job_id, &e).await;
    }
    if let Err(e) = mark_processed(pool, source_id, res.chunk_count, res.page_count).await {
        return fail(app, pool, source_id, job_id, &e).await;
    }

    let _ = app.emit(
        "ingest:done",
        serde_json::json!({ "source_id": source_id, "job_id": job_id, "chunk_count": res.chunk_count }),
    );
}

async fn fail(app: &AppHandle, pool: &SqlitePool, source_id: &str, job_id: &str, error: &str) {
    let _ = set_state(pool, source_id, "error", Some(error)).await;
    let _ = app.emit(
        "ingest:error",
        serde_json::json!({ "source_id": source_id, "job_id": job_id, "error": error }),
    );
}

// ── Source text viewer + annotations (Drive page) ──────────────────────────

/// One chunk of a source's extracted text, for the in-app viewer. This is the
/// same text the citations point at, so clicking a citation can scroll to and
/// highlight a phrase within it (law #1 — grounding stays visible, no new AI).
#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct SourceChunk {
    pub page: Option<i64>,
    pub timestamp_ms: Option<i64>,
    pub text: String,
}

/// A user highlight (`note` None) or comment (`note` Some) on a source.
#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Annotation {
    pub id: String,
    pub source_id: String,
    pub page: Option<i64>,
    pub quote: String,
    pub note: Option<String>,
    pub color: String,
    pub created_at: String,
}

const ANNOTATION_COLS: &str =
    "SELECT id, source_id, page, quote, note, color, created_at FROM source_annotations";

async fn source_chunks(pool: &SqlitePool, source_id: &str) -> Result<Vec<SourceChunk>, String> {
    sqlx::query_as::<_, SourceChunk>(
        "SELECT page, timestamp_ms, text FROM chunks WHERE source_id = ?1 ORDER BY chunk_index",
    )
    .bind(source_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())
}

async fn list_annotations_db(
    pool: &SqlitePool,
    source_id: &str,
) -> Result<Vec<Annotation>, String> {
    sqlx::query_as::<_, Annotation>(&format!(
        "{ANNOTATION_COLS} WHERE source_id = ?1 ORDER BY created_at"
    ))
    .bind(source_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())
}

async fn add_annotation(
    pool: &SqlitePool,
    source_id: &str,
    page: Option<i64>,
    quote: &str,
    note: Option<String>,
    color: Option<String>,
) -> Result<Annotation, String> {
    let quote = quote.trim();
    if quote.is_empty() {
        return Err("annotation needs a highlighted phrase".to_string());
    }
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO source_annotations (id, source_id, page, quote, note, color, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, COALESCE(?6,'gold'), strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
    )
    .bind(&id)
    .bind(source_id)
    .bind(page)
    .bind(quote)
    .bind(note)
    .bind(color)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    sqlx::query_as::<_, Annotation>(&format!("{ANNOTATION_COLS} WHERE id = ?1"))
        .bind(&id)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())
}

/// Extracted text of a source, chunk by chunk, for the in-app viewer.
#[tauri::command]
pub async fn get_source_chunks(
    pool: State<'_, SqlitePool>,
    source_id: String,
) -> Result<Vec<SourceChunk>, String> {
    source_chunks(pool.inner(), &source_id).await
}

#[tauri::command]
pub async fn list_annotations(
    pool: State<'_, SqlitePool>,
    source_id: String,
) -> Result<Vec<Annotation>, String> {
    list_annotations_db(pool.inner(), &source_id).await
}

#[tauri::command]
pub async fn create_annotation(
    pool: State<'_, SqlitePool>,
    source_id: String,
    page: Option<i64>,
    quote: String,
    note: Option<String>,
    color: Option<String>,
) -> Result<Annotation, String> {
    add_annotation(pool.inner(), &source_id, page, &quote, note, color).await
}

#[tauri::command]
pub async fn delete_annotation(pool: State<'_, SqlitePool>, id: String) -> Result<(), String> {
    sqlx::query("DELETE FROM source_annotations WHERE id = ?1")
        .bind(&id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Drive folders (user-managed source organization) ───────────────────────

/// A user-created Drive folder. Subject-independent: it only groups files for
/// browsing and never influences retrieval (files keep their `subject_id`).
#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct SourceFolder {
    pub id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub created_at: String,
}

const FOLDER_COLS: &str = "SELECT id, parent_id, name, created_at FROM source_folders";

async fn fetch_folder(pool: &SqlitePool, id: &str) -> Result<SourceFolder, String> {
    sqlx::query_as::<_, SourceFolder>(&format!("{FOLDER_COLS} WHERE id = ?1"))
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "FOLDER_NOT_FOUND".to_string())
}

/// The whole folder tree (flat; the UI nests by `parent_id`).
#[tauri::command]
pub async fn list_source_folders(pool: State<'_, SqlitePool>) -> Result<Vec<SourceFolder>, String> {
    sqlx::query_as::<_, SourceFolder>(&format!("{FOLDER_COLS} ORDER BY created_at"))
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_source_folder(
    pool: State<'_, SqlitePool>,
    name: String,
    parent_id: Option<String>,
) -> Result<SourceFolder, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("folder name cannot be empty".to_string());
    }
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO source_folders (id, parent_id, name, created_at)
         VALUES (?1, ?2, ?3, strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
    )
    .bind(&id)
    .bind(parent_id)
    .bind(name)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;
    fetch_folder(pool.inner(), &id).await
}

#[tauri::command]
pub async fn rename_source_folder(
    pool: State<'_, SqlitePool>,
    id: String,
    name: String,
) -> Result<SourceFolder, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("folder name cannot be empty".to_string());
    }
    sqlx::query("UPDATE source_folders SET name = ?2 WHERE id = ?1")
        .bind(&id)
        .bind(name)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    fetch_folder(pool.inner(), &id).await
}

/// Delete a folder (and its subfolders, by cascade). Files inside are detached,
/// never deleted (the `folder_id` FK is `ON DELETE SET NULL`).
#[tauri::command]
pub async fn delete_source_folder(pool: State<'_, SqlitePool>, id: String) -> Result<(), String> {
    sqlx::query("DELETE FROM source_folders WHERE id = ?1")
        .bind(&id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Files assigned to a folder (across all subjects), for the Drive view.
#[tauri::command]
pub async fn list_folder_sources(
    pool: State<'_, SqlitePool>,
    folder_id: String,
) -> Result<Vec<Source>, String> {
    sqlx::query_as::<_, Source>(&format!("{COLS} WHERE folder_id = ?1 ORDER BY created_at"))
        .bind(&folder_id)
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())
}

/// Move a file into a folder (or out of any folder when `folder_id` is null).
#[tauri::command]
pub async fn set_source_folder(
    pool: State<'_, SqlitePool>,
    source_id: String,
    folder_id: Option<String>,
) -> Result<Source, String> {
    sqlx::query("UPDATE sources SET folder_id = ?2 WHERE id = ?1")
        .bind(&source_id)
        .bind(folder_id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    fetch_source(pool.inner(), &source_id).await
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
        sqlx::query("INSERT INTO subjects (id, name, color, created_at, updated_at) VALUES ('subj1','S','#000','t','t')")
            .execute(&pool)
            .await
            .unwrap();
        pool
    }

    #[test]
    fn detect_type_maps_extensions() {
        assert_eq!(detect_type("a/b.pdf").unwrap(), "pdf");
        assert_eq!(detect_type("DECK.PPTX").unwrap(), "slide");
        assert_eq!(detect_type("rec.m4a").unwrap(), "audio");
        assert_eq!(detect_type("lecture.mp4").unwrap(), "audio");
        assert_eq!(detect_type("lecture.mkv").unwrap(), "audio");
        assert_eq!(detect_type("essay.docx").unwrap(), "doc");
        assert_eq!(detect_type("notes.txt").unwrap(), "text");
        assert_eq!(detect_type("README.md").unwrap(), "text");
        assert!(detect_type("archive.zip").is_err());
    }

    #[tokio::test]
    async fn source_lifecycle() {
        let pool = mem_pool().await;

        let src = insert(&pool, "subj1", "/docs/Genetics.pdf", None)
            .await
            .unwrap();
        assert_eq!(src.kind, "pdf");
        assert_eq!(src.title, "Genetics");
        assert_eq!(src.ingest_state, "queued");
        assert_eq!(list(&pool, "subj1").await.unwrap().len(), 1);

        let renamed = rename(&pool, &src.id, "  Molecular Genetics  ")
            .await
            .unwrap();
        assert_eq!(renamed.title, "Molecular Genetics", "trimmed and persisted");
        assert!(
            rename(&pool, &src.id, "   ").await.is_err(),
            "blank title rejected"
        );

        set_state(&pool, &src.id, "error", Some("boom"))
            .await
            .unwrap();
        assert_eq!(
            fetch_source(&pool, &src.id).await.unwrap().error.as_deref(),
            Some("boom")
        );

        let chunks = vec![
            ChunkRow {
                text: "a".into(),
                page: Some(1),
                timestamp_ms: None,
                faiss_id: 0,
                chunk_index: 0,
            },
            ChunkRow {
                text: "b".into(),
                page: Some(2),
                timestamp_ms: None,
                faiss_id: 1,
                chunk_index: 1,
            },
        ];
        insert_chunks(&pool, &src.id, "subj1", &chunks)
            .await
            .unwrap();
        mark_processed(&pool, &src.id, 2, Some(2)).await.unwrap();

        let done = fetch_source(&pool, &src.id).await.unwrap();
        assert_eq!(done.ingest_state, "processed");
        assert_eq!(done.chunk_count, Some(2));
        assert_eq!(done.page_count, Some(2));
        assert!(done.error.is_none());

        let (n,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM chunks WHERE source_id = ?1")
            .bind(&src.id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(n, 2);

        delete_source_db(&pool, &src.id).await;
        assert!(list(&pool, "subj1").await.unwrap().is_empty());
        let (n,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM chunks")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(n, 0, "chunks cascade on source delete");
    }

    // Mirrors the delete_source command body (the command itself needs Tauri State).
    async fn delete_source_db(pool: &SqlitePool, id: &str) {
        sqlx::query("DELETE FROM sources WHERE id = ?1")
            .bind(id)
            .execute(pool)
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn viewer_chunks_and_annotations() {
        let pool = mem_pool().await;
        let src = insert(&pool, "subj1", "/docs/Notes.pdf", None)
            .await
            .unwrap();
        insert_chunks(
            &pool,
            &src.id,
            "subj1",
            &[
                ChunkRow {
                    text: "Mitochondria are the powerhouse.".into(),
                    page: Some(1),
                    timestamp_ms: None,
                    faiss_id: 0,
                    chunk_index: 0,
                },
                ChunkRow {
                    text: "Ribosomes build proteins.".into(),
                    page: Some(2),
                    timestamp_ms: None,
                    faiss_id: 1,
                    chunk_index: 1,
                },
            ],
        )
        .await
        .unwrap();

        // Chunks come back in reading order for the viewer.
        let chunks = source_chunks(&pool, &src.id).await.unwrap();
        assert_eq!(chunks.len(), 2);
        assert_eq!(chunks[0].page, Some(1));
        assert!(chunks[0].text.contains("powerhouse"));

        // Highlight + comment lifecycle.
        assert!(add_annotation(&pool, &src.id, Some(1), "   ", None, None)
            .await
            .is_err());
        let hi = add_annotation(&pool, &src.id, Some(1), "powerhouse", None, None)
            .await
            .unwrap();
        assert_eq!(hi.color, "gold");
        assert!(hi.note.is_none());
        add_annotation(
            &pool,
            &src.id,
            Some(2),
            "proteins",
            Some("key term".into()),
            Some("mint".into()),
        )
        .await
        .unwrap();

        let anns = list_annotations_db(&pool, &src.id).await.unwrap();
        assert_eq!(anns.len(), 2);

        sqlx::query("DELETE FROM source_annotations WHERE id = ?1")
            .bind(&hi.id)
            .execute(&pool)
            .await
            .unwrap();
        assert_eq!(list_annotations_db(&pool, &src.id).await.unwrap().len(), 1);

        // Annotations cascade when the source is deleted.
        delete_source_db(&pool, &src.id).await;
        assert!(list_annotations_db(&pool, &src.id)
            .await
            .unwrap()
            .is_empty());
    }

    #[tokio::test]
    async fn folder_tree_and_detach_on_delete() {
        let pool = mem_pool().await;

        // A folder + a subfolder nested under it.
        sqlx::query(
            "INSERT INTO source_folders (id, parent_id, name, created_at)
             VALUES ('f1', NULL, 'Readings', 't'), ('f2', 'f1', 'Week 1', 't')",
        )
        .execute(&pool)
        .await
        .unwrap();

        // A file assigned to the subfolder keeps its subject.
        let src = insert(&pool, "subj1", "/docs/Paper.pdf", Some("f2"))
            .await
            .unwrap();
        assert_eq!(src.folder_id.as_deref(), Some("f2"));
        assert_eq!(
            folder_sources(&pool, "f2").await.len(),
            1,
            "file shows up in its folder"
        );

        // Deleting the parent cascades the subfolder but only DETACHES the file.
        sqlx::query("DELETE FROM source_folders WHERE id = 'f1'")
            .execute(&pool)
            .await
            .unwrap();
        let (folders,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM source_folders")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(folders, 0, "subfolder cascaded with its parent");
        let after = fetch_source(&pool, &src.id).await.unwrap();
        assert_eq!(after.folder_id, None, "file detached, not deleted");
    }

    // Mirrors the list_folder_sources command body (the command needs Tauri State).
    async fn folder_sources(pool: &SqlitePool, folder_id: &str) -> Vec<Source> {
        sqlx::query_as::<_, Source>(&format!("{COLS} WHERE folder_id = ?1 ORDER BY created_at"))
            .bind(folder_id)
            .fetch_all(pool)
            .await
            .unwrap()
    }
}
