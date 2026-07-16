//! RAG Q&A. `chat_message` fetches all indexed chunks for a subject, calls the
//! sidecar `/chat` endpoint (FAISS search + LLM generation), then joins the
//! returned source_ids with the `sources` table to attach titles before
//! returning to the UI. Answers are ephemeral — nothing is persisted (law #2
//! doesn't apply to conversational Q&A; the user is not adding items to a deck).
//! Every citation is authoritative from the chunk metadata, not the model (law #1).

use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::SqlitePool;
use tauri::State;

use crate::sidecar::Sidecar;

// ── DB helpers ────────────────────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct ChunkRow {
    faiss_id: i64,
    source_id: String,
    text: String,
    page: Option<i64>,
    timestamp_ms: Option<i64>,
}

async fn fetch_subject_chunks(
    pool: &SqlitePool,
    subject_id: &str,
) -> Result<Vec<ChunkRow>, String> {
    sqlx::query_as::<_, ChunkRow>(
        "SELECT faiss_id, source_id, text, page, timestamp_ms
         FROM chunks WHERE subject_id = ?1 ORDER BY chunk_index",
    )
    .bind(subject_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())
}

pub(crate) async fn fetch_preset(pool: &SqlitePool) -> String {
    sqlx::query_as::<_, (String,)>("SELECT ai_preset FROM settings WHERE id = 1")
        .fetch_one(pool)
        .await
        .map(|(p,)| p)
        .unwrap_or_else(|_| "medium".to_string())
}

pub(crate) async fn source_title(pool: &SqlitePool, source_id: &str) -> String {
    sqlx::query_as::<_, (String,)>("SELECT title FROM sources WHERE id = ?1")
        .bind(source_id)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
        .map(|(t,)| t)
        .unwrap_or_else(|| "Unknown source".to_string())
}

// ── Request shapes ─────────────────────────────────────────────────────────────

/// One prior turn of the conversation, forwarded to the sidecar so follow-up
/// questions ("why does *it* do that?") can be condensed into standalone
/// search queries. Ephemeral — never persisted (law #2 posture unchanged).
#[derive(Deserialize, Serialize)]
pub struct ChatHistoryTurn {
    pub role: String, // "user" | "assistant"
    pub content: String,
}

// ── Sidecar response shapes ────────────────────────────────────────────────────

#[derive(Deserialize)]
struct SidecarLocation {
    #[serde(rename = "type")]
    kind: String,
    page: Option<i64>,
    timestamp_ms: Option<i64>,
}

#[derive(Deserialize)]
struct SidecarSourceRef {
    source_id: String,
    location: SidecarLocation,
    excerpt: String,
}

#[derive(Deserialize)]
struct ChatSidecarResponse {
    answer: String,
    #[serde(default)]
    source_refs: Vec<SidecarSourceRef>,
    #[serde(default)]
    suggested_questions: Vec<String>,
}

// ── UI output shapes ───────────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub(crate) enum LocationOut {
    Page { page: i64 },
    Timestamp { timestamp_ms: i64 },
}

/// A single citation returned with a chat answer. Same shape as `SourceRefOut`
/// in content.rs so the UI can reuse `CitationChip`. Fields are crate-visible
/// so the pet can build KB-section citations with the same shape.
#[derive(Serialize)]
pub struct ChatCitation {
    pub(crate) source_id: String,
    pub(crate) source_title: String,
    pub(crate) location: LocationOut,
    pub(crate) excerpt: String,
}

#[derive(Serialize)]
pub struct ChatMessageResponse {
    pub answer: String,
    pub citations: Vec<ChatCitation>,
    pub suggested_questions: Vec<String>,
}

// ── Command ────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn chat_message(
    pool: State<'_, SqlitePool>,
    sidecar: State<'_, Sidecar>,
    subject_id: String,
    question: String,
    history: Option<Vec<ChatHistoryTurn>>,
) -> Result<ChatMessageResponse, String> {
    ask(
        pool.inner(),
        &sidecar,
        &subject_id,
        &question,
        &history.unwrap_or_default(),
    )
    .await
}

/// Full RAG Q&A path (chunks → sidecar /chat → titled citations). Shared by the
/// per-subject Ask tab and the pet companion (Domain A).
pub(crate) async fn ask(
    pool: &SqlitePool,
    sidecar: &Sidecar,
    subject_id: &str,
    question: &str,
    history: &[ChatHistoryTurn],
) -> Result<ChatMessageResponse, String> {
    let chunks = fetch_subject_chunks(pool, subject_id).await?;
    if chunks.is_empty() {
        return Err("NO_CHUNKS".to_string());
    }
    let base = sidecar
        .base_url()
        .filter(|_| sidecar.is_ready())
        .ok_or("SIDECAR_UNAVAILABLE")?;
    let token = sidecar.token().to_string();
    let preset = fetch_preset(pool).await;

    let chunk_json: Vec<_> = chunks
        .iter()
        .map(|c| {
            json!({
                "faiss_id": c.faiss_id,
                "source_id": c.source_id,
                "text": c.text,
                "page": c.page,
                "timestamp_ms": c.timestamp_ms,
            })
        })
        .collect();

    let sidecar_resp: ChatSidecarResponse = reqwest::Client::new()
        .post(format!("{base}/chat"))
        .header("X-Arbora-Token", &token)
        .json(&json!({
            "subject_id": subject_id,
            "question": question,
            "chunks": chunk_json,
            "preset": preset,
            "history": history,
        }))
        .send()
        .await
        .map_err(|e| format!("CHAT_FAILED: {e}"))?
        .error_for_status()
        .map_err(|e| format!("CHAT_FAILED: {e}"))?
        .json()
        .await
        .map_err(|e| format!("CHAT_FAILED: {e}"))?;

    let mut citations = Vec::new();
    for r in sidecar_resp.source_refs {
        let title = source_title(pool, &r.source_id).await;
        let location = if r.location.kind == "timestamp" {
            LocationOut::Timestamp {
                timestamp_ms: r.location.timestamp_ms.unwrap_or(0),
            }
        } else {
            LocationOut::Page {
                page: r.location.page.unwrap_or(1),
            }
        };
        citations.push(ChatCitation {
            source_id: r.source_id,
            source_title: title,
            location,
            excerpt: r.excerpt,
        });
    }

    Ok(ChatMessageResponse {
        answer: sidecar_resp.answer,
        citations,
        suggested_questions: sidecar_resp.suggested_questions,
    })
}

// ── Tests ──────────────────────────────────────────────────────────────────────

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
        sqlx::query(
            "INSERT INTO subjects (id,name,color,created_at,updated_at) \
             VALUES ('s1','Bio','#000','t','t')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO sources (id,subject_id,type,file_path,title,ingest_state,created_at) \
             VALUES ('src1','s1','pdf','/a.pdf','Lecture Notes','processed','t')",
        )
        .execute(&pool)
        .await
        .unwrap();
        pool
    }

    #[tokio::test]
    async fn fetch_chunks_returns_all_for_subject() {
        let pool = seeded_pool().await;
        sqlx::query(
            "INSERT INTO chunks (id,source_id,subject_id,text,page,faiss_id,chunk_index) \
             VALUES ('ch1','src1','s1','hello',1,0,0),('ch2','src1','s1','world',2,1,1)",
        )
        .execute(&pool)
        .await
        .unwrap();
        let rows = fetch_subject_chunks(&pool, "s1").await.unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].text, "hello");
        assert_eq!(rows[0].faiss_id, 0);
    }

    #[tokio::test]
    async fn fetch_chunks_empty_when_no_chunks() {
        let pool = seeded_pool().await;
        assert!(fetch_subject_chunks(&pool, "s1").await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn source_title_lookup_and_fallback() {
        let pool = seeded_pool().await;
        assert_eq!(source_title(&pool, "src1").await, "Lecture Notes");
        assert_eq!(source_title(&pool, "missing").await, "Unknown source");
    }
}
