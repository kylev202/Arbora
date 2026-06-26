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
    pub added_at: String,
}

const COLS: &str = "SELECT id, subject_id, type AS kind, title, file_path, ingest_state, \
    page_count, chunk_count, ingest_error AS error, week_id, created_at AS added_at FROM sources";

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
        "mp3" | "m4a" | "wav" | "ogg" | "flac" | "aac" => Ok("audio"),
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

async fn insert(pool: &SqlitePool, subject_id: &str, file_path: &str) -> Result<Source, String> {
    let kind = detect_type(file_path)?;
    let title = Path::new(file_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .map(str::to_string)
        .unwrap_or_else(|| file_path.to_string());
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO sources (id, subject_id, type, file_path, title, ingest_state, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'queued', strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
    )
    .bind(&id)
    .bind(subject_id)
    .bind(kind)
    .bind(file_path)
    .bind(&title)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    fetch_source(pool, &id).await
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
) -> Result<Source, String> {
    insert(pool.inner(), &subject_id, &file_path).await
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
        assert!(detect_type("notes.txt").is_err());
    }

    #[tokio::test]
    async fn source_lifecycle() {
        let pool = mem_pool().await;

        let src = insert(&pool, "subj1", "/docs/Genetics.pdf").await.unwrap();
        assert_eq!(src.kind, "pdf");
        assert_eq!(src.title, "Genetics");
        assert_eq!(src.ingest_state, "queued");
        assert_eq!(list(&pool, "subj1").await.unwrap().len(), 1);

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
}
