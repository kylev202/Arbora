//! Practice tests. `generate_test` gathers a subject's (optionally week-scoped)
//! chunks, starts the sidecar's grounded `/test/generate` job, and emits the
//! finished items on `test:done` with titled citations attached. Test items are
//! ephemeral — shown for one session, never persisted — so the review gate
//! doesn't apply (law #2 covers stored deck items; same posture as /chat and
//! /diagram). Citations stay authoritative from chunk metadata (law #1).
//! `grade_test_answer` proxies one structured grading call for free-text kinds.

use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::SqlitePool;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use super::chat::{fetch_preset, source_title};
use super::JobHandle;
use crate::sidecar::Sidecar;

// ── Chunk fetch (week-scoped when a week is given) ─────────────────────────

#[derive(sqlx::FromRow)]
struct ChunkForTest {
    source_id: String,
    text: String,
    page: Option<i64>,
    timestamp_ms: Option<i64>,
    chunk_index: i64,
}

async fn fetch_test_chunks(
    pool: &SqlitePool,
    subject_id: &str,
    week_id: Option<&str>,
) -> Result<Vec<ChunkForTest>, String> {
    let rows = match week_id {
        Some(week) => {
            sqlx::query_as::<_, ChunkForTest>(
                "SELECT c.source_id, c.text, c.page, c.timestamp_ms, c.chunk_index
                 FROM chunks c JOIN sources s ON s.id = c.source_id
                 WHERE c.subject_id = ?1 AND s.week_id = ?2 AND s.ingest_state = 'processed'
                 ORDER BY s.id, c.chunk_index",
            )
            .bind(subject_id)
            .bind(week)
            .fetch_all(pool)
            .await
        }
        None => {
            sqlx::query_as::<_, ChunkForTest>(
                "SELECT c.source_id, c.text, c.page, c.timestamp_ms, c.chunk_index
                 FROM chunks c JOIN sources s ON s.id = c.source_id
                 WHERE c.subject_id = ?1 AND s.ingest_state = 'processed'
                 ORDER BY s.id, c.chunk_index",
            )
            .bind(subject_id)
            .fetch_all(pool)
            .await
        }
    };
    rows.map_err(|e| e.to_string())
}

/// Chunks a walkthrough lesson was built from (keys recorded at generation
/// time, see `walkthrough.rs`) — the journey's practice questions are scoped to
/// exactly the material the lesson taught.
async fn fetch_lesson_chunks(
    pool: &SqlitePool,
    lesson_id: &str,
) -> Result<Vec<ChunkForTest>, String> {
    sqlx::query_as::<_, ChunkForTest>(
        "SELECT c.source_id, c.text, c.page, c.timestamp_ms, c.chunk_index
         FROM walkthrough_lesson_chunks lc
         JOIN chunks c ON c.source_id = lc.source_id AND c.chunk_index = lc.chunk_index
         WHERE lc.lesson_id = ?1
         ORDER BY c.source_id, c.chunk_index",
    )
    .bind(lesson_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())
}

// ── Sidecar job shapes ──────────────────────────────────────────────────────

#[derive(Deserialize)]
struct TestStatusResp {
    state: String,
    progress: f64,
    items_generated: Option<i64>,
    error: Option<String>,
}

#[derive(Deserialize)]
struct TestResultResp {
    #[serde(default)]
    items: Vec<Value>,
}

// ── Commands ────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn generate_test(
    app: AppHandle,
    pool: State<'_, SqlitePool>,
    sidecar: State<'_, Sidecar>,
    subject_id: String,
    week_id: Option<String>,
    types: Vec<String>,
) -> Result<JobHandle, String> {
    let chunks = fetch_test_chunks(pool.inner(), &subject_id, week_id.as_deref()).await?;
    if chunks.is_empty() {
        return Err("NO_CHUNKS".to_string());
    }
    let base = sidecar
        .base_url()
        .filter(|_| sidecar.is_ready())
        .ok_or("SIDECAR_UNAVAILABLE")?;
    let token = sidecar.token().to_string();
    let preset = fetch_preset(pool.inner()).await;
    let job_id = Uuid::new_v4().to_string();

    let chunk_json: Vec<_> = chunks
        .iter()
        .map(|c| {
            json!({
                "source_id": c.source_id, "text": c.text,
                "page": c.page, "timestamp_ms": c.timestamp_ms, "chunk_index": c.chunk_index,
            })
        })
        .collect();

    reqwest::Client::new()
        .post(format!("{base}/test/generate"))
        .header("X-Arbora-Token", &token)
        .json(&json!({
            "job_id": job_id, "subject_id": subject_id, "types": types,
            "chunks": chunk_json, "llm_config": { "provider": "ollama" }, "preset": preset,
        }))
        .send()
        .await
        .map_err(|e| format!("TEST_FAILED: {e}"))?
        .error_for_status()
        .map_err(|e| format!("TEST_FAILED: {e}"))?;

    let pool = pool.inner().clone();
    let job = job_id.clone();
    tauri::async_runtime::spawn(async move {
        poll_test(app, pool, base, token, job).await;
    });

    Ok(JobHandle { job_id })
}

/// Journey checkpoint questions: one item per requested kind, built only from
/// the chunks the lesson was generated from. Same ephemeral posture and
/// `test:*` events as `generate_test` — items are shown once, never persisted.
#[tauri::command]
pub async fn generate_lesson_test(
    app: AppHandle,
    pool: State<'_, SqlitePool>,
    sidecar: State<'_, Sidecar>,
    subject_id: String,
    lesson_id: String,
    types: Vec<String>,
) -> Result<JobHandle, String> {
    let chunks = fetch_lesson_chunks(pool.inner(), &lesson_id).await?;
    if chunks.is_empty() {
        return Err("NO_CHUNKS".to_string());
    }
    let base = sidecar
        .base_url()
        .filter(|_| sidecar.is_ready())
        .ok_or("SIDECAR_UNAVAILABLE")?;
    let token = sidecar.token().to_string();
    let preset = fetch_preset(pool.inner()).await;
    let job_id = Uuid::new_v4().to_string();

    let chunk_json: Vec<_> = chunks
        .iter()
        .map(|c| {
            json!({
                "source_id": c.source_id, "text": c.text,
                "page": c.page, "timestamp_ms": c.timestamp_ms, "chunk_index": c.chunk_index,
            })
        })
        .collect();

    reqwest::Client::new()
        .post(format!("{base}/test/generate"))
        .header("X-Arbora-Token", &token)
        .json(&json!({
            "job_id": job_id, "subject_id": subject_id, "types": types,
            "count_per_type": 1, "chunks": chunk_json,
            "llm_config": { "provider": "ollama" }, "preset": preset,
        }))
        .send()
        .await
        .map_err(|e| format!("TEST_FAILED: {e}"))?
        .error_for_status()
        .map_err(|e| format!("TEST_FAILED: {e}"))?;

    let pool = pool.inner().clone();
    let job = job_id.clone();
    tauri::async_runtime::spawn(async move {
        poll_test(app, pool, base, token, job).await;
    });

    Ok(JobHandle { job_id })
}

async fn poll_test(app: AppHandle, pool: SqlitePool, base: String, token: String, job_id: String) {
    let client = reqwest::Client::new();
    loop {
        tokio::time::sleep(Duration::from_millis(300)).await;

        let status: TestStatusResp = match client
            .get(format!("{base}/test/generate/{job_id}/status"))
            .header("X-Arbora-Token", &token)
            .send()
            .await
            .and_then(|r| r.error_for_status())
        {
            Ok(resp) => match resp.json().await {
                Ok(s) => s,
                Err(e) => return emit_test_error(&app, &job_id, &e.to_string()),
            },
            Err(e) => return emit_test_error(&app, &job_id, &e.to_string()),
        };

        match status.state.as_str() {
            "done" => {
                finish_test(&app, &pool, &base, &token, &job_id).await;
                return;
            }
            "error" => {
                return emit_test_error(
                    &app,
                    &job_id,
                    &status
                        .error
                        .unwrap_or_else(|| "test generation failed".into()),
                )
            }
            _ => {
                let _ = app.emit(
                    "test:progress",
                    json!({ "job_id": job_id, "progress": status.progress, "items_generated": status.items_generated }),
                );
            }
        }
    }
}

async fn finish_test(app: &AppHandle, pool: &SqlitePool, base: &str, token: &str, job_id: &str) {
    let client = reqwest::Client::new();
    let result: Result<TestResultResp, String> = async {
        client
            .get(format!("{base}/test/generate/{job_id}/result"))
            .header("X-Arbora-Token", token)
            .send()
            .await
            .and_then(|r| r.error_for_status())
            .map_err(|e| e.to_string())?
            .json::<TestResultResp>()
            .await
            .map_err(|e| e.to_string())
    }
    .await;

    let mut res = match result {
        Ok(r) => r,
        Err(e) => return emit_test_error(app, job_id, &e),
    };
    if res.items.is_empty() {
        return emit_test_error(app, job_id, "NO_ITEMS: couldn't ground any test items");
    }
    for item in &mut res.items {
        attach_source_title(pool, item).await;
    }
    let _ = app.emit("test:done", json!({ "job_id": job_id, "items": res.items }));
}

/// The UI's `SourceRef` carries a display title; the sidecar's doesn't. Join it
/// in from the `sources` table so every item renders a `CitationChip` directly.
async fn attach_source_title(pool: &SqlitePool, item: &mut Value) {
    let Some(r) = item.get_mut("source_ref") else {
        return;
    };
    let sid = r
        .get("source_id")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();
    let title = source_title(pool, &sid).await;
    r["source_title"] = json!(title);
}

fn emit_test_error(app: &AppHandle, job_id: &str, error: &str) {
    let _ = app.emit("test:error", json!({ "job_id": job_id, "error": error }));
}

// ── Free-text grading (short answer / Feynman) ──────────────────────────────

#[derive(Serialize, Deserialize)]
pub struct TestGrade {
    pub verdict: String, // "correct" | "partial" | "incorrect"
    pub feedback: String,
}

#[tauri::command]
pub async fn grade_test_answer(
    pool: State<'_, SqlitePool>,
    sidecar: State<'_, Sidecar>,
    question: String,
    expected: String,
    user_answer: String,
) -> Result<TestGrade, String> {
    let base = sidecar
        .base_url()
        .filter(|_| sidecar.is_ready())
        .ok_or("SIDECAR_UNAVAILABLE")?;
    let token = sidecar.token().to_string();
    let preset = fetch_preset(pool.inner()).await;

    reqwest::Client::new()
        .post(format!("{base}/test/grade"))
        .header("X-Arbora-Token", &token)
        .json(&json!({
            "question": question, "expected": expected,
            "user_answer": user_answer, "preset": preset,
        }))
        .send()
        .await
        .map_err(|e| format!("GRADE_FAILED: {e}"))?
        .error_for_status()
        .map_err(|e| format!("GRADE_FAILED: {e}"))?
        .json::<TestGrade>()
        .await
        .map_err(|e| format!("GRADE_FAILED: {e}"))
}

// ── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn seeded_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        sqlx::query("INSERT INTO subjects (id,name,color,created_at,updated_at) VALUES ('s1','Bio','#000','t','t')")
            .execute(&pool).await.unwrap();
        sqlx::query(
            "INSERT INTO weeks (id,subject_id,week_number,created_at) VALUES ('w1','s1',1,'t')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query("INSERT INTO sources (id,subject_id,type,file_path,title,ingest_state,week_id,created_at) VALUES ('src1','s1','pdf','/a.pdf','A','processed','w1','t')")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO sources (id,subject_id,type,file_path,title,ingest_state,created_at) VALUES ('src2','s1','pdf','/b.pdf','B','processed','t')")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO chunks (id,source_id,subject_id,text,page,faiss_id,chunk_index) VALUES ('c1','src1','s1','week one text',1,0,0)")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO chunks (id,source_id,subject_id,text,page,faiss_id,chunk_index) VALUES ('c2','src2','s1','unassigned text',1,1,0)")
            .execute(&pool).await.unwrap();
        pool
    }

    #[tokio::test]
    async fn week_scoped_chunks_only_include_that_week() {
        let pool = seeded_pool().await;
        let chunks = fetch_test_chunks(&pool, "s1", Some("w1")).await.unwrap();
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].text, "week one text");
    }

    #[tokio::test]
    async fn subject_wide_chunks_include_everything_processed() {
        let pool = seeded_pool().await;
        let chunks = fetch_test_chunks(&pool, "s1", None).await.unwrap();
        assert_eq!(chunks.len(), 2);
    }

    #[tokio::test]
    async fn lesson_chunks_follow_recorded_keys() {
        let pool = seeded_pool().await;
        sqlx::query("INSERT INTO week_walkthroughs (id,subject_id,week_id,overview,reviewed,created_at) VALUES ('wt1','s1','w1','o',0,'t')")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO walkthrough_lessons (id,walkthrough_id,lesson_index,title,content,reviewed) VALUES ('l1','wt1',0,'T','c',0)")
            .execute(&pool).await.unwrap();
        // The lesson was built from src1's chunk 0 only — src2's chunk stays out.
        sqlx::query("INSERT INTO walkthrough_lesson_chunks (lesson_id,source_id,chunk_index) VALUES ('l1','src1',0)")
            .execute(&pool).await.unwrap();

        let chunks = fetch_lesson_chunks(&pool, "l1").await.unwrap();
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].text, "week one text");
        assert!(fetch_lesson_chunks(&pool, "nope").await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn attach_source_title_joins_the_sources_table() {
        let pool = seeded_pool().await;
        let mut item = json!({
            "kind": "short_answer",
            "question": "Q",
            "expected_answer": "A",
            "source_ref": { "source_id": "src1", "location": {"type":"page","page":1}, "excerpt": "week one" }
        });
        attach_source_title(&pool, &mut item).await;
        assert_eq!(item["source_ref"]["source_title"], "A");
    }
}
