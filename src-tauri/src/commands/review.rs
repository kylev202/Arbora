//! The review gate (law #2). `get_review_queue` returns everything staged
//! (`reviewed = 0`) for a subject as tagged review items with their citation
//! rebuilt; approve flips `reviewed = 1` (and enrols a card into FSRS as `new`);
//! reject deletes the staged row. Nothing is trusted until it passes through here.

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::State;

// ── Wire shapes (mirror the TS ReviewItem union) ───────────────────────────

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum LocationOut {
    Page { page: i64 },
    Timestamp { timestamp_ms: i64 },
}

fn loc_out(page: Option<i64>, timestamp_ms: Option<i64>) -> LocationOut {
    match timestamp_ms {
        Some(ms) => LocationOut::Timestamp { timestamp_ms: ms },
        None => LocationOut::Page {
            page: page.unwrap_or(0),
        },
    }
}

#[derive(Serialize)]
pub struct SourceRefOut {
    source_id: String,
    source_title: String,
    location: LocationOut,
    excerpt: String,
}

#[derive(Serialize)]
pub struct CardWire {
    id: String,
    subject_id: String,
    front: String,
    back: String,
    explanation: String,
    source_ref: SourceRefOut,
    reviewed: bool,
}

#[derive(Serialize)]
pub struct QuizWire {
    id: String,
    subject_id: String,
    question: String,
    options: Vec<String>,
    answer_index: i64,
    explanation: String,
    source_ref: SourceRefOut,
    reviewed: bool,
}

#[derive(Serialize)]
pub struct NoteWire {
    id: String,
    subject_id: String,
    content: String,
    format: String,
    source_refs: Vec<SourceRefOut>,
    reviewed: bool,
}

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum ReviewItem {
    Card(CardWire),
    Quiz(QuizWire),
    Note(NoteWire),
}

// ── Flat query rows ────────────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct CardRow {
    id: String,
    subject_id: String,
    front: String,
    back: String,
    explanation: String,
    source_id: String,
    page: Option<i64>,
    timestamp_ms: Option<i64>,
    excerpt: String,
    source_title: String,
}

#[derive(sqlx::FromRow)]
struct QuizRow {
    id: String,
    subject_id: String,
    question: String,
    options_json: String,
    answer_index: i64,
    explanation: String,
    source_id: String,
    page: Option<i64>,
    timestamp_ms: Option<i64>,
    excerpt: String,
    source_title: String,
}

#[derive(sqlx::FromRow)]
struct NoteRow {
    id: String,
    subject_id: String,
    content: String,
    format: String,
}

#[derive(sqlx::FromRow)]
struct RefRow {
    source_id: String,
    page: Option<i64>,
    timestamp_ms: Option<i64>,
    excerpt: String,
    source_title: String,
}

// ── DB layer ───────────────────────────────────────────────────────────────

async fn queue(pool: &SqlitePool, subject_id: &str) -> Result<Vec<ReviewItem>, String> {
    let mut out: Vec<ReviewItem> = Vec::new();

    let cards = sqlx::query_as::<_, CardRow>(
        "SELECT c.id, c.subject_id, c.front, c.back, c.explanation, c.source_id, c.page,
                c.timestamp_ms, c.excerpt, s.title AS source_title
         FROM cards c JOIN sources s ON s.id = c.source_id
         WHERE c.subject_id = ?1 AND c.reviewed = 0 ORDER BY c.created_at",
    )
    .bind(subject_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    for c in cards {
        out.push(ReviewItem::Card(CardWire {
            id: c.id,
            subject_id: c.subject_id,
            front: c.front,
            back: c.back,
            explanation: c.explanation,
            source_ref: SourceRefOut {
                source_id: c.source_id,
                source_title: c.source_title,
                location: loc_out(c.page, c.timestamp_ms),
                excerpt: c.excerpt,
            },
            reviewed: false,
        }));
    }

    let quizzes = sqlx::query_as::<_, QuizRow>(
        "SELECT q.id, q.subject_id, q.question, q.options_json, q.answer_index, q.explanation,
                q.source_id, q.page, q.timestamp_ms, q.excerpt, s.title AS source_title
         FROM quiz_items q JOIN sources s ON s.id = q.source_id
         WHERE q.subject_id = ?1 AND q.reviewed = 0 ORDER BY q.created_at",
    )
    .bind(subject_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    for q in quizzes {
        let options: Vec<String> =
            serde_json::from_str(&q.options_json).map_err(|e| e.to_string())?;
        out.push(ReviewItem::Quiz(QuizWire {
            id: q.id,
            subject_id: q.subject_id,
            question: q.question,
            options,
            answer_index: q.answer_index,
            explanation: q.explanation,
            source_ref: SourceRefOut {
                source_id: q.source_id,
                source_title: q.source_title,
                location: loc_out(q.page, q.timestamp_ms),
                excerpt: q.excerpt,
            },
            reviewed: false,
        }));
    }

    let notes = sqlx::query_as::<_, NoteRow>(
        "SELECT id, subject_id, content, format FROM notes
         WHERE subject_id = ?1 AND reviewed = 0 ORDER BY created_at",
    )
    .bind(subject_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    for n in notes {
        let refs = sqlx::query_as::<_, RefRow>(
            "SELECT r.source_id, r.page, r.timestamp_ms, r.excerpt, s.title AS source_title
             FROM note_source_refs r JOIN sources s ON s.id = r.source_id
             WHERE r.note_id = ?1",
        )
        .bind(&n.id)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
        out.push(ReviewItem::Note(NoteWire {
            id: n.id,
            subject_id: n.subject_id,
            content: n.content,
            format: n.format,
            source_refs: refs
                .into_iter()
                .map(|r| SourceRefOut {
                    source_id: r.source_id,
                    source_title: r.source_title,
                    location: loc_out(r.page, r.timestamp_ms),
                    excerpt: r.excerpt,
                })
                .collect(),
            reviewed: false,
        }));
    }

    Ok(out)
}

// ── Edit payloads (optional overrides applied on approve) ──────────────────

#[derive(Deserialize, Default)]
pub struct CardEdits {
    front: Option<String>,
    back: Option<String>,
    explanation: Option<String>,
}

#[derive(Deserialize, Default)]
pub struct QuizEdits {
    question: Option<String>,
    options: Option<Vec<String>>,
    answer_index: Option<i64>,
    explanation: Option<String>,
}

#[derive(Deserialize, Default)]
pub struct NoteEdits {
    content: Option<String>,
}

async fn approve_card_db(pool: &SqlitePool, card_id: &str, edits: CardEdits) -> Result<(), String> {
    sqlx::query(
        "UPDATE cards SET front = COALESCE(?2, front), back = COALESCE(?3, back),
                explanation = COALESCE(?4, explanation), reviewed = 1 WHERE id = ?1",
    )
    .bind(card_id)
    .bind(edits.front)
    .bind(edits.back)
    .bind(edits.explanation)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    // Enrol into FSRS as a brand-new learning card (fsrs 6.x has no State.New;
    // step=0 is the first learning step). stability=0/difficulty=0 are sentinels
    // meaning "not yet rated" — schedule.py's from_dict treats 0 as None.
    // OR IGNORE: re-approving an already-scheduled card keeps its schedule.
    sqlx::query(
        "INSERT OR IGNORE INTO card_schedule (card_id, due, stability, difficulty, state, step, reps, lapses, last_review)
         VALUES (?1, strftime('%Y-%m-%dT%H:%M:%SZ','now'), 0, 0, 'learning', 0, 0, 0, NULL)",
    )
    .bind(card_id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

async fn approve_quiz_db(pool: &SqlitePool, item_id: &str, edits: QuizEdits) -> Result<(), String> {
    let options_json = match edits.options {
        Some(o) => Some(serde_json::to_string(&o).map_err(|e| e.to_string())?),
        None => None,
    };
    sqlx::query(
        "UPDATE quiz_items SET question = COALESCE(?2, question), options_json = COALESCE(?3, options_json),
                answer_index = COALESCE(?4, answer_index), explanation = COALESCE(?5, explanation),
                reviewed = 1 WHERE id = ?1",
    )
    .bind(item_id)
    .bind(edits.question)
    .bind(options_json)
    .bind(edits.answer_index)
    .bind(edits.explanation)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

async fn delete_row(pool: &SqlitePool, table: &str, id: &str) -> Result<(), String> {
    // `table` is a fixed literal from the command, never user input.
    sqlx::query(&format!("DELETE FROM {table} WHERE id = ?1"))
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Tauri commands ─────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_review_queue(
    pool: State<'_, SqlitePool>,
    subject_id: String,
) -> Result<Vec<ReviewItem>, String> {
    queue(pool.inner(), &subject_id).await
}

#[tauri::command]
pub async fn approve_card(
    pool: State<'_, SqlitePool>,
    card_id: String,
    edits: Option<CardEdits>,
) -> Result<(), String> {
    approve_card_db(pool.inner(), &card_id, edits.unwrap_or_default()).await
}

#[tauri::command]
pub async fn reject_card(pool: State<'_, SqlitePool>, card_id: String) -> Result<(), String> {
    delete_row(pool.inner(), "cards", &card_id).await
}

#[tauri::command]
pub async fn approve_quiz_item(
    pool: State<'_, SqlitePool>,
    item_id: String,
    edits: Option<QuizEdits>,
) -> Result<(), String> {
    approve_quiz_db(pool.inner(), &item_id, edits.unwrap_or_default()).await
}

#[tauri::command]
pub async fn reject_quiz_item(pool: State<'_, SqlitePool>, item_id: String) -> Result<(), String> {
    delete_row(pool.inner(), "quiz_items", &item_id).await
}

#[tauri::command]
pub async fn approve_note(
    pool: State<'_, SqlitePool>,
    note_id: String,
    edits: Option<NoteEdits>,
) -> Result<(), String> {
    let edits = edits.unwrap_or_default();
    sqlx::query("UPDATE notes SET content = COALESCE(?2, content), reviewed = 1 WHERE id = ?1")
        .bind(&note_id)
        .bind(edits.content)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn reject_note(pool: State<'_, SqlitePool>, note_id: String) -> Result<(), String> {
    delete_row(pool.inner(), "notes", &note_id).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn pool_with_staged() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        sqlx::query("INSERT INTO subjects (id,name,color,created_at,updated_at) VALUES ('s','S','#000','t','t')")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO sources (id,subject_id,type,file_path,title,ingest_state,created_at) VALUES ('src','s','pdf','/a.pdf','Doc A','processed','t')")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO cards (id,subject_id,front,back,explanation,source_id,page,excerpt,reviewed,created_at) VALUES ('c1','s','Q','A','','src',7,'cited',0,'t')")
            .execute(&pool).await.unwrap();
        pool
    }

    #[tokio::test]
    async fn queue_builds_nested_citation() {
        let pool = pool_with_staged().await;
        let items = queue(&pool, "s").await.unwrap();
        assert_eq!(items.len(), 1);
        let json = serde_json::to_value(&items[0]).unwrap();
        assert_eq!(json["kind"], "card");
        assert_eq!(json["source_ref"]["source_title"], "Doc A");
        assert_eq!(json["source_ref"]["location"]["type"], "page");
        assert_eq!(json["source_ref"]["location"]["page"], 7);
        assert_eq!(json["source_ref"]["excerpt"], "cited");
    }

    #[tokio::test]
    async fn approve_reviews_and_schedules_then_leaves_queue() {
        let pool = pool_with_staged().await;
        approve_card_db(
            &pool,
            "c1",
            CardEdits {
                back: Some("Edited".into()),
                ..Default::default()
            },
        )
        .await
        .unwrap();

        let (reviewed, back): (i64, String) =
            sqlx::query_as("SELECT reviewed, back FROM cards WHERE id='c1'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(reviewed, 1);
        assert_eq!(back, "Edited", "edit applied on approve");

        let (sched,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM card_schedule WHERE card_id='c1' AND state='learning' AND step=0",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(
            sched, 1,
            "approved card enrols into FSRS as learning step=0"
        );

        assert!(
            queue(&pool, "s").await.unwrap().is_empty(),
            "approved item leaves the queue"
        );
    }

    #[tokio::test]
    async fn reject_deletes() {
        let pool = pool_with_staged().await;
        delete_row(&pool, "cards", "c1").await.unwrap();
        let (n,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM cards")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(n, 0);
    }
}
