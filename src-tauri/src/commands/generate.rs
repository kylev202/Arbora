//! Generation. `generate_content` gathers a subject's chunks, sends their text to
//! the sidecar's grounded pipeline, and (via a background poller) persists the
//! returned cards/quiz/notes with `reviewed = 0` — staged for the review gate
//! (law #2), never trusted on arrival. Citations are carried through verbatim
//! (law #1/#3): each item keeps its source_id + page/timestamp + excerpt.

use std::time::Duration;

use serde::Deserialize;
use serde_json::json;
use sqlx::SqlitePool;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use super::JobHandle;
use crate::sidecar::Sidecar;

// ── Chunk fetch (input to generation) ──────────────────────────────────────

#[derive(sqlx::FromRow)]
struct ChunkForGen {
    source_id: String,
    text: String,
    page: Option<i64>,
    timestamp_ms: Option<i64>,
    chunk_index: i64,
}

async fn fetch_chunks(
    pool: &SqlitePool,
    source_ids: &[String],
) -> Result<Vec<ChunkForGen>, String> {
    if source_ids.is_empty() {
        return Ok(vec![]);
    }
    let placeholders = vec!["?"; source_ids.len()].join(",");
    let sql = format!(
        "SELECT source_id, text, page, timestamp_ms, chunk_index FROM chunks
         WHERE source_id IN ({placeholders}) ORDER BY source_id, chunk_index"
    );
    let mut q = sqlx::query_as::<_, ChunkForGen>(&sql);
    for id in source_ids {
        q = q.bind(id);
    }
    q.fetch_all(pool).await.map_err(|e| e.to_string())
}

async fn fetch_preset(pool: &SqlitePool) -> String {
    sqlx::query_as::<_, (String,)>("SELECT ai_preset FROM settings WHERE id = 1")
        .fetch_one(pool)
        .await
        .map(|(p,)| p)
        .unwrap_or_else(|_| "medium".to_string())
}

/// The subject's discipline steers subject-aware prompts in the sidecar.
/// Falls back to 'general' (plain-text output) if the row is missing.
pub(crate) async fn fetch_discipline(pool: &SqlitePool, subject_id: &str) -> String {
    sqlx::query_as::<_, (String,)>("SELECT discipline FROM subjects WHERE id = ?1")
        .bind(subject_id)
        .fetch_one(pool)
        .await
        .map(|(d,)| d)
        .unwrap_or_else(|_| "general".to_string())
}

// ── Sidecar /generate result shapes ────────────────────────────────────────

#[derive(Deserialize)]
struct GenLocation {
    #[serde(rename = "type")]
    kind: String,
    page: Option<i64>,
    timestamp_ms: Option<i64>,
}

#[derive(Deserialize)]
struct GenSourceRef {
    source_id: String,
    location: GenLocation,
    excerpt: String,
}

#[derive(Deserialize)]
struct GenCard {
    front: String,
    back: String,
    explanation: String,
    source_ref: GenSourceRef,
}

#[derive(Deserialize)]
struct GenQuiz {
    question: String,
    options: Vec<String>,
    answer_index: i64,
    explanation: String,
    source_ref: GenSourceRef,
}

#[derive(Deserialize)]
struct GenNote {
    content: String,
    format: String,
    source_refs: Vec<GenSourceRef>,
}

#[derive(Deserialize)]
struct GenResult {
    #[serde(default)]
    cards: Vec<GenCard>,
    #[serde(default)]
    quiz_items: Vec<GenQuiz>,
    #[serde(default)]
    notes: Vec<GenNote>,
}

#[derive(Deserialize)]
struct GenStatusResp {
    state: String,
    progress: f64,
    items_generated: Option<i64>,
    error: Option<String>,
}

/// Result of the `/assignment-brief` job: one brief (Markdown) with a citation
/// per focus point. Mirrors a note — content + several source_refs.
#[derive(Deserialize)]
struct BriefResult {
    content: String,
    #[serde(default)]
    source_refs: Vec<GenSourceRef>,
}

/// `(page, timestamp_ms)` for SQLite from a sidecar location.
fn loc_parts(loc: &GenLocation) -> (Option<i64>, Option<i64>) {
    if loc.kind == "timestamp" {
        (None, loc.timestamp_ms)
    } else {
        (loc.page, None)
    }
}

// ── Persistence (staged, reviewed = 0) ─────────────────────────────────────

async fn insert_generated(
    pool: &SqlitePool,
    subject_id: &str,
    res: GenResult,
) -> Result<(), String> {
    for c in res.cards {
        let (page, ts) = loc_parts(&c.source_ref.location);
        sqlx::query(
            "INSERT INTO cards (id, subject_id, front, back, explanation, source_id, page, timestamp_ms, excerpt, reviewed, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(subject_id)
        .bind(&c.front)
        .bind(&c.back)
        .bind(&c.explanation)
        .bind(&c.source_ref.source_id)
        .bind(page)
        .bind(ts)
        .bind(&c.source_ref.excerpt)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }

    if !res.quiz_items.is_empty() {
        let quiz_id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO quizzes (id, subject_id, title, created_at)
             VALUES (?1, ?2, 'Generated quiz', strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
        )
        .bind(&quiz_id)
        .bind(subject_id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

        for q in res.quiz_items {
            let (page, ts) = loc_parts(&q.source_ref.location);
            let options_json = serde_json::to_string(&q.options).map_err(|e| e.to_string())?;
            sqlx::query(
                "INSERT INTO quiz_items (id, quiz_id, subject_id, question, options_json, answer_index, explanation, source_id, page, timestamp_ms, excerpt, reviewed, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
            )
            .bind(Uuid::new_v4().to_string())
            .bind(&quiz_id)
            .bind(subject_id)
            .bind(&q.question)
            .bind(&options_json)
            .bind(q.answer_index)
            .bind(&q.explanation)
            .bind(&q.source_ref.source_id)
            .bind(page)
            .bind(ts)
            .bind(&q.source_ref.excerpt)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    for n in res.notes {
        let note_id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO notes (id, subject_id, content, format, reviewed, created_at)
             VALUES (?1, ?2, ?3, ?4, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
        )
        .bind(&note_id)
        .bind(subject_id)
        .bind(&n.content)
        .bind(&n.format)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

        for r in n.source_refs {
            let (page, ts) = loc_parts(&r.location);
            sqlx::query(
                "INSERT INTO note_source_refs (id, note_id, source_id, page, timestamp_ms, excerpt)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            )
            .bind(Uuid::new_v4().to_string())
            .bind(&note_id)
            .bind(&r.source_id)
            .bind(page)
            .bind(ts)
            .bind(&r.excerpt)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

// ── Command + poller ───────────────────────────────────────────────────────

#[tauri::command]
pub async fn generate_content(
    app: AppHandle,
    pool: State<'_, SqlitePool>,
    sidecar: State<'_, Sidecar>,
    subject_id: String,
    source_ids: Vec<String>,
    types: Vec<String>,
) -> Result<JobHandle, String> {
    let chunks = fetch_chunks(pool.inner(), &source_ids).await?;
    if chunks.is_empty() {
        return Err("no indexed chunks to generate from".to_string());
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

    let discipline = fetch_discipline(pool.inner(), &subject_id).await;
    reqwest::Client::new()
        .post(format!("{base}/generate"))
        .header("X-Arbora-Token", &token)
        .json(&json!({
            "job_id": job_id, "subject_id": subject_id, "types": types,
            "chunks": chunk_json, "llm_config": { "provider": "ollama" }, "preset": preset,
            "discipline": discipline,
        }))
        .send()
        .await
        .map_err(|e| format!("GENERATION_FAILED: {e}"))?
        .error_for_status()
        .map_err(|e| format!("GENERATION_FAILED: {e}"))?;

    let pool = pool.inner().clone();
    let (job, subj) = (job_id.clone(), subject_id.clone());
    tauri::async_runtime::spawn(async move {
        poll_generate(app, pool, base, token, job, subj).await;
    });

    Ok(JobHandle { job_id })
}

async fn poll_generate(
    app: AppHandle,
    pool: SqlitePool,
    base: String,
    token: String,
    job_id: String,
    subject_id: String,
) {
    let client = reqwest::Client::new();
    loop {
        tokio::time::sleep(Duration::from_millis(300)).await;

        let status: GenStatusResp = match client
            .get(format!("{base}/generate/{job_id}/status"))
            .header("X-Arbora-Token", &token)
            .send()
            .await
            .and_then(|r| r.error_for_status())
        {
            Ok(resp) => match resp.json().await {
                Ok(s) => s,
                Err(e) => return emit_error(&app, &job_id, &e.to_string()),
            },
            Err(e) => return emit_error(&app, &job_id, &e.to_string()),
        };

        match status.state.as_str() {
            "done" => {
                finish_generate(&app, &pool, &base, &token, &job_id, &subject_id).await;
                return;
            }
            "error" => {
                return emit_error(
                    &app,
                    &job_id,
                    &status.error.unwrap_or_else(|| "generation failed".into()),
                )
            }
            _ => {
                let _ = app.emit(
                    "generate:progress",
                    json!({ "job_id": job_id, "progress": status.progress, "items_generated": status.items_generated }),
                );
            }
        }
    }
}

async fn finish_generate(
    app: &AppHandle,
    pool: &SqlitePool,
    base: &str,
    token: &str,
    job_id: &str,
    subject_id: &str,
) {
    let client = reqwest::Client::new();
    let result: Result<GenResult, String> = async {
        client
            .get(format!("{base}/generate/{job_id}/result"))
            .header("X-Arbora-Token", token)
            .send()
            .await
            .and_then(|r| r.error_for_status())
            .map_err(|e| e.to_string())?
            .json::<GenResult>()
            .await
            .map_err(|e| e.to_string())
    }
    .await;

    let res = match result {
        Ok(r) => r,
        Err(e) => return emit_error(app, job_id, &e),
    };
    let count = (res.cards.len() + res.quiz_items.len() + res.notes.len()) as i64;
    if let Err(e) = insert_generated(pool, subject_id, res).await {
        return emit_error(app, job_id, &e);
    }
    let _ = app.emit(
        "generate:done",
        json!({ "job_id": job_id, "items_generated": count }),
    );
}

fn emit_error(app: &AppHandle, job_id: &str, error: &str) {
    let _ = app.emit(
        "generate:error",
        json!({ "job_id": job_id, "error": error }),
    );
}

// ── Assignment study brief (slice 5) ────────────────────────────────────────
// A grounded, cited, review-gated brief for one assignment, generated over the
// chunks of the sources assigned to the weeks the assignment covers. Same
// staged-then-reviewed path as generate_content; persisted reviewed = 0.

/// Cap the chunks sent to the sidecar so a brief stays focused and the job
/// stays bounded on weak hardware.
const MAX_BRIEF_CHUNKS: i64 = 20;

async fn fetch_assignment_title(
    pool: &SqlitePool,
    deadline_id: &str,
    subject_id: &str,
) -> Result<String, String> {
    sqlx::query_as::<_, (String,)>("SELECT title FROM deadlines WHERE id = ?1 AND subject_id = ?2")
        .bind(deadline_id)
        .bind(subject_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .map(|(t,)| t)
        .ok_or_else(|| "DEADLINE_NOT_FOUND".to_string())
}

/// Chunks for the brief: the assignment's own uploaded spec/rubric sources
/// (`deadline_sources`) first — the most on-point material when present — then
/// the processed sources assigned to the weeks the assignment covers. EXISTS
/// (not JOIN) so a source matching both arms, or linked as both spec and
/// rubric, never duplicates its chunks.
async fn fetch_brief_chunks(
    pool: &SqlitePool,
    deadline_id: &str,
) -> Result<Vec<ChunkForGen>, String> {
    sqlx::query_as::<_, ChunkForGen>(
        "SELECT c.source_id, c.text, c.page, c.timestamp_ms, c.chunk_index
         FROM chunks c
         JOIN sources s ON s.id = c.source_id
         WHERE s.ingest_state = 'processed' AND (
            EXISTS (SELECT 1 FROM deadline_sources ds
                    WHERE ds.source_id = s.id AND ds.deadline_id = ?1)
            OR EXISTS (SELECT 1 FROM assignment_coverage ac
                       WHERE ac.deadline_id = ?1 AND ac.week_id = s.week_id)
         )
         ORDER BY NOT EXISTS (SELECT 1 FROM deadline_sources ds
                              WHERE ds.source_id = s.id AND ds.deadline_id = ?1),
                  s.id, c.chunk_index
         LIMIT ?2",
    )
    .bind(deadline_id)
    .bind(MAX_BRIEF_CHUNKS)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())
}

/// Cap the rubric context passed to the sidecar — it steers the prompt, it is
/// not source material, so it must never crowd out the chunks.
const MAX_RUBRIC_CONTEXT_CHARS: usize = 1500;

/// A compact plain-text digest of the assignment's rubric ("- name (weight):
/// top-level descriptor"), or "" when no rubric was imported. Passed to the
/// sidecar as prompt context only; citations still come from chunks (law #1).
async fn fetch_rubric_context(pool: &SqlitePool, deadline_id: &str) -> Result<String, String> {
    let rows: Vec<(String, String, Option<String>, Option<String>)> = sqlx::query_as(
        "SELECT rc.name, rc.weight_text, rl.label, rl.descriptor
         FROM rubric_criteria rc
         LEFT JOIN rubric_levels rl ON rl.criterion_id = rc.id AND rl.position = 0
         WHERE rc.deadline_id = ?1
         ORDER BY rc.position",
    )
    .bind(deadline_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut out = String::new();
    for (name, weight, label, descriptor) in rows {
        let mut line = format!("- {name}");
        if !weight.is_empty() {
            line.push_str(&format!(" ({weight})"));
        }
        match (label.as_deref(), descriptor.as_deref()) {
            (Some(l), Some(d)) if !d.is_empty() => line.push_str(&format!(": {l} — {d}")),
            (Some(l), _) if !l.is_empty() => line.push_str(&format!(": {l}")),
            _ => {}
        }
        if out.len() + line.len() + 1 > MAX_RUBRIC_CONTEXT_CHARS {
            break;
        }
        out.push_str(&line);
        out.push('\n');
    }
    Ok(out.trim_end().to_string())
}

/// Persist the brief and its citations, staged for the review gate. Returns the
/// number of citations, or 0 when the sidecar produced nothing groundable (in
/// which case nothing is written — an untraceable brief is never stored, law #1).
async fn insert_brief(
    pool: &SqlitePool,
    subject_id: &str,
    deadline_id: &str,
    res: BriefResult,
) -> Result<i64, String> {
    if res.source_refs.is_empty() {
        return Ok(0);
    }
    let brief_id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO assignment_briefs (id, deadline_id, subject_id, content, reviewed, created_at)
         VALUES (?1, ?2, ?3, ?4, 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
    )
    .bind(&brief_id)
    .bind(deadline_id)
    .bind(subject_id)
    .bind(&res.content)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    let count = res.source_refs.len() as i64;
    for r in res.source_refs {
        let (page, ts) = loc_parts(&r.location);
        sqlx::query(
            "INSERT INTO assignment_brief_refs (id, brief_id, source_id, page, timestamp_ms, excerpt)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(&brief_id)
        .bind(&r.source_id)
        .bind(page)
        .bind(ts)
        .bind(&r.excerpt)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }
    Ok(count)
}

#[tauri::command]
pub async fn generate_assignment_brief(
    app: AppHandle,
    pool: State<'_, SqlitePool>,
    sidecar: State<'_, Sidecar>,
    subject_id: String,
    deadline_id: String,
) -> Result<JobHandle, String> {
    let title = fetch_assignment_title(pool.inner(), &deadline_id, &subject_id).await?;
    let chunks = fetch_brief_chunks(pool.inner(), &deadline_id).await?;
    if chunks.is_empty() {
        return Err(
            "no processed material — upload the assignment's spec or assign material to the weeks it covers"
                .to_string(),
        );
    }
    let rubric = fetch_rubric_context(pool.inner(), &deadline_id).await?;
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
        .post(format!("{base}/assignment-brief"))
        .header("X-Arbora-Token", &token)
        .json(&json!({
            "job_id": job_id, "subject_id": subject_id, "deadline_id": deadline_id,
            "assignment_title": title, "chunks": chunk_json, "rubric": rubric,
            "llm_config": { "provider": "ollama" }, "preset": preset,
        }))
        .send()
        .await
        .map_err(|e| format!("BRIEF_FAILED: {e}"))?
        .error_for_status()
        .map_err(|e| format!("BRIEF_FAILED: {e}"))?;

    let pool = pool.inner().clone();
    let (job, subj, dl) = (job_id.clone(), subject_id.clone(), deadline_id.clone());
    tauri::async_runtime::spawn(async move {
        poll_brief(app, pool, base, token, job, subj, dl).await;
    });

    Ok(JobHandle { job_id })
}

#[allow(clippy::too_many_arguments)]
async fn poll_brief(
    app: AppHandle,
    pool: SqlitePool,
    base: String,
    token: String,
    job_id: String,
    subject_id: String,
    deadline_id: String,
) {
    let client = reqwest::Client::new();
    loop {
        tokio::time::sleep(Duration::from_millis(300)).await;

        let status: GenStatusResp = match client
            .get(format!("{base}/assignment-brief/{job_id}/status"))
            .header("X-Arbora-Token", &token)
            .send()
            .await
            .and_then(|r| r.error_for_status())
        {
            Ok(resp) => match resp.json().await {
                Ok(s) => s,
                Err(e) => return emit_brief_error(&app, &job_id, &e.to_string()),
            },
            Err(e) => return emit_brief_error(&app, &job_id, &e.to_string()),
        };

        match status.state.as_str() {
            "done" => {
                finish_brief(
                    &app,
                    &pool,
                    &base,
                    &token,
                    &job_id,
                    &subject_id,
                    &deadline_id,
                )
                .await;
                return;
            }
            "error" => {
                return emit_brief_error(
                    &app,
                    &job_id,
                    &status
                        .error
                        .unwrap_or_else(|| "brief generation failed".into()),
                )
            }
            _ => {
                let _ = app.emit(
                    "brief:progress",
                    json!({ "job_id": job_id, "progress": status.progress, "items_generated": status.items_generated }),
                );
            }
        }
    }
}

#[allow(clippy::too_many_arguments)]
async fn finish_brief(
    app: &AppHandle,
    pool: &SqlitePool,
    base: &str,
    token: &str,
    job_id: &str,
    subject_id: &str,
    deadline_id: &str,
) {
    let client = reqwest::Client::new();
    let result: Result<BriefResult, String> = async {
        client
            .get(format!("{base}/assignment-brief/{job_id}/result"))
            .header("X-Arbora-Token", token)
            .send()
            .await
            .and_then(|r| r.error_for_status())
            .map_err(|e| e.to_string())?
            .json::<BriefResult>()
            .await
            .map_err(|e| e.to_string())
    }
    .await;

    let res = match result {
        Ok(r) => r,
        Err(e) => return emit_brief_error(app, job_id, &e),
    };
    match insert_brief(pool, subject_id, deadline_id, res).await {
        Ok(0) => emit_brief_error(
            app,
            job_id,
            "couldn't ground a brief from the covered material",
        ),
        Ok(count) => {
            let _ = app.emit(
                "brief:done",
                json!({ "job_id": job_id, "items_generated": count }),
            );
        }
        Err(e) => emit_brief_error(app, job_id, &e),
    }
}

fn emit_brief_error(app: &AppHandle, job_id: &str, error: &str) {
    let _ = app.emit("brief:error", json!({ "job_id": job_id, "error": error }));
}

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
        sqlx::query("INSERT INTO subjects (id,name,color,created_at,updated_at) VALUES ('subj1','S','#000','t','t')")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO sources (id,subject_id,type,file_path,title,ingest_state,created_at) VALUES ('src1','subj1','pdf','/a.pdf','A','processed','t')")
            .execute(&pool).await.unwrap();
        pool
    }

    fn page_ref() -> GenSourceRef {
        GenSourceRef {
            source_id: "src1".into(),
            location: GenLocation {
                kind: "page".into(),
                page: Some(3),
                timestamp_ms: None,
            },
            excerpt: "cited text".into(),
        }
    }

    #[tokio::test]
    async fn persists_staged_items_with_citations() {
        let pool = seeded_pool().await;
        let res = GenResult {
            cards: vec![GenCard {
                front: "Q".into(),
                back: "A".into(),
                explanation: "".into(),
                source_ref: page_ref(),
            }],
            quiz_items: vec![GenQuiz {
                question: "Which?".into(),
                options: vec!["a".into(), "b".into(), "c".into(), "d".into()],
                answer_index: 1,
                explanation: "".into(),
                source_ref: page_ref(),
            }],
            notes: vec![GenNote {
                content: "A grounded note about the topic.".into(),
                format: "outline".into(),
                source_refs: vec![page_ref()],
            }],
        };

        insert_generated(&pool, "subj1", res).await.unwrap();

        // Everything is staged (reviewed = 0) and carries its citation.
        let (cards,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM cards WHERE reviewed=0 AND page=3 AND excerpt='cited text'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(cards, 1);
        let (qz,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM quizzes")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(qz, 1, "one quiz container groups the items");
        let (items, opts): (i64, String) =
            sqlx::query_as("SELECT COUNT(*), MAX(options_json) FROM quiz_items WHERE reviewed=0")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(items, 1);
        assert_eq!(opts, r#"["a","b","c","d"]"#);
        let (refs,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM note_source_refs WHERE page=3")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(refs, 1);
    }

    #[tokio::test]
    async fn fetch_chunks_filters_by_source() {
        let pool = seeded_pool().await;
        sqlx::query("INSERT INTO chunks (id,source_id,subject_id,text,page,faiss_id,chunk_index) VALUES ('ch1','src1','subj1','hello',1,0,0)")
            .execute(&pool).await.unwrap();
        let got = fetch_chunks(&pool, &["src1".into()]).await.unwrap();
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].text, "hello");
        assert!(fetch_chunks(&pool, &[]).await.unwrap().is_empty());
    }

    // ── Assignment brief ──────────────────────────────────────────────────────

    #[tokio::test]
    async fn brief_persists_staged_with_citations_and_skips_empty() {
        let pool = seeded_pool().await;
        sqlx::query("INSERT INTO deadlines (id,subject_id,title,due_at,type,created_at) VALUES ('d','subj1','Essay','2026-03-20T09:00:00Z','assignment','t')")
            .execute(&pool).await.unwrap();

        let res = BriefResult {
            content: "- Focus on X\n- Focus on Y".into(),
            source_refs: vec![page_ref(), page_ref()],
        };
        let count = insert_brief(&pool, "subj1", "d", res).await.unwrap();
        assert_eq!(count, 2);

        let (briefs, reviewed): (i64, i64) =
            sqlx::query_as("SELECT COUNT(*), MAX(reviewed) FROM assignment_briefs")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(briefs, 1);
        assert_eq!(reviewed, 0, "staged for the review gate");
        let (refs,): (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM assignment_brief_refs WHERE page=3")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(refs, 2);

        // A result with no citations writes nothing (untraceable → never stored).
        let empty = insert_brief(
            &pool,
            "subj1",
            "d",
            BriefResult {
                content: "x".into(),
                source_refs: vec![],
            },
        )
        .await
        .unwrap();
        assert_eq!(empty, 0);
        let (briefs2,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM assignment_briefs")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(briefs2, 1, "no brief written for an empty result");
    }

    #[tokio::test]
    async fn brief_chunks_scoped_to_covered_weeks() {
        let pool = seeded_pool().await;
        sqlx::query(
            "INSERT INTO weeks (id,subject_id,week_number,created_at) VALUES ('w1','subj1',1,'t')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query("UPDATE sources SET week_id='w1' WHERE id='src1'")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO deadlines (id,subject_id,title,due_at,type,created_at) VALUES ('d','subj1','Essay','2026-03-20T09:00:00Z','assignment','t')")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO assignment_coverage (deadline_id,week_id) VALUES ('d','w1')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO chunks (id,source_id,subject_id,text,page,faiss_id,chunk_index) VALUES ('ch','src1','subj1','covered text',1,0,0)")
            .execute(&pool).await.unwrap();
        // A processed source in an UNcovered week — its chunk must be excluded.
        sqlx::query("INSERT INTO sources (id,subject_id,type,file_path,title,ingest_state,created_at) VALUES ('src2','subj1','pdf','/b.pdf','B','processed','t')")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO chunks (id,source_id,subject_id,text,page,faiss_id,chunk_index) VALUES ('ch2','src2','subj1','uncovered',1,1,0)")
            .execute(&pool).await.unwrap();

        let chunks = fetch_brief_chunks(&pool, "d").await.unwrap();
        assert_eq!(chunks.len(), 1, "only the covered week's chunk");
        assert_eq!(chunks[0].text, "covered text");
    }

    #[tokio::test]
    async fn brief_chunks_put_linked_spec_first_without_duplicates() {
        let pool = seeded_pool().await;
        sqlx::query(
            "INSERT INTO weeks (id,subject_id,week_number,created_at) VALUES ('w1','subj1',1,'t')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query("UPDATE sources SET week_id='w1' WHERE id='src1'")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO deadlines (id,subject_id,title,due_at,type,created_at) VALUES ('d','subj1','Essay','2026-03-20T09:00:00Z','assignment','t')")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO assignment_coverage (deadline_id,week_id) VALUES ('d','w1')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO chunks (id,source_id,subject_id,text,page,faiss_id,chunk_index) VALUES ('ch','src1','subj1','week material',1,0,0)")
            .execute(&pool).await.unwrap();
        // The uploaded spec: linked to the deadline AND (worst case) also
        // assigned to the covered week + linked twice (spec and rubric roles).
        sqlx::query("INSERT INTO sources (id,subject_id,type,file_path,title,ingest_state,week_id,created_at) VALUES ('spec','subj1','pdf','/s.pdf','Spec','processed','w1','t')")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO chunks (id,source_id,subject_id,text,page,faiss_id,chunk_index) VALUES ('chs','spec','subj1','spec text',1,1,0)")
            .execute(&pool).await.unwrap();
        for role in ["spec", "rubric"] {
            sqlx::query("INSERT INTO deadline_sources (deadline_id,role,source_id,created_at) VALUES ('d',?1,'spec','t')")
                .bind(role)
                .execute(&pool)
                .await
                .unwrap();
        }

        let chunks = fetch_brief_chunks(&pool, "d").await.unwrap();
        assert_eq!(
            chunks.len(),
            2,
            "no duplicate rows for the doubly-linked spec"
        );
        assert_eq!(chunks[0].text, "spec text", "linked source ranks first");
        assert_eq!(chunks[1].text, "week material");
    }

    #[tokio::test]
    async fn rubric_context_formats_and_stays_bounded() {
        let pool = seeded_pool().await;
        sqlx::query("INSERT INTO deadlines (id,subject_id,title,due_at,type,created_at) VALUES ('d','subj1','Essay','2026-03-20T09:00:00Z','assignment','t')")
            .execute(&pool).await.unwrap();

        assert_eq!(
            fetch_rubric_context(&pool, "d").await.unwrap(),
            "",
            "no rubric → empty context"
        );

        sqlx::query("INSERT INTO rubric_criteria (id,deadline_id,name,weight_text,position,created_at) VALUES ('c1','d','Accuracy','40%',0,'t')")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO rubric_levels (id,criterion_id,label,descriptor,position) VALUES ('l1','c1','HD','All mechanisms correct.',0)")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO rubric_criteria (id,deadline_id,name,weight_text,position,created_at) VALUES ('c2','d','Referencing','',1,'t')")
            .execute(&pool).await.unwrap();

        let ctx = fetch_rubric_context(&pool, "d").await.unwrap();
        assert_eq!(
            ctx,
            "- Accuracy (40%): HD — All mechanisms correct.\n- Referencing"
        );

        // A pathological rubric never exceeds the prompt budget.
        for i in 0..100 {
            sqlx::query("INSERT INTO rubric_criteria (id,deadline_id,name,weight_text,position,created_at) VALUES (?1,'d',?2,'',?3,'t')")
                .bind(format!("cx{i}"))
                .bind("X".repeat(190))
                .bind(10 + i)
                .execute(&pool)
                .await
                .unwrap();
        }
        let ctx = fetch_rubric_context(&pool, "d").await.unwrap();
        assert!(ctx.len() <= MAX_RUBRIC_CONTEXT_CHARS);
    }
}
