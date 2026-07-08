//! Priority queue (S-07d): "what to focus on" per week. Computed, never stored —
//! like the grade summary in `plan.rs` — because both inputs (deadlines, study
//! state) change constantly; a stored score would be stale the moment a card is
//! reviewed or a deadline is added. See ADR-0006.
//!
//! Priority is a deliberate, user-chosen pair of factors ONLY: **deadline
//! proximity** (a near covering deadline pulls a week forward) and **unstudied
//! volume** (how many of the week's materials aren't studied yet). Not grade
//! weight, not FSRS-due. A week with nothing left to study scores 0 and drops off
//! the list — the signal is "here's what's worth doing," never punishment for
//! falling behind (a11y-adhd: no red, no "overdue").

use serde::Serialize;
use sqlx::SqlitePool;
use tauri::State;

/// One week's raw priority inputs, assembled from the DB before scoring. Kept
/// separate from `PriorityItem` so the scoring (`rank`) is a pure function over
/// plain rows and unit-testable without a database.
#[derive(Debug)]
struct WeekStat {
    week_id: String,
    week_number: i64,
    title: String,
    /// Materials in the week not yet studied: unprocessed, or processed but with
    /// no approved card yet.
    unstudied_count: i64,
    /// Whole days until the nearest *future* deadline covering this week (0 =
    /// today); `None` if no covering deadline lies ahead.
    nearest_deadline_days: Option<i64>,
    nearest_deadline_title: Option<String>,
}

/// A ranked focus suggestion for one week. Order conveys priority; the raw score
/// stays internal. `reason` is a calm, pre-built phrase the UI shows verbatim.
#[derive(Debug, Serialize)]
pub struct PriorityItem {
    week_id: String,
    week_number: i64,
    title: String,
    reason: String,
    days_until_deadline: Option<i64>,
    unstudied_count: i64,
}

// ── Scoring (pure → unit-testable) ──────────────────────────────────────────

/// Deadline pull in `[0, 1]`: 1 when due today/now, halving roughly every week,
/// 0 when there's no deadline ahead. Smooth and never negative.
fn proximity(days: Option<i64>) -> f64 {
    match days {
        Some(d) if d <= 0 => 1.0,
        Some(d) => 7.0 / (7.0 + d as f64),
        None => 0.0,
    }
}

/// Volume is the base; an approaching deadline amplifies whatever's left to do.
/// Zero unstudied ⇒ zero, so fully-studied weeks fall off the list.
fn score(stat: &WeekStat) -> f64 {
    if stat.unstudied_count <= 0 {
        return 0.0;
    }
    stat.unstudied_count as f64 * (1.0 + 2.0 * proximity(stat.nearest_deadline_days))
}

fn deadline_phrase(title: &str, days: i64) -> String {
    let when = match days {
        d if d <= 0 => "due today".to_string(),
        1 => "due tomorrow".to_string(),
        d => format!("due in {d} days"),
    };
    format!("{title} {when}")
}

fn reason(stat: &WeekStat) -> String {
    let volume = format!(
        "{} {} to study",
        stat.unstudied_count,
        if stat.unstudied_count == 1 {
            "material"
        } else {
            "materials"
        }
    );
    match (&stat.nearest_deadline_title, stat.nearest_deadline_days) {
        (Some(title), Some(days)) => format!("{} · {}", deadline_phrase(title, days), volume),
        _ => volume,
    }
}

/// Rank weeks with something left to study, most-worth-doing first. Weeks that
/// score 0 (nothing unstudied) are omitted entirely.
fn rank(stats: &[WeekStat]) -> Vec<PriorityItem> {
    let mut scored: Vec<(f64, &WeekStat)> = stats
        .iter()
        .map(|s| (score(s), s))
        .filter(|(sc, _)| *sc > 0.0)
        .collect();
    // Highest score first; ties broken by earlier week for a stable order.
    scored.sort_by(|a, b| {
        b.0.partial_cmp(&a.0)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(a.1.week_number.cmp(&b.1.week_number))
    });
    scored
        .into_iter()
        .map(|(_, s)| PriorityItem {
            week_id: s.week_id.clone(),
            week_number: s.week_number,
            title: s.title.clone(),
            reason: reason(s),
            days_until_deadline: s.nearest_deadline_days,
            unstudied_count: s.unstudied_count,
        })
        .collect()
}

// ── DB layer (plain pool → unit-testable) ───────────────────────────────────

async fn fetch_week_stats(pool: &SqlitePool, subject_id: &str) -> Result<Vec<WeekStat>, String> {
    let weeks: Vec<(String, i64, String)> =
        sqlx::query_as("SELECT id, week_number, title FROM weeks WHERE subject_id = ?1")
            .bind(subject_id)
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?;

    // Unstudied materials per week: a source counts as studied only once it's
    // processed AND has an approved (reviewed=1) card. Staged-but-unapproved
    // cards don't count — review-before-trust (law #2).
    let unstudied: Vec<(String, i64)> = sqlx::query_as(
        "SELECT s.week_id, COUNT(*)
         FROM sources s
         WHERE s.subject_id = ?1 AND s.week_id IS NOT NULL
           AND NOT (
             s.ingest_state = 'processed'
             AND EXISTS (SELECT 1 FROM cards c WHERE c.source_id = s.id AND c.reviewed = 1)
           )
         GROUP BY s.week_id",
    )
    .bind(subject_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    // Nearest future covering deadline per week. Ordered so the first row seen
    // for a week is its soonest one.
    let deadlines: Vec<(String, String, i64)> = sqlx::query_as(
        "SELECT ac.week_id, d.title,
                CAST(julianday(date(d.due_at)) - julianday(date('now')) AS INTEGER)
         FROM assignment_coverage ac
         JOIN deadlines d ON d.id = ac.deadline_id
         WHERE d.subject_id = ?1 AND date(d.due_at) >= date('now')
         ORDER BY ac.week_id, d.due_at ASC",
    )
    .bind(subject_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(weeks
        .into_iter()
        .map(|(week_id, week_number, title)| {
            let unstudied_count = unstudied
                .iter()
                .find(|(w, _)| *w == week_id)
                .map_or(0, |(_, n)| *n);
            let nearest = deadlines.iter().find(|(w, _, _)| *w == week_id);
            WeekStat {
                nearest_deadline_days: nearest.map(|(_, _, days)| *days),
                nearest_deadline_title: nearest.map(|(_, t, _)| t.clone()),
                week_id,
                week_number,
                title,
                unstudied_count,
            }
        })
        .collect())
}

// ── Tauri command ───────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_priority_queue(
    pool: State<'_, SqlitePool>,
    subject_id: String,
) -> Result<Vec<PriorityItem>, String> {
    let stats = fetch_week_stats(pool.inner(), &subject_id).await?;
    Ok(rank(&stats))
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    fn stat(number: i64, unstudied: i64, days: Option<i64>, title: Option<&str>) -> WeekStat {
        WeekStat {
            week_id: format!("w{number}"),
            week_number: number,
            title: format!("Week {number}"),
            unstudied_count: unstudied,
            nearest_deadline_days: days,
            nearest_deadline_title: title.map(str::to_string),
        }
    }

    #[test]
    fn proximity_decays_and_floors_at_zero() {
        assert_eq!(proximity(Some(0)), 1.0);
        assert_eq!(proximity(Some(-3)), 1.0, "today/now caps at 1");
        assert!((proximity(Some(7)) - 0.5).abs() < 1e-9, "halves in a week");
        assert!(proximity(Some(60)) < 0.2);
        assert_eq!(proximity(None), 0.0, "no deadline = no pull");
    }

    #[test]
    fn nothing_unstudied_drops_off_even_with_a_deadline() {
        // An imminent deadline but everything studied: not a focus item.
        let ranked = rank(&[stat(1, 0, Some(1), Some("Exam"))]);
        assert!(ranked.is_empty());
    }

    #[test]
    fn deadline_proximity_and_volume_both_lift_a_week() {
        let stats = vec![
            stat(1, 1, None, None),          // volume only → 1.0
            stat(2, 1, Some(30), Some("A")), // far deadline → ~1.38
            stat(3, 2, Some(2), Some("B")),  // near + more volume → ~5.1
        ];
        let ranked = rank(&stats);
        let order: Vec<i64> = ranked.iter().map(|i| i.week_number).collect();
        assert_eq!(order, vec![3, 2, 1]);
    }

    #[test]
    fn reason_reads_calmly_with_and_without_a_deadline() {
        let ranked = rank(&[stat(1, 2, Some(2), Some("Essay")), stat(2, 1, None, None)]);
        assert_eq!(
            ranked[0].reason,
            "Essay due in 2 days · 2 materials to study"
        );
        assert_eq!(
            ranked[1].reason, "1 material to study",
            "singular, no deadline"
        );
    }

    // ── DB layer ────────────────────────────────────────────────────────────

    async fn mem_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        // Set AFTER migrate to match db.rs, where table-rebuild migrations
        // (0017) run with foreign keys off.
        sqlx::query("PRAGMA foreign_keys = ON")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO subjects (id,name,color,created_at,updated_at) VALUES ('s','S','#000','t','t')")
            .execute(&pool).await.unwrap();
        // Two weeks.
        for n in 1..=2 {
            sqlx::query("INSERT INTO weeks (id,subject_id,week_number,title,created_at) VALUES (?1,'s',?2,?3,'t')")
                .bind(format!("w{n}")).bind(n).bind(format!("Topic {n}"))
                .execute(&pool).await.unwrap();
        }
        pool
    }

    async fn add_source(pool: &SqlitePool, id: &str, week: &str, state: &str) {
        sqlx::query("INSERT INTO sources (id,subject_id,type,file_path,title,ingest_state,week_id,created_at) VALUES (?1,'s','pdf','/a.pdf','A',?2,?3,'t')")
            .bind(id).bind(state).bind(week).execute(pool).await.unwrap();
    }

    async fn approve_card(pool: &SqlitePool, id: &str, source_id: &str) {
        sqlx::query("INSERT INTO cards (id,subject_id,front,back,explanation,source_id,page,excerpt,reviewed,created_at) VALUES (?1,'s','Q','A','',?2,1,'x',1,'t')")
            .bind(id).bind(source_id).execute(pool).await.unwrap();
    }

    #[tokio::test]
    async fn unstudied_counts_unprocessed_and_unapproved_only() {
        let pool = mem_pool().await;
        add_source(&pool, "studied", "w1", "processed").await;
        approve_card(&pool, "c1", "studied").await; // processed + approved → studied
        add_source(&pool, "no_card", "w1", "processed").await; // processed, no card → unstudied
        add_source(&pool, "queued", "w1", "queued").await; // not processed → unstudied

        let stats = fetch_week_stats(&pool, "s").await.unwrap();
        let w1 = stats.iter().find(|s| s.week_id == "w1").unwrap();
        assert_eq!(
            w1.unstudied_count, 2,
            "no_card + queued, not the studied one"
        );
        let w2 = stats.iter().find(|s| s.week_id == "w2").unwrap();
        assert_eq!(w2.unstudied_count, 0, "empty week");
    }

    #[tokio::test]
    async fn nearest_future_covering_deadline_wins_past_excluded() {
        let pool = mem_pool().await;
        add_source(&pool, "src", "w1", "queued").await; // give w1 something to study
                                                        // Past, far-future, and near-future deadlines, all covering w1.
        for (id, title, offset) in [
            ("dp", "Past", "-5 days"),
            ("df", "Far", "+40 days"),
            ("dn", "Near", "+3 days"),
        ] {
            sqlx::query("INSERT INTO deadlines (id,subject_id,title,due_at,type,created_at) VALUES (?1,'s',?2,strftime('%Y-%m-%dT09:00:00Z','now',?3),'assignment','t')")
                .bind(id).bind(title).bind(offset).execute(&pool).await.unwrap();
            sqlx::query("INSERT INTO assignment_coverage (deadline_id,week_id) VALUES (?1,'w1')")
                .bind(id)
                .execute(&pool)
                .await
                .unwrap();
        }

        let queue = get_priority_queue_inner(&pool, "s").await;
        assert_eq!(queue.len(), 1, "only w1 has anything to study");
        assert_eq!(
            queue[0].days_until_deadline,
            Some(3),
            "near, not far or past"
        );
        assert!(queue[0].reason.starts_with("Near due in 3 days"));
    }

    /// Thin shim so the DB tests can exercise the command's body without a Tauri
    /// `State`.
    async fn get_priority_queue_inner(pool: &SqlitePool, subject_id: &str) -> Vec<PriorityItem> {
        rank(&fetch_week_stats(pool, subject_id).await.unwrap())
    }
}
