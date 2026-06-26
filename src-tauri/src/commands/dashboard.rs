//! Subject dashboard (S-08). Assembles the achievement tree, the neutral study
//! stats, and the next upcoming deadline for one subject.
//!
//! Tree data is derived from `card_schedule` mastery, NOT the `concepts` table:
//! the generate pipeline produces cards/notes/quiz, never concepts, so a
//! concepts-based tree would always read empty. A card in `review` state counts
//! as a mastered (green) leaf; `learning`/`relearning` count as learning (gold).
//! See docs/adr/0005-tree-from-card-schedule.md.

use serde::Serialize;
use sqlx::SqlitePool;
use tauri::State;

use super::study::{self, StudyStats};

// ── Wire shapes (mirror TS SubjectDashboard / TreeData / Deadline) ─────────

#[derive(Serialize)]
struct TreeOut {
    mastery_pct: f64,
    concepts_total: i64,
    concepts_mastered: i64,
    concepts_learning: i64,
}

#[derive(Serialize)]
struct DeadlineOut {
    id: String,
    subject_id: String,
    title: String,
    due_at: String,
    #[serde(rename = "type")]
    kind: String,
}

#[derive(Serialize)]
pub struct SubjectDashboard {
    subject_id: String,
    tree: TreeOut,
    stats: StudyStats,
    next_deadline: Option<DeadlineOut>,
}

// ── DB layer ───────────────────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct TreeRow {
    total: i64,
    mastered: i64,
    learning: i64,
}

async fn fetch_tree(pool: &SqlitePool, subject_id: &str) -> Result<TreeOut, String> {
    let row: TreeRow = sqlx::query_as(
        "SELECT
           COUNT(*) AS total,
           COALESCE(SUM(CASE WHEN cs.state = 'review' THEN 1 ELSE 0 END), 0) AS mastered,
           COALESCE(SUM(CASE WHEN cs.state IN ('learning','relearning') THEN 1 ELSE 0 END), 0) AS learning
         FROM cards c JOIN card_schedule cs ON cs.card_id = c.id
         WHERE c.subject_id = ?1 AND c.reviewed = 1",
    )
    .bind(subject_id)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    let mastery_pct = if row.total > 0 {
        row.mastered as f64 / row.total as f64
    } else {
        0.0
    };
    Ok(TreeOut {
        mastery_pct,
        concepts_total: row.total,
        concepts_mastered: row.mastered,
        concepts_learning: row.learning,
    })
}

#[derive(sqlx::FromRow)]
struct DeadlineRow {
    id: String,
    subject_id: String,
    title: String,
    due_at: String,
    kind: String,
}

async fn fetch_next_deadline(
    pool: &SqlitePool,
    subject_id: &str,
) -> Result<Option<DeadlineOut>, String> {
    let row = sqlx::query_as::<_, DeadlineRow>(
        "SELECT id, subject_id, title, due_at, type AS kind FROM deadlines
         WHERE subject_id = ?1 AND due_at >= strftime('%Y-%m-%dT%H:%M:%SZ','now')
         ORDER BY due_at ASC LIMIT 1",
    )
    .bind(subject_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(row.map(|d| DeadlineOut {
        id: d.id,
        subject_id: d.subject_id,
        title: d.title,
        due_at: d.due_at,
        kind: d.kind,
    }))
}

async fn build_dashboard(pool: &SqlitePool, subject_id: &str) -> Result<SubjectDashboard, String> {
    Ok(SubjectDashboard {
        subject_id: subject_id.to_string(),
        tree: fetch_tree(pool, subject_id).await?,
        stats: study::fetch_stats(pool, subject_id).await?,
        next_deadline: fetch_next_deadline(pool, subject_id).await?,
    })
}

// ── Tauri command ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_subject_dashboard(
    pool: State<'_, SqlitePool>,
    subject_id: String,
) -> Result<SubjectDashboard, String> {
    build_dashboard(pool.inner(), &subject_id).await
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
        sqlx::query("INSERT INTO sources (id,subject_id,type,file_path,title,ingest_state,created_at) VALUES ('src','s','pdf','/a.pdf','Doc','processed','t')")
            .execute(&pool).await.unwrap();
        // Two approved cards: one mastered (review), one learning.
        for (id, state) in [("c1", "review"), ("c2", "learning")] {
            sqlx::query("INSERT INTO cards (id,subject_id,front,back,explanation,source_id,page,excerpt,reviewed,created_at) VALUES (?1,'s','Q','A','','src',1,'x',1,'t')")
                .bind(id).execute(&pool).await.unwrap();
            sqlx::query("INSERT INTO card_schedule (card_id,due,stability,difficulty,state,step,reps,lapses) VALUES (?1,'2030-01-01T00:00:00Z',1,1,?2,0,0,0)")
                .bind(id).bind(state).execute(&pool).await.unwrap();
        }
        pool
    }

    #[tokio::test]
    async fn tree_counts_mastered_and_learning() {
        let pool = seeded_pool().await;
        let tree = fetch_tree(&pool, "s").await.unwrap();
        assert_eq!(tree.concepts_total, 2);
        assert_eq!(tree.concepts_mastered, 1);
        assert_eq!(tree.concepts_learning, 1);
        assert!((tree.mastery_pct - 0.5).abs() < f64::EPSILON);
    }

    #[tokio::test]
    async fn empty_subject_has_zero_mastery() {
        let pool = seeded_pool().await;
        let tree = fetch_tree(&pool, "other").await.unwrap();
        assert_eq!(tree.concepts_total, 0);
        assert_eq!(tree.mastery_pct, 0.0, "no divide-by-zero");
    }

    #[tokio::test]
    async fn next_deadline_picks_earliest_future() {
        let pool = seeded_pool().await;
        sqlx::query("INSERT INTO deadlines (id,subject_id,title,due_at,type,created_at) VALUES ('d-past','s','Past','2000-01-01T00:00:00Z','exam','t')")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO deadlines (id,subject_id,title,due_at,type,created_at) VALUES ('d-far','s','Far','2999-12-01T00:00:00Z','exam','t')")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO deadlines (id,subject_id,title,due_at,type,created_at) VALUES ('d-near','s','Near','2999-06-01T00:00:00Z','assignment','t')")
            .execute(&pool).await.unwrap();

        let next = fetch_next_deadline(&pool, "s").await.unwrap().unwrap();
        assert_eq!(
            next.id, "d-near",
            "earliest future deadline wins; past excluded"
        );
        let json = serde_json::to_value(&next).unwrap();
        assert_eq!(
            json["type"], "assignment",
            "serialised as `type`, not `kind`"
        );
    }

    #[tokio::test]
    async fn dashboard_assembles_all_three() {
        let pool = seeded_pool().await;
        let dash = build_dashboard(&pool, "s").await.unwrap();
        assert_eq!(dash.tree.concepts_total, 2);
        assert_eq!(dash.stats.mastered, 1, "review-state card is mastered");
        assert!(dash.next_deadline.is_none(), "no deadlines seeded");
    }
}
