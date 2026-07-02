//! Learning path (redesign §4.3): one stage per outline week, with card
//! mastery counts so the UI can mark done/current/upcoming. Stage state is
//! derived from mastery, never from dates — nothing here can be "overdue"
//! (ADR-0007). Today's progress additionally reports the subject's todos.

use serde::Serialize;
use sqlx::SqlitePool;
use tauri::State;

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct PathStage {
    pub week_id: String,
    pub week_number: i64,
    pub title: String,
    pub total_cards: i64,
    pub mastered_cards: i64,
    pub due_cards: i64,
}

#[derive(Debug, Serialize)]
pub struct SubjectPath {
    pub stages: Vec<PathStage>,
    /// Today's todos for this subject: (done, total) — the 0→100% bar.
    pub todos_done_today: i64,
    pub todos_total_today: i64,
}

async fn fetch_stages(pool: &SqlitePool, subject_id: &str) -> Result<Vec<PathStage>, String> {
    sqlx::query_as::<_, PathStage>(
        "SELECT w.id AS week_id, w.week_number, w.title,
                COUNT(c.id) AS total_cards,
                COALESCE(SUM(CASE WHEN cs.state = 'review' THEN 1 ELSE 0 END), 0) AS mastered_cards,
                COALESCE(SUM(CASE WHEN cs.due <= strftime('%Y-%m-%dT%H:%M:%SZ','now')
                                  THEN 1 ELSE 0 END), 0) AS due_cards
         FROM weeks w
         LEFT JOIN sources s ON s.week_id = w.id
         LEFT JOIN cards c ON c.source_id = s.id AND c.reviewed = 1
         LEFT JOIN card_schedule cs ON cs.card_id = c.id
         WHERE w.subject_id = ?1
         GROUP BY w.id
         ORDER BY w.week_number",
    )
    .bind(subject_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())
}

async fn todos_today(pool: &SqlitePool, subject_id: &str) -> Result<(i64, i64), String> {
    let (done, total): (i64, i64) = sqlx::query_as(
        "SELECT COALESCE(SUM(done), 0), COUNT(*)
         FROM todos
         WHERE subject_id = ?1 AND due = strftime('%Y-%m-%d','now','localtime')",
    )
    .bind(subject_id)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok((done, total))
}

#[tauri::command]
pub async fn get_subject_path(
    pool: State<'_, SqlitePool>,
    subject_id: String,
) -> Result<SubjectPath, String> {
    let stages = fetch_stages(pool.inner(), &subject_id).await?;
    let (todos_done_today, todos_total_today) = todos_today(pool.inner(), &subject_id).await?;
    Ok(SubjectPath {
        stages,
        todos_done_today,
        todos_total_today,
    })
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
        sqlx::query(
            "INSERT INTO subjects (id,name,color,created_at,updated_at) VALUES ('s','S','#000','t','t')",
        )
        .execute(&pool)
        .await
        .unwrap();
        for (id, n, title) in [("w1", 1, "Intro"), ("w2", 2, "Genetics")] {
            sqlx::query(
                "INSERT INTO weeks (id,subject_id,week_number,title,created_at) VALUES (?1,'s',?2,?3,'t')",
            )
            .bind(id)
            .bind(n)
            .bind(title)
            .execute(&pool)
            .await
            .unwrap();
        }
        // Week 1: one mastered card. Week 2: no material yet.
        sqlx::query(
            "INSERT INTO sources (id,subject_id,type,file_path,title,ingest_state,week_id,created_at)
             VALUES ('src1','s','pdf','/a.pdf','Doc','processed','w1','t')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO cards (id,subject_id,front,back,source_id,excerpt,reviewed,created_at)
             VALUES ('c1','s','f','b','src1','e',1,'t')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO card_schedule (card_id,due,stability,difficulty,state)
             VALUES ('c1','2030-01-01T00:00:00Z',1,1,'review')",
        )
        .execute(&pool)
        .await
        .unwrap();
        pool
    }

    #[tokio::test]
    async fn stages_report_mastery_per_week() {
        let pool = seeded_pool().await;
        let stages = fetch_stages(&pool, "s").await.unwrap();
        assert_eq!(stages.len(), 2);
        assert_eq!(stages[0].week_number, 1);
        assert_eq!(stages[0].total_cards, 1);
        assert_eq!(stages[0].mastered_cards, 1, "week 1 fully mastered");
        assert_eq!(stages[1].total_cards, 0, "week 2 has no material yet");
    }

    #[tokio::test]
    async fn todos_today_counts_only_todays_subject_todos() {
        let pool = seeded_pool().await;
        sqlx::query(
            "INSERT INTO todos (id,subject_id,title,due,source,created_at)
             VALUES ('t1','s','Now', strftime('%Y-%m-%d','now','localtime'), 'user','t'),
                    ('t2','s','Later','2099-01-01','user','t')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query("UPDATE todos SET done = 1 WHERE id = 't1'")
            .execute(&pool)
            .await
            .unwrap();
        let (done, total) = todos_today(&pool, "s").await.unwrap();
        assert_eq!((done, total), (1, 1), "future todos excluded");
    }
}
