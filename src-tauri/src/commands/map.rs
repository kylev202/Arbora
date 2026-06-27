//! Knowledge map — all approved cards for a subject, enriched with their
//! current mastery state from `card_schedule`. Pure SQLite; no sidecar.
//!
//! "Concept" = card.front (the question being studied). Mastery mapping:
//! - `review` → "mastered"
//! - `learning | relearning` → "learning"
//! - `new` / missing row → "unstarted" (defensive; approve_card creates schedule rows)

use serde::Serialize;
use sqlx::SqlitePool;
use tauri::State;

#[derive(Serialize, sqlx::FromRow)]
pub struct ConceptEntry {
    pub id: String,
    pub concept: String, // card.front
    pub back: String,    // card.back  (shown in expanded / tooltip)
    pub mastery: String, // "mastered" | "learning" | "unstarted"
    pub source_title: String,
    pub page: Option<i64>,
    pub timestamp_ms: Option<i64>,
}

#[tauri::command]
pub async fn get_knowledge_map(
    pool: State<'_, SqlitePool>,
    subject_id: String,
) -> Result<Vec<ConceptEntry>, String> {
    sqlx::query_as::<_, ConceptEntry>(
        "SELECT
             c.id,
             c.front       AS concept,
             c.back,
             s.title       AS source_title,
             c.page,
             c.timestamp_ms,
             CASE
                 WHEN cs.state = 'review'                      THEN 'mastered'
                 WHEN cs.state IN ('learning', 'relearning')   THEN 'learning'
                 ELSE 'unstarted'
             END           AS mastery
         FROM cards c
         JOIN sources s ON s.id = c.source_id
         LEFT JOIN card_schedule cs ON cs.card_id = c.id
         WHERE c.subject_id = ?1 AND c.reviewed = 1
         ORDER BY
             CASE COALESCE(cs.state, 'unstarted')
                 WHEN 'review'      THEN 1
                 WHEN 'relearning'  THEN 2
                 WHEN 'learning'    THEN 3
                 ELSE               4
             END,
             c.front",
    )
    .bind(&subject_id)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())
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
             VALUES ('src1','s1','pdf','/a.pdf','Lecture','processed','t')",
        )
        .execute(&pool)
        .await
        .unwrap();
        pool
    }

    async fn insert_card(pool: &SqlitePool, id: &str, front: &str, reviewed: i64) {
        sqlx::query(
            "INSERT INTO cards (id,subject_id,front,back,explanation,source_id,excerpt,reviewed,created_at) \
             VALUES (?1,'s1',?2,'answer','','src1','ex',?3,'t')",
        )
        .bind(id)
        .bind(front)
        .bind(reviewed)
        .execute(pool)
        .await
        .unwrap();
    }

    async fn insert_schedule(pool: &SqlitePool, card_id: &str, state: &str) {
        sqlx::query(
            "INSERT INTO card_schedule (card_id,due,stability,difficulty,state,last_review) \
             VALUES (?1,'2026-01-01T00:00:00Z',1.0,5.0,?2,'2026-01-01T00:00:00Z')",
        )
        .bind(card_id)
        .bind(state)
        .execute(pool)
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn returns_only_reviewed_cards() {
        let pool = seeded_pool().await;
        insert_card(&pool, "c1", "Mastered concept", 1).await;
        insert_card(&pool, "c2", "Pending card", 0).await;
        insert_schedule(&pool, "c1", "review").await;

        let map = sqlx::query_as::<_, ConceptEntry>(
            "SELECT c.id, c.front AS concept, c.back,
                    s.title AS source_title, c.page, c.timestamp_ms,
                    CASE WHEN cs.state='review' THEN 'mastered'
                         WHEN cs.state IN ('learning','relearning') THEN 'learning'
                         ELSE 'unstarted' END AS mastery
             FROM cards c JOIN sources s ON s.id=c.source_id
             LEFT JOIN card_schedule cs ON cs.card_id=c.id
             WHERE c.subject_id='s1' AND c.reviewed=1
             ORDER BY c.front",
        )
        .fetch_all(&pool)
        .await
        .unwrap();

        assert_eq!(map.len(), 1, "only the approved card appears");
        assert_eq!(map[0].concept, "Mastered concept");
        assert_eq!(map[0].mastery, "mastered");
    }

    #[tokio::test]
    async fn mastery_states_mapped_correctly() {
        let pool = seeded_pool().await;
        insert_card(&pool, "c1", "A", 1).await;
        insert_card(&pool, "c2", "B", 1).await;
        insert_card(&pool, "c3", "C", 1).await;
        insert_schedule(&pool, "c1", "review").await;
        insert_schedule(&pool, "c2", "learning").await;
        insert_schedule(&pool, "c3", "relearning").await;

        let map = sqlx::query_as::<_, ConceptEntry>(
            "SELECT c.id, c.front AS concept, c.back,
                    s.title AS source_title, c.page, c.timestamp_ms,
                    CASE WHEN cs.state='review' THEN 'mastered'
                         WHEN cs.state IN ('learning','relearning') THEN 'learning'
                         ELSE 'unstarted' END AS mastery
             FROM cards c JOIN sources s ON s.id=c.source_id
             LEFT JOIN card_schedule cs ON cs.card_id=c.id
             WHERE c.subject_id='s1' AND c.reviewed=1
             ORDER BY c.front",
        )
        .fetch_all(&pool)
        .await
        .unwrap();

        let by_concept: std::collections::HashMap<_, _> = map
            .iter()
            .map(|e| (e.concept.as_str(), e.mastery.as_str()))
            .collect();
        assert_eq!(by_concept["A"], "mastered");
        assert_eq!(by_concept["B"], "learning");
        assert_eq!(by_concept["C"], "learning");
    }

    #[tokio::test]
    async fn empty_subject_returns_empty_vec() {
        let pool = seeded_pool().await;
        let map = sqlx::query_as::<_, ConceptEntry>(
            "SELECT c.id, c.front AS concept, c.back,
                    s.title AS source_title, c.page, c.timestamp_ms,
                    CASE WHEN cs.state='review' THEN 'mastered'
                         WHEN cs.state IN ('learning','relearning') THEN 'learning'
                         ELSE 'unstarted' END AS mastery
             FROM cards c JOIN sources s ON s.id=c.source_id
             LEFT JOIN card_schedule cs ON cs.card_id=c.id
             WHERE c.subject_id='s1' AND c.reviewed=1
             ORDER BY c.front",
        )
        .fetch_all(&pool)
        .await
        .unwrap();
        assert!(map.is_empty());
    }
}
