//! AI week scheduler (redesign slice E). `propose_schedule` gathers the local
//! facts (study windows, subjects + review load, deadlines, lectures, busy
//! events, missed sessions, goal) and asks the sidecar's rule-based planner
//! for a proposal. NOTHING is written here — `accept_schedule` persists only
//! what the user approved (law #2), tagging events `origin='ai'` and creating
//! a linked todo per accepted session.

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::State;
use uuid::Uuid;

use crate::sidecar::Sidecar;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProposedSession {
    pub subject_id: Option<String>,
    pub title: String,
    pub start_at: String,
    pub end_at: String,
    pub kind: String,
    pub reason: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProposedMove {
    pub event_id: String,
    pub title: String,
    pub start_at: String,
    pub end_at: String,
    pub reason: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SubjectCoverage {
    pub subject_id: String,
    pub name: String,
    pub needed: i64,
    pub scheduled: i64,
    pub proposed: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SchedulePlan {
    pub sessions: Vec<ProposedSession>,
    pub moves: Vec<ProposedMove>,
    /// Per-subject weekly target vs. what's scheduled/proposed — drives the UI's
    /// "N of M planned" line and the keep-filling loop's stop condition.
    #[serde(default)]
    pub coverage: Vec<SubjectCoverage>,
    /// Total unmet sessions across subjects; zero = the week is covered.
    #[serde(default)]
    pub remaining: i64,
}

// ── Gather helpers (plain pool → unit-testable) ─────────────────────────────

/// "YYYY-MM-DDTHH:MM" local wall-clock now, comparable with event times.
async fn local_now(pool: &SqlitePool) -> String {
    sqlx::query_as::<_, (String,)>("SELECT strftime('%Y-%m-%dT%H:%M','now','localtime')")
        .fetch_one(pool)
        .await
        .map(|(s,)| s)
        .unwrap_or_default()
}

#[derive(sqlx::FromRow, Serialize)]
struct SubjectNeed {
    id: String,
    name: String,
    due_cards: i64,
}

/// Subjects with how many approved cards come due before `until`.
async fn subject_needs(pool: &SqlitePool, until: &str) -> Result<Vec<SubjectNeed>, String> {
    sqlx::query_as::<_, SubjectNeed>(
        "SELECT s.id, s.name,
                (SELECT COUNT(*) FROM cards c
                 JOIN card_schedule cs ON cs.card_id = c.id
                 WHERE c.subject_id = s.id AND cs.due <= ?1) AS due_cards
         FROM subjects s ORDER BY s.created_at",
    )
    .bind(until)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())
}

#[derive(sqlx::FromRow, Serialize)]
struct MissedRow {
    event_id: String,
    subject_id: Option<String>,
    title: String,
}

/// Planned study sessions that ended in the past (missed, neutrally speaking).
async fn missed_sessions(pool: &SqlitePool, now: &str) -> Result<Vec<MissedRow>, String> {
    sqlx::query_as::<_, MissedRow>(
        "SELECT id AS event_id, subject_id, title FROM calendar_events
         WHERE kind = 'study' AND status = 'planned' AND end_at < ?1
         ORDER BY start_at LIMIT 5",
    )
    .bind(now)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())
}

#[derive(sqlx::FromRow, Serialize)]
struct ExistingRow {
    subject_id: Option<String>,
    start_at: String,
    end_at: String,
}

/// Study sessions already on this week's calendar that still count toward
/// coverage — upcoming or done, never the missed ones (those are rescheduled
/// via `moves`). The planner credits these so it fills only the gap and never
/// double-books a subject the user already scheduled.
async fn existing_sessions(
    pool: &SqlitePool,
    week_from: &str,
    week_to: &str,
    now: &str,
) -> Result<Vec<ExistingRow>, String> {
    sqlx::query_as::<_, ExistingRow>(
        "SELECT subject_id, start_at, end_at FROM calendar_events
         WHERE kind = 'study' AND start_at >= ?1 AND start_at < ?2
           AND (status != 'planned' OR end_at >= ?3)
         ORDER BY start_at",
    )
    .bind(week_from)
    .bind(week_to)
    .bind(now)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())
}

/// The user's preferred session length in minutes — the median of their own
/// recent study blocks, so proposals mirror how long they actually plan to
/// study. Falls back to the calm 50-minute default with no history.
async fn preferred_session_minutes(pool: &SqlitePool) -> i64 {
    let mut mins = sqlx::query_as::<_, (i64,)>(
        "SELECT CAST(ROUND((julianday(end_at) - julianday(start_at)) * 1440) AS INTEGER)
         FROM calendar_events
         WHERE kind = 'study' AND origin = 'user' AND end_at > start_at
         ORDER BY start_at DESC LIMIT 20",
    )
    .fetch_all(pool)
    .await
    .map(|rows| rows.into_iter().map(|(m,)| m).collect::<Vec<_>>())
    .unwrap_or_default();
    if mins.is_empty() {
        return 50;
    }
    mins.sort_unstable();
    mins[mins.len() / 2].clamp(20, 120)
}

/// The hour of day (0–23) the user most often studies, from their own recent
/// study blocks, so proposals land when they actually tend to sit down. `None`
/// with no history — the planner then keeps plain chronological order.
async fn preferred_study_hour(pool: &SqlitePool) -> Option<i64> {
    let hours = sqlx::query_as::<_, (i64,)>(
        "SELECT CAST(strftime('%H', start_at) AS INTEGER)
         FROM calendar_events
         WHERE kind = 'study' AND origin = 'user' AND end_at > start_at
         ORDER BY start_at DESC LIMIT 20",
    )
    .fetch_all(pool)
    .await
    .map(|rows| rows.into_iter().map(|(h,)| h).collect::<Vec<_>>())
    .unwrap_or_default();
    if hours.is_empty() {
        return None;
    }
    // Mode — the most-used hour; ties resolve to the earlier hour so the nudge
    // stays gentle and stable.
    let mut counts: std::collections::HashMap<i64, usize> = std::collections::HashMap::new();
    for h in hours {
        *counts.entry(h).or_default() += 1;
    }
    counts
        .into_iter()
        .max_by(|a, b| a.1.cmp(&b.1).then(b.0.cmp(&a.0)))
        .map(|(h, _)| h)
}

/// (weekday, hour) pairs the user recently dismissed a proposal on — soft
/// "not this time" signals the planner steers future proposals away from.
/// Distinct (one heavily-dismissed slot counts once) and recency-bounded, so a
/// slot the user avoided months ago stops haunting the plan.
async fn dismissed_slots(pool: &SqlitePool) -> Vec<(i64, i64)> {
    sqlx::query_as::<_, (i64, i64)>(
        "SELECT DISTINCT weekday, hour FROM dismissed_slots
         WHERE dismissed_at >= strftime('%Y-%m-%dT%H:%M:%SZ','now','-28 days')",
    )
    .fetch_all(pool)
    .await
    .unwrap_or_default()
}

// ── Commands ────────────────────────────────────────────────────────────────

/// Build the planner input from local data and return the sidecar's proposal.
/// `week_start` = ISO date of the Monday to plan (the UI computes it).
#[tauri::command]
pub async fn propose_schedule(
    pool: State<'_, SqlitePool>,
    sidecar: State<'_, Sidecar>,
    week_start: String,
) -> Result<SchedulePlan, String> {
    let pool = pool.inner();
    let base = sidecar
        .base_url()
        .filter(|_| sidecar.is_ready())
        .ok_or("SIDECAR_UNAVAILABLE")?;

    let now = local_now(pool).await;

    // Week bounds as comparable naive ISO.
    let week_from = format!("{week_start}T00:00");
    let week_to: String =
        sqlx::query_as::<_, (String,)>("SELECT strftime('%Y-%m-%dT%H:%M', ?1, '+7 days')")
            .bind(&week_from)
            .fetch_one(pool)
            .await
            .map(|(s,)| s)
            .map_err(|e| e.to_string())?;

    let windows = sqlx::query_as::<_, (i64, String, String)>(
        "SELECT weekday, start_time, end_time FROM study_windows ORDER BY weekday, start_time",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let subjects = subject_needs(pool, &week_to).await?;

    let deadlines = sqlx::query_as::<_, (String, String, String, String)>(
        "SELECT subject_id, title, due_at, type FROM deadlines WHERE due_at >= ?1 ORDER BY due_at",
    )
    .bind(&now)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let lectures = sqlx::query_as::<_, (Option<String>, String, String)>(
        "SELECT subject_id, title, start_at FROM calendar_events
         WHERE kind = 'lecture' AND start_at >= ?1 AND start_at < ?2 ORDER BY start_at",
    )
    .bind(&week_from)
    .bind(&week_to)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let busy = sqlx::query_as::<_, (String, String)>(
        "SELECT start_at, end_at FROM calendar_events
         WHERE start_at >= ?1 AND start_at < ?2 ORDER BY start_at",
    )
    .bind(&week_from)
    .bind(&week_to)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let missed = missed_sessions(pool, &now).await?;
    let existing = existing_sessions(pool, &week_from, &week_to, &now).await?;
    let session_minutes = preferred_session_minutes(pool).await;
    let preferred_hour = preferred_study_hour(pool).await;
    let avoid_slots = dismissed_slots(pool).await;

    let goal = sqlx::query_as::<_, (Option<String>,)>("SELECT goal FROM user_profile WHERE id = 1")
        .fetch_one(pool)
        .await
        .map(|(g,)| g)
        .unwrap_or(None);

    let body = serde_json::json!({
        "week_start": week_start,
        "windows": windows.iter().map(|(weekday, start_time, end_time)| serde_json::json!({
            "weekday": weekday, "start_time": start_time, "end_time": end_time,
        })).collect::<Vec<_>>(),
        "subjects": subjects,
        "deadlines": deadlines.iter().map(|(subject_id, title, due_at, kind)| serde_json::json!({
            "subject_id": subject_id, "title": title, "due_at": due_at, "type": kind,
        })).collect::<Vec<_>>(),
        "lectures": lectures.iter().map(|(subject_id, title, start_at)| serde_json::json!({
            "subject_id": subject_id, "title": title, "start_at": start_at,
        })).collect::<Vec<_>>(),
        "busy": busy.iter().map(|(start_at, end_at)| serde_json::json!({
            "start_at": start_at, "end_at": end_at,
        })).collect::<Vec<_>>(),
        "missed": missed,
        "existing": existing,
        "goal": goal,
        "session_minutes": session_minutes,
        "preferred_hour": preferred_hour,
        "avoid_slots": avoid_slots.iter().map(|(weekday, hour)| serde_json::json!({
            "weekday": weekday, "hour": hour,
        })).collect::<Vec<_>>(),
    });

    reqwest::Client::new()
        .post(format!("{base}/schedule-plan"))
        .header("X-Arbora-Token", sidecar.token())
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("SCHEDULE_FAILED: {e}"))?
        .error_for_status()
        .map_err(|e| format!("SCHEDULE_FAILED: {e}"))?
        .json::<SchedulePlan>()
        .await
        .map_err(|e| format!("SCHEDULE_FAILED: {e}"))
}

/// Offer one different time for a proposed session the user can't make. Gathers
/// the same week context as `propose_schedule`, treats the other still-pending
/// proposals (`others`) as occupied so the alternative never collides with them,
/// and asks the sidecar for a single replacement slot. Writes nothing (law #2) —
/// the result is still a proposal the user accepts, edits, or re-rolls again.
/// `None` means the week is fully booked and there is no other time to offer.
#[tauri::command]
pub async fn resuggest_session(
    pool: State<'_, SqlitePool>,
    sidecar: State<'_, Sidecar>,
    week_start: String,
    session: ProposedSession,
    others: Vec<ProposedSession>,
) -> Result<Option<ProposedSession>, String> {
    let pool = pool.inner();
    let base = sidecar
        .base_url()
        .filter(|_| sidecar.is_ready())
        .ok_or("SIDECAR_UNAVAILABLE")?;

    let week_from = format!("{week_start}T00:00");
    let week_to: String =
        sqlx::query_as::<_, (String,)>("SELECT strftime('%Y-%m-%dT%H:%M', ?1, '+7 days')")
            .bind(&week_from)
            .fetch_one(pool)
            .await
            .map(|(s,)| s)
            .map_err(|e| e.to_string())?;

    let windows = sqlx::query_as::<_, (i64, String, String)>(
        "SELECT weekday, start_time, end_time FROM study_windows ORDER BY weekday, start_time",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut busy = sqlx::query_as::<_, (String, String)>(
        "SELECT start_at, end_at FROM calendar_events
         WHERE start_at >= ?1 AND start_at < ?2 ORDER BY start_at",
    )
    .bind(&week_from)
    .bind(&week_to)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    // The other pending proposals aren't persisted yet — pass them as occupied so
    // a re-roll never hands back a slot another suggestion already holds.
    for o in &others {
        busy.push((o.start_at.clone(), o.end_at.clone()));
    }

    let session_minutes = preferred_session_minutes(pool).await;
    let preferred_hour = preferred_study_hour(pool).await;
    let avoid_slots = dismissed_slots(pool).await;

    let body = serde_json::json!({
        "week_start": week_start,
        "windows": windows.iter().map(|(weekday, start_time, end_time)| serde_json::json!({
            "weekday": weekday, "start_time": start_time, "end_time": end_time,
        })).collect::<Vec<_>>(),
        "busy": busy.iter().map(|(start_at, end_at)| serde_json::json!({
            "start_at": start_at, "end_at": end_at,
        })).collect::<Vec<_>>(),
        "subject_id": session.subject_id,
        "title": session.title,
        "declined_start_at": session.start_at,
        "session_minutes": session_minutes,
        "preferred_hour": preferred_hour,
        "avoid_slots": avoid_slots.iter().map(|(weekday, hour)| serde_json::json!({
            "weekday": weekday, "hour": hour,
        })).collect::<Vec<_>>(),
    });

    reqwest::Client::new()
        .post(format!("{base}/resuggest-session"))
        .header("X-Arbora-Token", sidecar.token())
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("SCHEDULE_FAILED: {e}"))?
        .error_for_status()
        .map_err(|e| format!("SCHEDULE_FAILED: {e}"))?
        .json::<Option<ProposedSession>>()
        .await
        .map_err(|e| format!("SCHEDULE_FAILED: {e}"))
}

/// Persist ONLY the user-approved parts of a proposal, in one transaction:
/// accepted sessions become `origin='ai'` events each with a linked todo;
/// accepted moves update the missed event's times and mark it `moved`.
pub(crate) async fn accept(
    pool: &SqlitePool,
    sessions: Vec<ProposedSession>,
    moves: Vec<ProposedMove>,
) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    for s in &sessions {
        let event_id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO calendar_events
               (id, subject_id, title, start_at, end_at, kind, status, origin, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'planned', 'ai',
                     strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
        )
        .bind(&event_id)
        .bind(&s.subject_id)
        .bind(&s.title)
        .bind(&s.start_at)
        .bind(&s.end_at)
        .bind(&s.kind)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        sqlx::query(
            "INSERT INTO todos (id, subject_id, title, due, session_slot, kind, source, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, 'study', 'ai', strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(&s.subject_id)
        .bind(&s.title)
        .bind(s.start_at.split('T').next().unwrap_or(&s.start_at))
        .bind(&event_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    for m in &moves {
        sqlx::query(
            "UPDATE calendar_events SET start_at = ?2, end_at = ?3, status = 'moved' WHERE id = ?1",
        )
        .bind(&m.event_id)
        .bind(&m.start_at)
        .bind(&m.end_at)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn accept_schedule(
    pool: State<'_, SqlitePool>,
    sessions: Vec<ProposedSession>,
    moves: Vec<ProposedMove>,
) -> Result<(), String> {
    accept(pool.inner(), sessions, moves).await
}

/// Record that the user dismissed a proposed session: bank the (weekday, hour)
/// it fell on so future proposals steer away from that time (the negative half
/// of learning from the user's own choices). Best-effort and ordering-only — it
/// writes no calendar event and changes no target; the accept gate stays the
/// sole writer of real sessions (law #2). Weekday is stored in the planner's
/// Monday=0 convention (SQLite `%w` is Sunday=0, hence the `+6 % 7` shift).
pub(crate) async fn dismiss(pool: &SqlitePool, start_at: &str) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO dismissed_slots (id, weekday, hour, dismissed_at)
         VALUES (?1,
                 (CAST(strftime('%w', ?2) AS INTEGER) + 6) % 7,
                 CAST(strftime('%H', ?2) AS INTEGER),
                 strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(start_at)
    .execute(pool)
    .await
    .map(|_| ())
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn dismiss_proposal(
    pool: State<'_, SqlitePool>,
    session: ProposedSession,
) -> Result<(), String> {
    dismiss(pool.inner(), &session.start_at).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn mem_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        sqlx::query(
            "INSERT INTO subjects (id,name,color,created_at,updated_at) VALUES ('s1','Bio','#000','t','t')",
        )
        .execute(&pool)
        .await
        .unwrap();
        pool
    }

    #[tokio::test]
    async fn accept_writes_events_with_linked_todos_and_moves() {
        let pool = mem_pool().await;

        // A previously planned session that will be "moved".
        sqlx::query(
            "INSERT INTO calendar_events (id,subject_id,title,start_at,end_at,kind,status,origin,created_at)
             VALUES ('old','s1','Study Bio','2026-07-01T18:00','2026-07-01T19:00','study','planned','ai','t')",
        )
        .execute(&pool)
        .await
        .unwrap();

        accept(
            &pool,
            vec![ProposedSession {
                subject_id: Some("s1".into()),
                title: "Study Biology".into(),
                start_at: "2026-07-06T18:00".into(),
                end_at: "2026-07-06T18:50".into(),
                kind: "study".into(),
                reason: "Keeps Biology moving.".into(),
            }],
            vec![ProposedMove {
                event_id: "old".into(),
                title: "Study Bio".into(),
                start_at: "2026-07-08T18:00".into(),
                end_at: "2026-07-08T19:00".into(),
                reason: "next free window".into(),
            }],
        )
        .await
        .unwrap();

        let (kind, status, origin): (String, String, String) = sqlx::query_as(
            "SELECT kind, status, origin FROM calendar_events WHERE title = 'Study Biology'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(
            (kind.as_str(), status.as_str(), origin.as_str()),
            ("study", "planned", "ai")
        );

        let (todo_due, todo_source, slot): (String, String, Option<String>) = sqlx::query_as(
            "SELECT due, source, session_slot FROM todos WHERE title = 'Study Biology'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(todo_due, "2026-07-06");
        assert_eq!(todo_source, "ai");
        assert!(slot.is_some(), "todo pinned to its session");

        let (start, status): (String, String) =
            sqlx::query_as("SELECT start_at, status FROM calendar_events WHERE id = 'old'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(start, "2026-07-08T18:00");
        assert_eq!(status, "moved");
    }

    #[tokio::test]
    async fn gather_helpers_report_needs_and_missed() {
        let pool = mem_pool().await;

        // One approved card due tomorrow.
        sqlx::query(
            "INSERT INTO sources (id,subject_id,type,file_path,title,ingest_state,created_at)
             VALUES ('src1','s1','pdf','/a.pdf','N','processed','t')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO cards (id,subject_id,front,back,source_id,excerpt,reviewed,created_at)
             VALUES ('c1','s1','f','b','src1','e',1,'t')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO card_schedule (card_id,due,stability,difficulty,state)
             VALUES ('c1','2026-07-07T00:00',1.0,5.0,'review')",
        )
        .execute(&pool)
        .await
        .unwrap();

        let needs = subject_needs(&pool, "2026-07-13T00:00").await.unwrap();
        assert_eq!(needs.len(), 1);
        assert_eq!(needs[0].due_cards, 1);

        sqlx::query(
            "INSERT INTO calendar_events (id,subject_id,title,start_at,end_at,kind,status,origin,created_at)
             VALUES ('m1','s1','Study Bio','2026-07-01T18:00','2026-07-01T19:00','study','planned','user','t')",
        )
        .execute(&pool)
        .await
        .unwrap();
        let missed = missed_sessions(&pool, "2026-07-05T20:00").await.unwrap();
        assert_eq!(missed.len(), 1);
        assert_eq!(missed[0].event_id, "m1");
    }

    #[tokio::test]
    async fn existing_credits_upcoming_only_and_length_falls_back() {
        let pool = mem_pool().await;
        // No user study history yet → calm 50-minute default, no learned hour.
        assert_eq!(preferred_session_minutes(&pool).await, 50);
        assert_eq!(preferred_study_hour(&pool).await, None);

        // Upcoming user session this week (credited) …
        sqlx::query(
            "INSERT INTO calendar_events (id,subject_id,title,start_at,end_at,kind,status,origin,created_at)
             VALUES ('up','s1','Study Bio','2026-07-08T18:00','2026-07-08T19:00','study','planned','user','t')",
        )
        .execute(&pool)
        .await
        .unwrap();
        // … a missed one earlier the same week (excluded — it's rescheduled) …
        sqlx::query(
            "INSERT INTO calendar_events (id,subject_id,title,start_at,end_at,kind,status,origin,created_at)
             VALUES ('miss','s1','Study Bio','2026-07-06T18:00','2026-07-06T18:50','study','planned','user','t')",
        )
        .execute(&pool)
        .await
        .unwrap();

        let now = "2026-07-07T09:00";
        let rows = existing_sessions(&pool, "2026-07-06T00:00", "2026-07-13T00:00", now)
            .await
            .unwrap();
        assert_eq!(rows.len(), 1, "missed sessions are not credited");
        assert_eq!(rows[0].start_at, "2026-07-08T18:00");

        // Median of the user's own blocks (60 and 50 minutes) → the upper-middle.
        assert_eq!(preferred_session_minutes(&pool).await, 60);
        // Both user blocks start at 18:00 → that's the learned study hour.
        assert_eq!(preferred_study_hour(&pool).await, Some(18));
    }

    #[tokio::test]
    async fn dismiss_records_slot_and_gather_honours_recency() {
        let pool = mem_pool().await;
        assert!(
            dismissed_slots(&pool).await.is_empty(),
            "nothing dismissed yet"
        );

        // Monday 2026-07-06 18:00 → planner weekday 0 (Mon), hour 18.
        dismiss(&pool, "2026-07-06T18:00").await.unwrap();
        assert_eq!(dismissed_slots(&pool).await, vec![(0, 18)]);

        // A dismissal older than the 28-day horizon is ignored, so a stale
        // avoidance stops shaping the plan.
        sqlx::query(
            "INSERT INTO dismissed_slots (id,weekday,hour,dismissed_at)
             VALUES ('old',2,9,'2000-01-01T00:00:00Z')",
        )
        .execute(&pool)
        .await
        .unwrap();
        assert_eq!(
            dismissed_slots(&pool).await,
            vec![(0, 18)],
            "old dismissal excluded"
        );
    }
}
