//! Week walkthrough — the guided week journey. `generate_week_walkthrough`
//! gathers the week's chunks, starts the sidecar's grounded `/walkthrough` job,
//! and (via a background poller) persists the overview + lesson notes with
//! `reviewed = 0` (law #2). The gate is inline: reading a note in the journey IS
//! the review, so `approve_*` flips single notes and `delete_week_walkthrough`
//! is the reject/regenerate primitive. Citations stay authoritative (law #1/#3);
//! each lesson also records the chunk keys it was built from so practice
//! questions can be scoped to exactly that material (see `assess.rs`).

use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::SqlitePool;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use super::chat::fetch_preset;
use super::JobHandle;
use crate::sidecar::Sidecar;

// ── Chunk fetch (week-scoped, processed sources only) ──────────────────────

#[derive(sqlx::FromRow)]
struct ChunkForWalkthrough {
    source_id: String,
    text: String,
    page: Option<i64>,
    timestamp_ms: Option<i64>,
    chunk_index: i64,
}

async fn fetch_week_chunks(
    pool: &SqlitePool,
    subject_id: &str,
    week_id: &str,
) -> Result<Vec<ChunkForWalkthrough>, String> {
    sqlx::query_as::<_, ChunkForWalkthrough>(
        "SELECT c.source_id, c.text, c.page, c.timestamp_ms, c.chunk_index
         FROM chunks c JOIN sources s ON s.id = c.source_id
         WHERE c.subject_id = ?1 AND s.week_id = ?2 AND s.ingest_state = 'processed'
         ORDER BY s.id, c.chunk_index",
    )
    .bind(subject_id)
    .bind(week_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())
}

// ── Sidecar /walkthrough result shapes ──────────────────────────────────────

#[derive(Deserialize)]
struct WtLocation {
    #[serde(rename = "type")]
    kind: String,
    page: Option<i64>,
    timestamp_ms: Option<i64>,
}

#[derive(Deserialize)]
struct WtSourceRef {
    source_id: String,
    location: WtLocation,
    excerpt: String,
}

#[derive(Deserialize)]
struct WtChunkKey {
    source_id: String,
    chunk_index: i64,
}

#[derive(Deserialize)]
struct WtLesson {
    title: String,
    content: String,
    source_refs: Vec<WtSourceRef>,
    #[serde(default)]
    chunk_refs: Vec<WtChunkKey>,
}

#[derive(Deserialize)]
struct WtResult {
    overview: String,
    overview_refs: Vec<WtSourceRef>,
    lessons: Vec<WtLesson>,
}

#[derive(Deserialize)]
struct WtStatusResp {
    state: String,
    progress: f64,
    items_generated: Option<i64>,
    error: Option<String>,
}

/// `(page, timestamp_ms)` for SQLite from a sidecar location.
fn loc_parts(loc: &WtLocation) -> (Option<i64>, Option<i64>) {
    if loc.kind == "timestamp" {
        (None, loc.timestamp_ms)
    } else {
        (loc.page, None)
    }
}

// ── Persistence (staged, reviewed = 0; one walkthrough per week) ────────────

async fn insert_walkthrough(
    pool: &SqlitePool,
    subject_id: &str,
    week_id: &str,
    res: WtResult,
) -> Result<i64, String> {
    // Regenerate replaces: the week keeps at most one walkthrough, and a fresh
    // one starts unreviewed and unstarted (cascades clear lessons/refs/chunks).
    sqlx::query("DELETE FROM week_walkthroughs WHERE week_id = ?1")
        .bind(week_id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    let walkthrough_id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO week_walkthroughs (id, subject_id, week_id, overview, reviewed, created_at)
         VALUES (?1, ?2, ?3, ?4, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
    )
    .bind(&walkthrough_id)
    .bind(subject_id)
    .bind(week_id)
    .bind(&res.overview)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    for r in &res.overview_refs {
        let (page, ts) = loc_parts(&r.location);
        sqlx::query(
            "INSERT INTO walkthrough_overview_refs (id, walkthrough_id, source_id, page, timestamp_ms, excerpt)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(&walkthrough_id)
        .bind(&r.source_id)
        .bind(page)
        .bind(ts)
        .bind(&r.excerpt)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }

    let count = 1 + res.lessons.len() as i64;
    for (idx, lesson) in res.lessons.into_iter().enumerate() {
        let lesson_id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO walkthrough_lessons (id, walkthrough_id, lesson_index, title, content, reviewed)
             VALUES (?1, ?2, ?3, ?4, ?5, 0)",
        )
        .bind(&lesson_id)
        .bind(&walkthrough_id)
        .bind(idx as i64)
        .bind(&lesson.title)
        .bind(&lesson.content)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

        for r in &lesson.source_refs {
            let (page, ts) = loc_parts(&r.location);
            sqlx::query(
                "INSERT INTO walkthrough_lesson_refs (id, lesson_id, source_id, page, timestamp_ms, excerpt)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            )
            .bind(Uuid::new_v4().to_string())
            .bind(&lesson_id)
            .bind(&r.source_id)
            .bind(page)
            .bind(ts)
            .bind(&r.excerpt)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
        }

        for key in &lesson.chunk_refs {
            sqlx::query(
                "INSERT OR IGNORE INTO walkthrough_lesson_chunks (lesson_id, source_id, chunk_index)
                 VALUES (?1, ?2, ?3)",
            )
            .bind(&lesson_id)
            .bind(&key.source_id)
            .bind(key.chunk_index)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    Ok(count)
}

// ── Generate command + poller ───────────────────────────────────────────────

#[tauri::command]
pub async fn generate_week_walkthrough(
    app: AppHandle,
    pool: State<'_, SqlitePool>,
    sidecar: State<'_, Sidecar>,
    subject_id: String,
    week_id: String,
) -> Result<JobHandle, String> {
    let week_title: String =
        sqlx::query_as::<_, (String,)>("SELECT title FROM weeks WHERE id = ?1 AND subject_id = ?2")
            .bind(&week_id)
            .bind(&subject_id)
            .fetch_optional(pool.inner())
            .await
            .map_err(|e| e.to_string())?
            .map(|(t,)| t)
            .ok_or("WEEK_NOT_FOUND")?;

    let chunks = fetch_week_chunks(pool.inner(), &subject_id, &week_id).await?;
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
        .post(format!("{base}/walkthrough"))
        .header("X-Arbora-Token", &token)
        .json(&json!({
            "job_id": job_id, "subject_id": subject_id, "week_id": week_id,
            "week_title": week_title, "chunks": chunk_json,
            "llm_config": { "provider": "ollama" }, "preset": preset,
        }))
        .send()
        .await
        .map_err(|e| format!("WALKTHROUGH_FAILED: {e}"))?
        .error_for_status()
        .map_err(|e| format!("WALKTHROUGH_FAILED: {e}"))?;

    let pool = pool.inner().clone();
    let (job, subj, week) = (job_id.clone(), subject_id.clone(), week_id.clone());
    tauri::async_runtime::spawn(async move {
        poll_walkthrough(app, pool, base, token, job, subj, week).await;
    });

    Ok(JobHandle { job_id })
}

#[allow(clippy::too_many_arguments)]
async fn poll_walkthrough(
    app: AppHandle,
    pool: SqlitePool,
    base: String,
    token: String,
    job_id: String,
    subject_id: String,
    week_id: String,
) {
    let client = reqwest::Client::new();
    loop {
        tokio::time::sleep(Duration::from_millis(300)).await;

        let status: WtStatusResp = match client
            .get(format!("{base}/walkthrough/{job_id}/status"))
            .header("X-Arbora-Token", &token)
            .send()
            .await
            .and_then(|r| r.error_for_status())
        {
            Ok(resp) => match resp.json().await {
                Ok(s) => s,
                Err(e) => return emit_wt_error(&app, &job_id, &e.to_string()),
            },
            Err(e) => return emit_wt_error(&app, &job_id, &e.to_string()),
        };

        match status.state.as_str() {
            "done" => {
                finish_walkthrough(&app, &pool, &base, &token, &job_id, &subject_id, &week_id)
                    .await;
                return;
            }
            "error" => {
                return emit_wt_error(
                    &app,
                    &job_id,
                    &status
                        .error
                        .unwrap_or_else(|| "walkthrough generation failed".into()),
                )
            }
            _ => {
                let _ = app.emit(
                    "walkthrough:progress",
                    json!({ "job_id": job_id, "progress": status.progress, "items_generated": status.items_generated }),
                );
            }
        }
    }
}

#[allow(clippy::too_many_arguments)]
async fn finish_walkthrough(
    app: &AppHandle,
    pool: &SqlitePool,
    base: &str,
    token: &str,
    job_id: &str,
    subject_id: &str,
    week_id: &str,
) {
    let client = reqwest::Client::new();
    let result: Result<WtResult, String> = async {
        client
            .get(format!("{base}/walkthrough/{job_id}/result"))
            .header("X-Arbora-Token", token)
            .send()
            .await
            .and_then(|r| r.error_for_status())
            .map_err(|e| e.to_string())?
            .json::<WtResult>()
            .await
            .map_err(|e| e.to_string())
    }
    .await;

    let res = match result {
        Ok(r) => r,
        Err(e) => return emit_wt_error(app, job_id, &e),
    };
    match insert_walkthrough(pool, subject_id, week_id, res).await {
        Ok(count) => {
            let _ = app.emit(
                "walkthrough:done",
                json!({ "job_id": job_id, "items_generated": count }),
            );
        }
        Err(e) => emit_wt_error(app, job_id, &e),
    }
}

fn emit_wt_error(app: &AppHandle, job_id: &str, error: &str) {
    let _ = app.emit(
        "walkthrough:error",
        json!({ "job_id": job_id, "error": error }),
    );
}

// ── Wire shapes (mirror TS WeekWalkthrough / WalkthroughLesson) ─────────────

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
enum LocationOut {
    Page { page: i64 },
    Timestamp { timestamp_ms: i64 },
}

fn loc(page: Option<i64>, timestamp_ms: Option<i64>) -> LocationOut {
    match timestamp_ms {
        Some(ms) => LocationOut::Timestamp { timestamp_ms: ms },
        None => LocationOut::Page {
            page: page.unwrap_or(0),
        },
    }
}

#[derive(Serialize)]
struct SourceRefOut {
    source_id: String,
    source_title: String,
    location: LocationOut,
    excerpt: String,
}

#[derive(Serialize)]
pub struct LessonOut {
    id: String,
    lesson_index: i64,
    title: String,
    content: String,
    reviewed: bool,
    completed_at: Option<String>,
    source_refs: Vec<SourceRefOut>,
}

#[derive(Serialize)]
pub struct WalkthroughOut {
    id: String,
    subject_id: String,
    week_id: String,
    overview: String,
    overview_refs: Vec<SourceRefOut>,
    reviewed: bool,
    completed_at: Option<String>,
    lessons: Vec<LessonOut>,
}

#[derive(sqlx::FromRow)]
struct WalkthroughRow {
    id: String,
    subject_id: String,
    week_id: String,
    overview: String,
    reviewed: i64,
    completed_at: Option<String>,
}

#[derive(sqlx::FromRow)]
struct LessonRow {
    id: String,
    lesson_index: i64,
    title: String,
    content: String,
    reviewed: i64,
    completed_at: Option<String>,
}

#[derive(sqlx::FromRow)]
struct RefRow {
    source_id: String,
    page: Option<i64>,
    timestamp_ms: Option<i64>,
    excerpt: String,
    source_title: String,
}

fn refs_out(rows: Vec<RefRow>) -> Vec<SourceRefOut> {
    rows.into_iter()
        .map(|r| SourceRefOut {
            source_id: r.source_id,
            source_title: r.source_title,
            location: loc(r.page, r.timestamp_ms),
            excerpt: r.excerpt,
        })
        .collect()
}

// ── Read + gate + progress ──────────────────────────────────────────────────

async fn get_walkthrough_db(
    pool: &SqlitePool,
    subject_id: &str,
    week_id: &str,
) -> Result<Option<WalkthroughOut>, String> {
    let Some(w) = sqlx::query_as::<_, WalkthroughRow>(
        "SELECT id, subject_id, week_id, overview, reviewed, completed_at
         FROM week_walkthroughs WHERE subject_id = ?1 AND week_id = ?2",
    )
    .bind(subject_id)
    .bind(week_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    else {
        return Ok(None);
    };

    let overview_refs = sqlx::query_as::<_, RefRow>(
        "SELECT r.source_id, r.page, r.timestamp_ms, r.excerpt, s.title AS source_title
         FROM walkthrough_overview_refs r JOIN sources s ON s.id = r.source_id
         WHERE r.walkthrough_id = ?1",
    )
    .bind(&w.id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let lesson_rows = sqlx::query_as::<_, LessonRow>(
        "SELECT id, lesson_index, title, content, reviewed, completed_at
         FROM walkthrough_lessons WHERE walkthrough_id = ?1 ORDER BY lesson_index",
    )
    .bind(&w.id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut lessons = Vec::with_capacity(lesson_rows.len());
    for l in lesson_rows {
        let refs = sqlx::query_as::<_, RefRow>(
            "SELECT r.source_id, r.page, r.timestamp_ms, r.excerpt, s.title AS source_title
             FROM walkthrough_lesson_refs r JOIN sources s ON s.id = r.source_id
             WHERE r.lesson_id = ?1",
        )
        .bind(&l.id)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
        lessons.push(LessonOut {
            id: l.id,
            lesson_index: l.lesson_index,
            title: l.title,
            content: l.content,
            reviewed: l.reviewed != 0,
            completed_at: l.completed_at,
            source_refs: refs_out(refs),
        });
    }

    Ok(Some(WalkthroughOut {
        id: w.id,
        subject_id: w.subject_id,
        week_id: w.week_id,
        overview: w.overview,
        overview_refs: refs_out(overview_refs),
        reviewed: w.reviewed != 0,
        completed_at: w.completed_at,
        lessons,
    }))
}

#[tauri::command]
pub async fn get_week_walkthrough(
    pool: State<'_, SqlitePool>,
    subject_id: String,
    week_id: String,
) -> Result<Option<WalkthroughOut>, String> {
    get_walkthrough_db(pool.inner(), &subject_id, &week_id).await
}

/// Inline gate: the user read the overview note and kept it (law #2).
#[tauri::command]
pub async fn approve_walkthrough_overview(
    pool: State<'_, SqlitePool>,
    walkthrough_id: String,
) -> Result<(), String> {
    sqlx::query("UPDATE week_walkthroughs SET reviewed = 1 WHERE id = ?1")
        .bind(&walkthrough_id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Inline gate: the user read this lesson's note and kept it (law #2).
#[tauri::command]
pub async fn approve_walkthrough_lesson(
    pool: State<'_, SqlitePool>,
    lesson_id: String,
) -> Result<(), String> {
    sqlx::query("UPDATE walkthrough_lessons SET reviewed = 1 WHERE id = ?1")
        .bind(&lesson_id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Journey progress: the lesson checkpoint (note + practice questions) is done.
#[tauri::command]
pub async fn complete_walkthrough_lesson(
    pool: State<'_, SqlitePool>,
    lesson_id: String,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE walkthrough_lessons
         SET completed_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?1",
    )
    .bind(&lesson_id)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Journey progress: every checkpoint (incl. the recall session) is done.
#[tauri::command]
pub async fn complete_walkthrough(
    pool: State<'_, SqlitePool>,
    walkthrough_id: String,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE week_walkthroughs
         SET completed_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?1",
    )
    .bind(&walkthrough_id)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Reject/regenerate primitive: staged (or stale) walkthroughs are deleted, not
/// kept — the user rebuilds a fresh one from the same button.
#[tauri::command]
pub async fn delete_week_walkthrough(
    pool: State<'_, SqlitePool>,
    walkthrough_id: String,
) -> Result<(), String> {
    sqlx::query("DELETE FROM week_walkthroughs WHERE id = ?1")
        .bind(&walkthrough_id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
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
            "INSERT INTO weeks (id,subject_id,week_number,title,created_at) VALUES ('w1','s1',1,'Cells','t')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query("INSERT INTO sources (id,subject_id,type,file_path,title,ingest_state,week_id,created_at) VALUES ('src1','s1','pdf','/a.pdf','Doc A','processed','w1','t')")
            .execute(&pool).await.unwrap();
        pool
    }

    fn page_ref(page: i64) -> WtSourceRef {
        WtSourceRef {
            source_id: "src1".into(),
            location: WtLocation {
                kind: "page".into(),
                page: Some(page),
                timestamp_ms: None,
            },
            excerpt: "cited text".into(),
        }
    }

    fn sample_result() -> WtResult {
        WtResult {
            overview: "The week at a glance.".into(),
            overview_refs: vec![page_ref(1)],
            lessons: vec![
                WtLesson {
                    title: "Lesson one".into(),
                    content: "First idea.".into(),
                    source_refs: vec![page_ref(2)],
                    chunk_refs: vec![
                        WtChunkKey {
                            source_id: "src1".into(),
                            chunk_index: 0,
                        },
                        WtChunkKey {
                            source_id: "src1".into(),
                            chunk_index: 1,
                        },
                    ],
                },
                WtLesson {
                    title: "Lesson two".into(),
                    content: "Second idea.".into(),
                    source_refs: vec![page_ref(3)],
                    chunk_refs: vec![WtChunkKey {
                        source_id: "src1".into(),
                        chunk_index: 2,
                    }],
                },
            ],
        }
    }

    #[tokio::test]
    async fn persists_staged_walkthrough_with_refs_and_chunk_keys() {
        let pool = seeded_pool().await;
        let count = insert_walkthrough(&pool, "s1", "w1", sample_result())
            .await
            .unwrap();
        assert_eq!(count, 3, "overview + two lessons");

        let wt = get_walkthrough_db(&pool, "s1", "w1")
            .await
            .unwrap()
            .unwrap();
        assert!(!wt.reviewed, "staged for the inline gate");
        assert_eq!(wt.overview_refs.len(), 1);
        assert_eq!(wt.lessons.len(), 2);
        assert_eq!(wt.lessons[0].lesson_index, 0);
        assert_eq!(wt.lessons[0].title, "Lesson one");
        assert!(!wt.lessons[0].reviewed);
        assert!(wt.lessons[0].completed_at.is_none());

        let json = serde_json::to_value(&wt).unwrap();
        assert_eq!(json["lessons"][1]["source_refs"][0]["location"]["page"], 3);
        assert_eq!(
            json["lessons"][1]["source_refs"][0]["source_title"],
            "Doc A"
        );

        let (keys,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM walkthrough_lesson_chunks")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(keys, 3, "lesson chunk keys recorded for question scoping");
    }

    #[tokio::test]
    async fn regenerate_replaces_the_weeks_walkthrough() {
        let pool = seeded_pool().await;
        insert_walkthrough(&pool, "s1", "w1", sample_result())
            .await
            .unwrap();
        let first = get_walkthrough_db(&pool, "s1", "w1")
            .await
            .unwrap()
            .unwrap();

        insert_walkthrough(&pool, "s1", "w1", sample_result())
            .await
            .unwrap();
        let second = get_walkthrough_db(&pool, "s1", "w1")
            .await
            .unwrap()
            .unwrap();
        assert_ne!(first.id, second.id, "fresh walkthrough row");

        let (wts, lessons): (i64, i64) = sqlx::query_as(
            "SELECT (SELECT COUNT(*) FROM week_walkthroughs),
                    (SELECT COUNT(*) FROM walkthrough_lessons)",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(wts, 1, "one walkthrough per week");
        assert_eq!(lessons, 2, "old lessons cascaded away");
    }

    #[tokio::test]
    async fn inline_gate_and_progress_flags() {
        let pool = seeded_pool().await;
        insert_walkthrough(&pool, "s1", "w1", sample_result())
            .await
            .unwrap();
        let wt = get_walkthrough_db(&pool, "s1", "w1")
            .await
            .unwrap()
            .unwrap();
        let lesson_id = wt.lessons[0].id.clone();

        sqlx::query("UPDATE week_walkthroughs SET reviewed = 1 WHERE id = ?1")
            .bind(&wt.id)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query(
            "UPDATE walkthrough_lessons SET reviewed = 1, completed_at = 't' WHERE id = ?1",
        )
        .bind(&lesson_id)
        .execute(&pool)
        .await
        .unwrap();

        let wt = get_walkthrough_db(&pool, "s1", "w1")
            .await
            .unwrap()
            .unwrap();
        assert!(wt.reviewed);
        assert!(wt.lessons[0].reviewed);
        assert!(wt.lessons[0].completed_at.is_some());
        assert!(!wt.lessons[1].reviewed, "each note is gated on its own");
    }

    #[tokio::test]
    async fn week_chunks_scoped_to_processed_week_sources() {
        let pool = seeded_pool().await;
        sqlx::query("INSERT INTO chunks (id,source_id,subject_id,text,page,faiss_id,chunk_index) VALUES ('c1','src1','s1','week text',1,0,0)")
            .execute(&pool).await.unwrap();
        // A processed source with no week — must be excluded.
        sqlx::query("INSERT INTO sources (id,subject_id,type,file_path,title,ingest_state,created_at) VALUES ('src2','s1','pdf','/b.pdf','B','processed','t')")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO chunks (id,source_id,subject_id,text,page,faiss_id,chunk_index) VALUES ('c2','src2','s1','loose text',1,1,0)")
            .execute(&pool).await.unwrap();

        let chunks = fetch_week_chunks(&pool, "s1", "w1").await.unwrap();
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].text, "week text");
    }
}
