//! Approved content browsing (S-02 Content tab). Mirrors `review.rs`, but reads
//! the *trusted* side of the gate: only `reviewed = 1` rows, each rebuilt with
//! its citation. Pure SQLite; no sidecar.

use serde::Serialize;
use sqlx::SqlitePool;
use tauri::State;

// ── Wire shapes (mirror TS Card / QuizItem / Note + SourceRef) ─────────────

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
pub struct CardOut {
    id: String,
    subject_id: String,
    front: String,
    back: String,
    explanation: String,
    source_ref: SourceRefOut,
    reviewed: bool,
}

#[derive(Serialize)]
pub struct QuizOut {
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
pub struct NoteOut {
    id: String,
    subject_id: String,
    content: String,
    format: String,
    source_refs: Vec<SourceRefOut>,
    reviewed: bool,
}

#[derive(Serialize)]
pub struct BriefOut {
    id: String,
    subject_id: String,
    deadline_id: String,
    content: String,
    source_refs: Vec<SourceRefOut>,
    reviewed: bool,
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
struct BriefRow {
    id: String,
    subject_id: String,
    deadline_id: String,
    content: String,
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

async fn list_cards_db(pool: &SqlitePool, subject_id: &str) -> Result<Vec<CardOut>, String> {
    let rows = sqlx::query_as::<_, CardRow>(
        "SELECT c.id, c.subject_id, c.front, c.back, c.explanation, c.source_id, c.page,
                c.timestamp_ms, c.excerpt, s.title AS source_title
         FROM cards c JOIN sources s ON s.id = c.source_id
         WHERE c.subject_id = ?1 AND c.reviewed = 1 ORDER BY c.created_at",
    )
    .bind(subject_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(rows
        .into_iter()
        .map(|c| CardOut {
            id: c.id,
            subject_id: c.subject_id,
            front: c.front,
            back: c.back,
            explanation: c.explanation,
            source_ref: SourceRefOut {
                source_id: c.source_id,
                source_title: c.source_title,
                location: loc(c.page, c.timestamp_ms),
                excerpt: c.excerpt,
            },
            reviewed: true,
        })
        .collect())
}

async fn list_quiz_db(pool: &SqlitePool, subject_id: &str) -> Result<Vec<QuizOut>, String> {
    let rows = sqlx::query_as::<_, QuizRow>(
        "SELECT q.id, q.subject_id, q.question, q.options_json, q.answer_index, q.explanation,
                q.source_id, q.page, q.timestamp_ms, q.excerpt, s.title AS source_title
         FROM quiz_items q JOIN sources s ON s.id = q.source_id
         WHERE q.subject_id = ?1 AND q.reviewed = 1 ORDER BY q.created_at",
    )
    .bind(subject_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    let mut out = Vec::with_capacity(rows.len());
    for q in rows {
        let options: Vec<String> =
            serde_json::from_str(&q.options_json).map_err(|e| e.to_string())?;
        out.push(QuizOut {
            id: q.id,
            subject_id: q.subject_id,
            question: q.question,
            options,
            answer_index: q.answer_index,
            explanation: q.explanation,
            source_ref: SourceRefOut {
                source_id: q.source_id,
                source_title: q.source_title,
                location: loc(q.page, q.timestamp_ms),
                excerpt: q.excerpt,
            },
            reviewed: true,
        });
    }
    Ok(out)
}

async fn list_notes_db(pool: &SqlitePool, subject_id: &str) -> Result<Vec<NoteOut>, String> {
    let notes = sqlx::query_as::<_, NoteRow>(
        "SELECT id, subject_id, content, format FROM notes
         WHERE subject_id = ?1 AND reviewed = 1 ORDER BY created_at",
    )
    .bind(subject_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut out = Vec::with_capacity(notes.len());
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
        out.push(NoteOut {
            id: n.id,
            subject_id: n.subject_id,
            content: n.content,
            format: n.format,
            source_refs: refs
                .into_iter()
                .map(|r| SourceRefOut {
                    source_id: r.source_id,
                    source_title: r.source_title,
                    location: loc(r.page, r.timestamp_ms),
                    excerpt: r.excerpt,
                })
                .collect(),
            reviewed: true,
        });
    }
    Ok(out)
}

async fn list_briefs_db(pool: &SqlitePool, subject_id: &str) -> Result<Vec<BriefOut>, String> {
    let briefs = sqlx::query_as::<_, BriefRow>(
        "SELECT id, subject_id, deadline_id, content FROM assignment_briefs
         WHERE subject_id = ?1 AND reviewed = 1 ORDER BY created_at",
    )
    .bind(subject_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut out = Vec::with_capacity(briefs.len());
    for b in briefs {
        let refs = sqlx::query_as::<_, RefRow>(
            "SELECT r.source_id, r.page, r.timestamp_ms, r.excerpt, s.title AS source_title
             FROM assignment_brief_refs r JOIN sources s ON s.id = r.source_id
             WHERE r.brief_id = ?1",
        )
        .bind(&b.id)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
        out.push(BriefOut {
            id: b.id,
            subject_id: b.subject_id,
            deadline_id: b.deadline_id,
            content: b.content,
            source_refs: refs
                .into_iter()
                .map(|r| SourceRefOut {
                    source_id: r.source_id,
                    source_title: r.source_title,
                    location: loc(r.page, r.timestamp_ms),
                    excerpt: r.excerpt,
                })
                .collect(),
            reviewed: true,
        });
    }
    Ok(out)
}

// ── Tauri commands (thin adapters) ─────────────────────────────────────────

#[tauri::command]
pub async fn list_cards(
    pool: State<'_, SqlitePool>,
    subject_id: String,
) -> Result<Vec<CardOut>, String> {
    list_cards_db(pool.inner(), &subject_id).await
}

#[tauri::command]
pub async fn list_quiz(
    pool: State<'_, SqlitePool>,
    subject_id: String,
) -> Result<Vec<QuizOut>, String> {
    list_quiz_db(pool.inner(), &subject_id).await
}

#[tauri::command]
pub async fn list_notes(
    pool: State<'_, SqlitePool>,
    subject_id: String,
) -> Result<Vec<NoteOut>, String> {
    list_notes_db(pool.inner(), &subject_id).await
}

#[tauri::command]
pub async fn list_assignment_briefs(
    pool: State<'_, SqlitePool>,
    subject_id: String,
) -> Result<Vec<BriefOut>, String> {
    list_briefs_db(pool.inner(), &subject_id).await
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
        sqlx::query("INSERT INTO subjects (id,name,color,created_at,updated_at) VALUES ('s','S','#000','t','t')")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO sources (id,subject_id,type,file_path,title,ingest_state,created_at) VALUES ('src','s','pdf','/a.pdf','Doc A','processed','t')")
            .execute(&pool).await.unwrap();
        // One approved card, one still-staged card — only the approved one should list.
        sqlx::query("INSERT INTO cards (id,subject_id,front,back,explanation,source_id,page,excerpt,reviewed,created_at) VALUES ('c1','s','Q','A','E','src',7,'cited',1,'t')")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO cards (id,subject_id,front,back,explanation,source_id,page,excerpt,reviewed,created_at) VALUES ('c2','s','Q2','A2','','src',8,'x',0,'t')")
            .execute(&pool).await.unwrap();
        pool
    }

    #[tokio::test]
    async fn lists_only_approved_cards_with_citation() {
        let pool = seeded_pool().await;
        let cards = list_cards_db(&pool, "s").await.unwrap();
        assert_eq!(cards.len(), 1, "staged card excluded");
        let json = serde_json::to_value(&cards[0]).unwrap();
        assert_eq!(json["front"], "Q");
        assert_eq!(json["source_ref"]["source_title"], "Doc A");
        assert_eq!(json["source_ref"]["location"]["page"], 7);
    }

    #[tokio::test]
    async fn quiz_options_round_trip_and_notes_carry_refs() {
        let pool = seeded_pool().await;
        sqlx::query(
            "INSERT INTO quizzes (id,subject_id,title,created_at) VALUES ('qz','s','Quiz','t')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query("INSERT INTO quiz_items (id,quiz_id,subject_id,question,options_json,answer_index,explanation,source_id,page,excerpt,reviewed,created_at) VALUES ('q1','qz','s','Pick',?1,2,'','src',3,'ex',1,'t')")
            .bind(r#"["a","b","c","d"]"#)
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO notes (id,subject_id,content,format,reviewed,created_at) VALUES ('n1','s','# Note','outline',1,'t')")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO note_source_refs (id,note_id,source_id,page,excerpt) VALUES ('r1','n1','src',5,'ref-excerpt')")
            .execute(&pool).await.unwrap();

        let quiz = list_quiz_db(&pool, "s").await.unwrap();
        assert_eq!(quiz.len(), 1);
        assert_eq!(quiz[0].options, vec!["a", "b", "c", "d"]);
        assert_eq!(quiz[0].answer_index, 2);

        let notes = list_notes_db(&pool, "s").await.unwrap();
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].source_refs.len(), 1);
        let json = serde_json::to_value(&notes[0]).unwrap();
        assert_eq!(json["source_refs"][0]["excerpt"], "ref-excerpt");
    }

    #[tokio::test]
    async fn lists_only_approved_briefs_with_refs() {
        let pool = seeded_pool().await;
        sqlx::query("INSERT INTO deadlines (id,subject_id,title,due_at,type,created_at) VALUES ('d','s','Essay','2026-03-20T09:00:00Z','assignment','t')")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO assignment_briefs (id,deadline_id,subject_id,content,reviewed,created_at) VALUES ('b1','d','s','- approved',1,'t')")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO assignment_brief_refs (id,brief_id,source_id,page,excerpt) VALUES ('r1','b1','src',6,'ex')")
            .execute(&pool).await.unwrap();
        // A still-staged brief — must not list.
        sqlx::query("INSERT INTO assignment_briefs (id,deadline_id,subject_id,content,reviewed,created_at) VALUES ('b2','d','s','- staged',0,'t')")
            .execute(&pool).await.unwrap();

        let briefs = list_briefs_db(&pool, "s").await.unwrap();
        assert_eq!(briefs.len(), 1, "staged brief excluded");
        assert_eq!(briefs[0].deadline_id, "d");
        let json = serde_json::to_value(&briefs[0]).unwrap();
        assert_eq!(json["content"], "- approved");
        assert_eq!(json["source_refs"][0]["location"]["page"], 6);
        assert_eq!(json["source_refs"][0]["source_title"], "Doc A");
    }
}
