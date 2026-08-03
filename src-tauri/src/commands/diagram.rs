//! Week mind map generation. `generate_diagram` fetches the week's processed chunks,
//! calls the sidecar `/diagram` endpoint (one grounded LLM call, no FAISS), then joins
//! returned source_ids with `sources` to attach titles. The result is a hierarchical
//! Mermaid mind map of everything in that week. Diagrams are ephemeral visual aids —
//! not persisted (law #2 doesn't apply here). Every citation is authoritative from
//! chunk metadata, not model output (law #1).

use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::SqlitePool;
use tauri::State;

use crate::sidecar::Sidecar;

// ── DB helpers ────────────────────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct ChunkRow {
    source_id: String,
    text: String,
    page: Option<i64>,
    timestamp_ms: Option<i64>,
}

/// The week's chunks in reading order, scoped to processed sources only — the
/// same scoping the walkthrough uses, so the mind map covers exactly the week's
/// material and nothing loose.
async fn fetch_week_chunks(
    pool: &SqlitePool,
    subject_id: &str,
    week_id: &str,
) -> Result<Vec<ChunkRow>, String> {
    sqlx::query_as::<_, ChunkRow>(
        "SELECT c.source_id, c.text, c.page, c.timestamp_ms
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

async fn fetch_week_title(pool: &SqlitePool, subject_id: &str, week_id: &str) -> String {
    sqlx::query_as::<_, (Option<String>,)>(
        "SELECT title FROM weeks WHERE id = ?1 AND subject_id = ?2",
    )
    .bind(week_id)
    .bind(subject_id)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten()
    .and_then(|(t,)| t)
    .unwrap_or_default()
}

async fn fetch_preset(pool: &SqlitePool) -> String {
    sqlx::query_as::<_, (String,)>("SELECT ai_preset FROM settings WHERE id = 1")
        .fetch_one(pool)
        .await
        .map(|(p,)| p)
        .unwrap_or_else(|_| "medium".to_string())
}

async fn source_title(pool: &SqlitePool, source_id: &str) -> String {
    sqlx::query_as::<_, (String,)>("SELECT title FROM sources WHERE id = ?1")
        .bind(source_id)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
        .map(|(t,)| t)
        .unwrap_or_else(|| "Unknown source".to_string())
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
struct DiagramSidecarResponse {
    title: String,
    mermaid_code: String,
    #[serde(default)]
    source_refs: Vec<SidecarSourceRef>,
}

// ── UI output shapes ───────────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
enum LocationOut {
    Page { page: i64 },
    Timestamp { timestamp_ms: i64 },
}

#[derive(Serialize)]
pub struct DiagramCitation {
    source_id: String,
    source_title: String,
    location: LocationOut,
    excerpt: String,
}

#[derive(Serialize)]
pub struct DiagramResponse {
    pub title: String,
    pub mermaid_code: String,
    pub citations: Vec<DiagramCitation>,
}

// ── Command ────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn generate_diagram(
    pool: State<'_, SqlitePool>,
    sidecar: State<'_, Sidecar>,
    subject_id: String,
    week_id: String,
) -> Result<DiagramResponse, String> {
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
    let week_title = fetch_week_title(pool.inner(), &subject_id, &week_id).await;

    let chunk_json: Vec<_> = chunks
        .iter()
        .map(|c| {
            json!({
                "source_id": c.source_id,
                "text": c.text,
                "page": c.page,
                "timestamp_ms": c.timestamp_ms,
            })
        })
        .collect();

    let sidecar_resp: DiagramSidecarResponse = reqwest::Client::new()
        .post(format!("{base}/diagram"))
        .header("X-Arbora-Token", &token)
        .json(&json!({
            "subject_id": subject_id,
            "week_title": week_title,
            "chunks": chunk_json,
            "preset": preset,
        }))
        .send()
        .await
        .map_err(|e| format!("DIAGRAM_FAILED: {e}"))?
        .error_for_status()
        .map_err(|e| format!("DIAGRAM_FAILED: {e}"))?
        .json()
        .await
        .map_err(|e| format!("DIAGRAM_FAILED: {e}"))?;

    let mut citations = Vec::new();
    for r in sidecar_resp.source_refs {
        let title = source_title(pool.inner(), &r.source_id).await;
        let location = if r.location.kind == "timestamp" {
            LocationOut::Timestamp {
                timestamp_ms: r.location.timestamp_ms.unwrap_or(0),
            }
        } else {
            LocationOut::Page {
                page: r.location.page.unwrap_or(1),
            }
        };
        citations.push(DiagramCitation {
            source_id: r.source_id,
            source_title: title,
            location,
            excerpt: r.excerpt,
        });
    }

    Ok(DiagramResponse {
        title: sidecar_resp.title,
        mermaid_code: sidecar_resp.mermaid_code,
        citations,
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
            "INSERT INTO weeks (id,subject_id,week_number,title,created_at) \
             VALUES ('w1','s1',1,'Cells','t')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO sources (id,subject_id,type,file_path,title,ingest_state,week_id,created_at) \
             VALUES ('src1','s1','pdf','/a.pdf','Lecture Notes','processed','w1','t')",
        )
        .execute(&pool)
        .await
        .unwrap();
        pool
    }

    #[tokio::test]
    async fn fetch_chunks_scoped_to_processed_week_sources() {
        let pool = seeded_pool().await;
        sqlx::query(
            "INSERT INTO chunks (id,source_id,subject_id,text,page,faiss_id,chunk_index) \
             VALUES ('ch1','src1','s1','hello',1,0,0),('ch2','src1','s1','world',2,1,1)",
        )
        .execute(&pool)
        .await
        .unwrap();
        // A processed source with no week — must be excluded from the week map.
        sqlx::query(
            "INSERT INTO sources (id,subject_id,type,file_path,title,ingest_state,created_at) \
             VALUES ('src2','s1','pdf','/b.pdf','Loose','processed','t')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO chunks (id,source_id,subject_id,text,page,faiss_id,chunk_index) \
             VALUES ('ch3','src2','s1','loose',1,2,0)",
        )
        .execute(&pool)
        .await
        .unwrap();

        let rows = fetch_week_chunks(&pool, "s1", "w1").await.unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].text, "hello");
    }

    #[tokio::test]
    async fn week_title_lookup_and_fallback() {
        let pool = seeded_pool().await;
        assert_eq!(fetch_week_title(&pool, "s1", "w1").await, "Cells");
        assert_eq!(fetch_week_title(&pool, "s1", "missing").await, "");
    }

    #[tokio::test]
    async fn source_title_lookup_and_fallback() {
        let pool = seeded_pool().await;
        assert_eq!(source_title(&pool, "src1").await, "Lecture Notes");
        assert_eq!(source_title(&pool, "missing").await, "Unknown source");
    }
}
