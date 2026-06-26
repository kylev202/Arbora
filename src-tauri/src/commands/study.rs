//! FSRS study loop. `get_due_cards` returns what's reviewable now; `submit_card_review`
//! calls the sidecar's stateless `/schedule` to advance the card's FSRS state and
//! persists the result; `get_study_stats` provides the StudyTab counts and streak.

use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::SqlitePool;
use tauri::State;

use crate::sidecar::Sidecar;

// ── Shared wire shapes (same JSON layout as review.rs SourceRefOut/LocationOut) ──

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
enum LocationOut {
    Page { page: i64 },
    Timestamp { timestamp_ms: i64 },
}

#[derive(Serialize)]
struct SourceRefOut {
    source_id: String,
    source_title: String,
    location: LocationOut,
    excerpt: String,
}

fn loc(page: Option<i64>, ts: Option<i64>) -> LocationOut {
    match ts {
        Some(ms) => LocationOut::Timestamp { timestamp_ms: ms },
        None => LocationOut::Page {
            page: page.unwrap_or(0),
        },
    }
}

// ── Output types (mirror TS DueCard / CardSchedule / StudyStats) ───────────

#[derive(Serialize)]
struct CardOut {
    id: String,
    subject_id: String,
    front: String,
    back: String,
    explanation: String,
    source_ref: SourceRefOut,
    reviewed: bool,
}

#[derive(Serialize)]
struct ScheduleOut {
    card_id: String,
    due: String,
    stability: f64,
    difficulty: f64,
    state: String,
    last_review: Option<String>,
}

#[derive(Serialize)]
pub struct DueCardOut {
    card: CardOut,
    schedule: ScheduleOut,
}

#[derive(Serialize)]
pub struct NextSchedule {
    pub due: String,
    pub state: String,
}

#[derive(Serialize)]
pub struct StudyStats {
    pub due_today: i64,
    pub due_this_week: i64,
    pub mastered: i64,
    pub streak: i64,
}

// ── Flat query row → DueCardOut ────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct DueRow {
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
    due: String,
    stability: f64,
    difficulty: f64,
    state: String,
    last_review: Option<String>,
}

impl DueRow {
    fn into_due_card(self) -> DueCardOut {
        DueCardOut {
            schedule: ScheduleOut {
                card_id: self.id.clone(),
                due: self.due,
                stability: self.stability,
                difficulty: self.difficulty,
                state: self.state,
                last_review: self.last_review,
            },
            card: CardOut {
                id: self.id,
                subject_id: self.subject_id,
                front: self.front,
                back: self.back,
                explanation: self.explanation,
                reviewed: true,
                source_ref: SourceRefOut {
                    source_id: self.source_id,
                    source_title: self.source_title,
                    location: loc(self.page, self.timestamp_ms),
                    excerpt: self.excerpt,
                },
            },
        }
    }
}

// ── DB layer ───────────────────────────────────────────────────────────────

async fn fetch_due(
    pool: &SqlitePool,
    subject_id: &str,
    limit: i64,
) -> Result<Vec<DueCardOut>, String> {
    sqlx::query_as::<_, DueRow>(
        "SELECT c.id, c.subject_id, c.front, c.back, c.explanation,
                c.source_id, c.page, c.timestamp_ms, c.excerpt,
                s.title AS source_title,
                cs.due, cs.stability, cs.difficulty, cs.state, cs.last_review
         FROM cards c
         JOIN card_schedule cs ON cs.card_id = c.id
         JOIN sources s ON s.id = c.source_id
         WHERE c.subject_id = ?1 AND c.reviewed = 1
           AND cs.due <= strftime('%Y-%m-%dT%H:%M:%SZ','now')
         ORDER BY cs.due ASC
         LIMIT ?2",
    )
    .bind(subject_id)
    .bind(limit)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())
    .map(|rows| rows.into_iter().map(DueRow::into_due_card).collect())
}

// ── Schedule: read → sidecar → write ──────────────────────────────────────

#[derive(sqlx::FromRow)]
struct ScheduleRow {
    due: String,
    stability: f64,
    difficulty: f64,
    state: String,
    step: Option<i64>,
    last_review: Option<String>,
}

#[derive(Deserialize)]
struct ScheduleResp {
    due: String,
    stability: f64,
    difficulty: f64,
    state: String,
    step: Option<i64>,
    last_review: String,
}

async fn read_schedule(pool: &SqlitePool, card_id: &str) -> Result<ScheduleRow, String> {
    sqlx::query_as::<_, ScheduleRow>(
        "SELECT due, stability, difficulty, state, step, last_review
         FROM card_schedule WHERE card_id = ?1",
    )
    .bind(card_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| format!("SCHEDULE_NOT_FOUND:{card_id}"))
}

async fn call_schedule(
    sidecar: &Sidecar,
    sched: &ScheduleRow,
    rating: &str,
) -> Result<ScheduleResp, String> {
    let base = sidecar
        .base_url()
        .filter(|_| sidecar.is_ready())
        .ok_or("SIDECAR_UNAVAILABLE")?;
    let token = sidecar.token().to_string();

    reqwest::Client::new()
        .post(format!("{base}/schedule"))
        .header("X-Arbora-Token", &token)
        .json(&json!({
            "state": sched.state,
            "stability": sched.stability,
            "difficulty": sched.difficulty,
            "step": sched.step,
            "last_review": sched.last_review,
            "due": sched.due,
            "rating": rating,
        }))
        .send()
        .await
        .map_err(|e| format!("SCHEDULE_FAILED:{e}"))?
        .error_for_status()
        .map_err(|e| format!("SCHEDULE_FAILED:{e}"))?
        .json::<ScheduleResp>()
        .await
        .map_err(|e| format!("SCHEDULE_PARSE:{e}"))
}

async fn persist_schedule(
    pool: &SqlitePool,
    card_id: &str,
    r: &ScheduleResp,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE card_schedule
         SET due = ?2, stability = ?3, difficulty = ?4, state = ?5, step = ?6, last_review = ?7
         WHERE card_id = ?1",
    )
    .bind(card_id)
    .bind(&r.due)
    .bind(r.stability)
    .bind(r.difficulty)
    .bind(&r.state)
    .bind(r.step)
    .bind(&r.last_review)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Study stats ────────────────────────────────────────────────────────────

pub(crate) async fn fetch_stats(pool: &SqlitePool, subject_id: &str) -> Result<StudyStats, String> {
    let base = "FROM cards c JOIN card_schedule cs ON cs.card_id = c.id \
                WHERE c.subject_id = ?1 AND c.reviewed = 1";

    let (due_today,): (i64,) = sqlx::query_as(&format!(
        "SELECT COUNT(*) {base} AND cs.due <= strftime('%Y-%m-%dT%H:%M:%SZ','now')"
    ))
    .bind(subject_id)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    let (due_this_week,): (i64,) = sqlx::query_as(&format!(
        "SELECT COUNT(*) {base} \
         AND cs.due <= strftime('%Y-%m-%dT%H:%M:%SZ',datetime('now','+7 days'))"
    ))
    .bind(subject_id)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    let (mastered,): (i64,) =
        sqlx::query_as(&format!("SELECT COUNT(*) {base} AND cs.state = 'review'"))
            .bind(subject_id)
            .fetch_one(pool)
            .await
            .map_err(|e| e.to_string())?;

    // Streak: consecutive review days ending today (or yesterday if not yet reviewed today).
    // Row-number trick: date ranks 0,1,2,… from newest; a date is in the streak iff it
    // falls exactly rank days before the base (today or yesterday).
    let (streak,): (i64,) = sqlx::query_as(
        "WITH
           rd AS (
             SELECT DISTINCT date(cs.last_review) AS d
             FROM card_schedule cs JOIN cards c ON c.id = cs.card_id
             WHERE c.subject_id = ?1 AND cs.last_review IS NOT NULL
           ),
           seq AS (
             SELECT d, ROW_NUMBER() OVER (ORDER BY d DESC) - 1 AS n FROM rd
           ),
           base AS (
             SELECT CASE
               WHEN EXISTS(SELECT 1 FROM rd WHERE d = date('now'))
               THEN julianday(date('now'))
               ELSE julianday(date('now','-1 day'))
             END AS v
           )
         SELECT CAST(COUNT(*) AS INTEGER) FROM seq, base
         WHERE julianday(d) = base.v - seq.n",
    )
    .bind(subject_id)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(StudyStats {
        due_today,
        due_this_week,
        mastered,
        streak,
    })
}

// ── Tauri commands ─────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_due_cards(
    pool: State<'_, SqlitePool>,
    subject_id: String,
    limit: Option<i64>,
) -> Result<Vec<DueCardOut>, String> {
    fetch_due(pool.inner(), &subject_id, limit.unwrap_or(50)).await
}

#[tauri::command]
pub async fn submit_card_review(
    pool: State<'_, SqlitePool>,
    sidecar: State<'_, Sidecar>,
    card_id: String,
    rating: String,
) -> Result<NextSchedule, String> {
    let sched = read_schedule(pool.inner(), &card_id).await?;
    let resp = call_schedule(sidecar.inner(), &sched, &rating).await?;
    persist_schedule(pool.inner(), &card_id, &resp).await?;
    Ok(NextSchedule {
        due: resp.due,
        state: resp.state,
    })
}

#[tauri::command]
pub async fn get_study_stats(
    pool: State<'_, SqlitePool>,
    subject_id: String,
) -> Result<StudyStats, String> {
    fetch_stats(pool.inner(), &subject_id).await
}

// ── Tests ──────────────────────────────────────────────────────────────────

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
            "INSERT INTO subjects (id,name,color,created_at,updated_at)
             VALUES ('s1','S','#000','t','t')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO sources (id,subject_id,type,file_path,title,ingest_state,created_at)
             VALUES ('src1','s1','pdf','/a.pdf','Doc','processed','t')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO cards (id,subject_id,front,back,explanation,source_id,page,excerpt,reviewed,created_at)
             VALUES ('c1','s1','Q','A','','src1',1,'x',1,'t')",
        )
        .execute(&pool)
        .await
        .unwrap();
        // Due 1 hour ago (overdue → should appear in results)
        sqlx::query(
            "INSERT INTO card_schedule (card_id,due,stability,difficulty,state,step,reps,lapses)
             VALUES ('c1',strftime('%Y-%m-%dT%H:%M:%SZ',datetime('now','-1 hour')),0,0,'learning',0,0,0)",
        )
        .execute(&pool)
        .await
        .unwrap();
        pool
    }

    #[tokio::test]
    async fn due_card_appears_in_results() {
        let pool = seeded_pool().await;
        let cards = fetch_due(&pool, "s1", 50).await.unwrap();
        assert_eq!(cards.len(), 1);
        assert_eq!(cards[0].card.front, "Q");
        assert_eq!(cards[0].schedule.state, "learning");
    }

    #[tokio::test]
    async fn future_card_not_due() {
        let pool = seeded_pool().await;
        sqlx::query(
            "UPDATE card_schedule SET due = strftime('%Y-%m-%dT%H:%M:%SZ',datetime('now','+1 day'))",
        )
        .execute(&pool)
        .await
        .unwrap();
        assert!(fetch_due(&pool, "s1", 50).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn stats_counts_due_and_mastered() {
        let pool = seeded_pool().await;
        let stats = fetch_stats(&pool, "s1").await.unwrap();
        assert_eq!(stats.due_today, 1, "1h-ago card is due");
        assert_eq!(stats.due_this_week, 1);
        assert_eq!(stats.mastered, 0, "learning ≠ mastered");
    }

    #[tokio::test]
    async fn persist_schedule_updates_row() {
        let pool = seeded_pool().await;
        let resp = ScheduleResp {
            due: "2030-01-01T00:00:00Z".to_string(),
            stability: 5.0,
            difficulty: 3.0,
            state: "review".to_string(),
            step: None,
            last_review: "2026-06-25T12:00:00Z".to_string(),
        };
        persist_schedule(&pool, "c1", &resp).await.unwrap();
        let row = read_schedule(&pool, "c1").await.unwrap();
        assert_eq!(row.due, "2030-01-01T00:00:00Z");
        assert_eq!(row.state, "review");
        assert_eq!(row.step, None);
        assert!((row.stability - 5.0).abs() < f64::EPSILON);
    }

    #[tokio::test]
    async fn streak_counts_consecutive_days() {
        let pool = seeded_pool().await;
        // Mark card as reviewed today
        sqlx::query(
            "UPDATE card_schedule
             SET last_review = strftime('%Y-%m-%dT%H:%M:%SZ','now')",
        )
        .execute(&pool)
        .await
        .unwrap();
        let stats = fetch_stats(&pool, "s1").await.unwrap();
        assert_eq!(stats.streak, 1, "reviewed today → streak = 1");
    }
}
