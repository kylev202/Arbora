//! Export a subject's approved flashcards to an Anki `.apkg`.
//!
//! The core reads the **reviewed** cards (law #2 — only trusted items leave the
//! app) with their citations, then hands them to the sidecar's `/export`, which
//! builds the deck with genanki and writes it to the path the user picked. The
//! destination path comes from the UI's native save dialog.

use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::SqlitePool;
use tauri::State;

use crate::sidecar::Sidecar;

// ── Card payload shaped exactly like the sidecar's CardOut schema ──────────

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
enum LocationOut {
    Page { page: i64 },
    Timestamp { timestamp_ms: i64 },
}

#[derive(Serialize)]
struct SourceRefOut {
    source_id: String,
    location: LocationOut,
    excerpt: String,
}

#[derive(Serialize)]
struct CardExport {
    front: String,
    back: String,
    explanation: String,
    source_ref: SourceRefOut,
}

#[derive(sqlx::FromRow)]
struct CardRow {
    front: String,
    back: String,
    explanation: String,
    source_id: String,
    page: Option<i64>,
    timestamp_ms: Option<i64>,
    excerpt: String,
}

#[derive(Serialize, Deserialize)]
pub struct ExportResult {
    pub path: String,
    pub card_count: i64,
}

async fn collect_cards(pool: &SqlitePool, subject_id: &str) -> Result<Vec<CardExport>, String> {
    let rows = sqlx::query_as::<_, CardRow>(
        "SELECT front, back, explanation, source_id, page, timestamp_ms, excerpt
         FROM cards WHERE subject_id = ?1 AND reviewed = 1 ORDER BY created_at",
    )
    .bind(subject_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|c| CardExport {
            front: c.front,
            back: c.back,
            explanation: c.explanation,
            source_ref: SourceRefOut {
                source_id: c.source_id,
                location: match c.timestamp_ms {
                    Some(ms) => LocationOut::Timestamp { timestamp_ms: ms },
                    None => LocationOut::Page {
                        page: c.page.unwrap_or(1),
                    },
                },
                excerpt: c.excerpt,
            },
        })
        .collect())
}

async fn subject_name(pool: &SqlitePool, subject_id: &str) -> Result<String, String> {
    sqlx::query_scalar::<_, String>("SELECT name FROM subjects WHERE id = ?1")
        .bind(subject_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "SUBJECT_NOT_FOUND".to_string())
}

async fn call_export(
    sidecar: &Sidecar,
    cards: &[CardExport],
    deck_name: &str,
    out_path: &str,
) -> Result<ExportResult, String> {
    let base = sidecar
        .base_url()
        .filter(|_| sidecar.is_ready())
        .ok_or("SIDECAR_UNAVAILABLE")?;
    let token = sidecar.token().to_string();

    reqwest::Client::new()
        .post(format!("{base}/export"))
        .header("X-Arbora-Token", &token)
        .json(&json!({
            "cards": cards,
            "deck_name": deck_name,
            "out_path": out_path,
        }))
        .send()
        .await
        .map_err(|e| format!("EXPORT_FAILED:{e}"))?
        .error_for_status()
        .map_err(|e| format!("EXPORT_FAILED:{e}"))?
        .json::<ExportResult>()
        .await
        .map_err(|e| format!("EXPORT_PARSE:{e}"))
}

#[tauri::command]
pub async fn export_apkg(
    pool: State<'_, SqlitePool>,
    sidecar: State<'_, Sidecar>,
    subject_id: String,
    out_path: String,
) -> Result<ExportResult, String> {
    let cards = collect_cards(pool.inner(), &subject_id).await?;
    if cards.is_empty() {
        return Err("NO_CARDS_TO_EXPORT".to_string());
    }
    let deck_name = subject_name(pool.inner(), &subject_id).await?;
    call_export(sidecar.inner(), &cards, &deck_name, &out_path).await
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
        sqlx::query("INSERT INTO subjects (id,name,color,created_at,updated_at) VALUES ('s','Biology','#000','t','t')")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO sources (id,subject_id,type,file_path,title,ingest_state,created_at) VALUES ('src','s','pdf','/a.pdf','Doc','processed','t')")
            .execute(&pool).await.unwrap();
        // One approved, one staged — only the approved card is exportable.
        sqlx::query("INSERT INTO cards (id,subject_id,front,back,explanation,source_id,page,excerpt,reviewed,created_at) VALUES ('c1','s','Q','A','E','src',7,'cited',1,'t')")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO cards (id,subject_id,front,back,explanation,source_id,page,excerpt,reviewed,created_at) VALUES ('c2','s','Q2','A2','','src',8,'x',0,'t')")
            .execute(&pool).await.unwrap();
        pool
    }

    #[tokio::test]
    async fn collects_only_reviewed_cards_with_citation_shape() {
        let pool = seeded_pool().await;
        let cards = collect_cards(&pool, "s").await.unwrap();
        assert_eq!(cards.len(), 1, "staged card excluded");
        let json = serde_json::to_value(&cards[0]).unwrap();
        assert_eq!(json["front"], "Q");
        // Must match the sidecar CardOut schema: source_ref.location is tagged.
        assert_eq!(json["source_ref"]["location"]["type"], "page");
        assert_eq!(json["source_ref"]["location"]["page"], 7);
        assert_eq!(json["source_ref"]["excerpt"], "cited");
        assert!(
            json.get("reviewed").is_none(),
            "CardOut has no reviewed field"
        );
    }

    #[tokio::test]
    async fn deck_name_is_subject_name() {
        let pool = seeded_pool().await;
        assert_eq!(subject_name(&pool, "s").await.unwrap(), "Biology");
    }
}
