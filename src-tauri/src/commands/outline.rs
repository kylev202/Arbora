//! Unit outline (S-07b): the semester structure — term start + a list of weeks,
//! materials assigned to weeks, and which weeks an assignment covers. Pure SQLite;
//! no sidecar. AI parsing of a syllabus (slice 4) and the study brief (slice 5)
//! land in their own commands; this module is the manual + storage foundation.
//!
//! Week `start_date` is *derived* from the subject's `term_start` (week N starts
//! `(N-1)*7` days in) but stored per row so a user can nudge an individual week.
//! `set_outline` recomputes them whenever the term start or week count changes.

use std::time::Duration;

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::State;
use uuid::Uuid;

use crate::sidecar::Sidecar;

const MAX_WEEKS: i64 = 53; // a year of weeks — a generous upper bound

/// The role the fast import writes its single coordinator under. Both commit
/// paths key off it so a re-import replaces that one row, not the whole
/// teaching team the deep plan found.
pub(crate) const COORDINATOR_ROLE: &str = "Unit Coordinator";

/// Pre-fill the grade book from an assessment the syllabus lists, so the
/// what-if calculator works right away. Idempotent by (case-insensitive) name:
/// a fresh name inserts score = NULL; an ungraded row gets its weight
/// refreshed; a graded row is never touched. Shared by the fast import and the
/// deep plan's mark map, which can find assessments the fast pass missed.
pub(crate) async fn prefill_grade(
    tx: &mut sqlx::SqliteConnection,
    subject_id: &str,
    name: &str,
    weight_percent: f64,
) -> Result<(), String> {
    let name = name.trim();
    if name.is_empty() {
        return Ok(());
    }
    let weight = weight_percent.clamp(0.0, 100.0) / 100.0;
    let existing: Option<(String, Option<f64>)> = sqlx::query_as(
        "SELECT id, score FROM grades
         WHERE subject_id = ?1 AND lower(trim(name)) = lower(trim(?2)) LIMIT 1",
    )
    .bind(subject_id)
    .bind(name)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;
    match existing {
        None => {
            sqlx::query(
                "INSERT INTO grades (id, subject_id, name, category, score,
                    max_score, weight, created_at)
                 VALUES (?1, ?2, ?3, 'Assessment', NULL, 100, ?4,
                    strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
            )
            .bind(Uuid::new_v4().to_string())
            .bind(subject_id)
            .bind(name)
            .bind(weight)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        }
        Some((id, None)) => {
            sqlx::query("UPDATE grades SET weight = ?2 WHERE id = ?1")
                .bind(&id)
                .bind(weight)
                .execute(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;
        }
        Some((_, Some(_))) => {}
    }
    Ok(())
}

// ── Wire shapes ─────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Week {
    id: String,
    subject_id: String,
    week_number: i64,
    title: String,
    summary: String,
    start_date: Option<String>,
    /// Weekly detail from the deep plan pass (`unit_plan.rs`); empty until one
    /// is accepted, so a manually built outline is unaffected.
    lecture: String,
    lab: String,
    assessment_note: String,
    /// Not columns — filled from `week_items` after the row query.
    #[sqlx(skip)]
    focus: Vec<String>,
    #[sqlx(skip)]
    deliverables: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct Outline {
    term_start: Option<String>,
    week_count: Option<i64>,
    weeks: Vec<Week>,
}

/// A syllabus parsed by the sidecar but **not yet written** — the UI reviews and
/// edits this, then `commit_parsed_outline` persists it (review-before-trust).
/// Deserialised from `/parse-outline`, re-serialised to the UI in the same shape.
#[derive(Debug, Serialize, Deserialize)]
pub struct ParsedWeek {
    week_number: i64,
    #[serde(default)]
    title: String,
    #[serde(default)]
    summary: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ParsedDeadline {
    title: String,
    /// ISO date (YYYY-MM-DD) or "" when the syllabus gave none — the user fills
    /// it in during review; commit skips any still left blank.
    #[serde(default)]
    due_date: String,
    #[serde(rename = "type")]
    kind: String,
}

/// Unit info parsed from the syllabus alongside the schedule. Every field is
/// optional/defaulted — the sidecar degrades this to empty rather than failing
/// the parse, and the user reviews/edits it all before commit.
#[derive(Debug, Default, Serialize, Deserialize)]
pub struct ParsedClass {
    #[serde(default)]
    label: String,
    #[serde(default)]
    schedule: String,
    #[serde(default)]
    mode: String,
    #[serde(default)]
    attendance: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ParsedAssessment {
    name: String,
    #[serde(default)]
    weight_percent: f64,
    #[serde(default)]
    due_text: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct ParsedUnitInfo {
    #[serde(default)]
    unit_code: String,
    #[serde(default)]
    coordinator_name: String,
    #[serde(default)]
    coordinator_contact: String,
    #[serde(default)]
    delivery_summary: String,
    #[serde(default)]
    classes: Vec<ParsedClass>,
    #[serde(default)]
    assessments: Vec<ParsedAssessment>,
}

impl ParsedUnitInfo {
    /// True when the parse (or the user) filled nothing in — commit then leaves
    /// any previously saved unit info untouched instead of blanking it.
    fn is_empty(&self) -> bool {
        self.unit_code.trim().is_empty()
            && self.coordinator_name.trim().is_empty()
            && self.coordinator_contact.trim().is_empty()
            && self.delivery_summary.trim().is_empty()
            && self.classes.is_empty()
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ParsedOutline {
    weeks: Vec<ParsedWeek>,
    deadlines: Vec<ParsedDeadline>,
    #[serde(default)]
    unit_info: ParsedUnitInfo,
}

/// Stored unit info, as the UI reads it back (`get_unit_info`).
#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct UnitClass {
    id: String,
    label: String,
    schedule: String,
    mode: String,
    attendance: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct UnitOutcome {
    id: String,
    code: String,
    text: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct UnitStaff {
    id: String,
    name: String,
    role: String,
    contact: String,
    consultation: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct UnitAssessment {
    id: String,
    name: String,
    weight_percent: f64,
    due_text: String,
    kind: String,
    outcomes: String,
}

/// The "unit at a glance" the Overview screen renders. `unit_code` /
/// `delivery_summary` / `classes` come from the fast import; the rest is filled
/// by an accepted deep plan and stays empty otherwise.
#[derive(Debug, Serialize)]
pub struct UnitInfoView {
    unit_code: String,
    delivery_summary: String,
    aim: String,
    assumed_knowledge: String,
    platform: String,
    credit_points: String,
    classes: Vec<UnitClass>,
    outcomes: Vec<UnitOutcome>,
    staff: Vec<UnitStaff>,
    assessments: Vec<UnitAssessment>,
}

const WEEK_COLS: &str = "SELECT id, subject_id, week_number, title, summary, start_date,
     lecture, lab, assessment_note FROM weeks";

// ── DB layer (plain pool → unit-testable) ──────────────────────────────────

/// Hang each week's focus points and deliverables off its row. One query for
/// the whole set (`rows` is already scoped to a subject or a single week), then
/// a linear fan-out — never a query per week.
async fn attach_week_items(pool: &SqlitePool, weeks: &mut [Week]) -> Result<(), String> {
    if weeks.is_empty() {
        return Ok(());
    }
    let ids: Vec<&str> = weeks.iter().map(|w| w.id.as_str()).collect();
    let placeholders = (1..=ids.len())
        .map(|i| format!("?{i}"))
        .collect::<Vec<_>>()
        .join(",");
    let sql = format!(
        "SELECT week_id, kind, text FROM week_items
         WHERE week_id IN ({placeholders}) ORDER BY kind, position"
    );
    let mut query = sqlx::query_as::<_, (String, String, String)>(&sql);
    for id in &ids {
        query = query.bind(*id);
    }
    let rows = query.fetch_all(pool).await.map_err(|e| e.to_string())?;

    for (week_id, kind, text) in rows {
        let Some(week) = weeks.iter_mut().find(|w| w.id == week_id) else {
            continue;
        };
        match kind.as_str() {
            "focus" => week.focus.push(text),
            "deliverable" => week.deliverables.push(text),
            _ => {}
        }
    }
    Ok(())
}

async fn list_weeks(pool: &SqlitePool, subject_id: &str) -> Result<Vec<Week>, String> {
    let mut weeks = sqlx::query_as::<_, Week>(&format!(
        "{WEEK_COLS} WHERE subject_id = ?1 ORDER BY week_number"
    ))
    .bind(subject_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    attach_week_items(pool, &mut weeks).await?;
    Ok(weeks)
}

async fn fetch_week(pool: &SqlitePool, id: &str) -> Result<Week, String> {
    let week = sqlx::query_as::<_, Week>(&format!("{WEEK_COLS} WHERE id = ?1"))
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "WEEK_NOT_FOUND".to_string())?;
    let mut one = [week];
    attach_week_items(pool, &mut one).await?;
    let [week] = one;
    Ok(week)
}

async fn get_outline_db(pool: &SqlitePool, subject_id: &str) -> Result<Outline, String> {
    let meta: Option<(Option<String>, Option<i64>)> =
        sqlx::query_as("SELECT term_start, week_count FROM subjects WHERE id = ?1")
            .bind(subject_id)
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?;
    let (term_start, week_count) = meta.ok_or_else(|| "SUBJECT_NOT_FOUND".to_string())?;
    Ok(Outline {
        term_start,
        week_count,
        weeks: list_weeks(pool, subject_id).await?,
    })
}

/// Create/update the outline: persist term_start + week_count on the subject, then
/// reconcile the `weeks` rows so exactly `week_count` exist (keeping any titles /
/// summaries already entered) and recompute every week's `start_date`.
async fn set_outline_db(
    pool: &SqlitePool,
    subject_id: &str,
    term_start: Option<&str>,
    week_count: i64,
) -> Result<Outline, String> {
    if !(1..=MAX_WEEKS).contains(&week_count) {
        return Err(format!("week_count must be 1..={MAX_WEEKS}"));
    }

    sqlx::query(
        "UPDATE subjects SET term_start = ?2, week_count = ?3,
         updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?1",
    )
    .bind(subject_id)
    .bind(term_start)
    .bind(week_count)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    // Seed any missing weeks (UNIQUE(subject_id, week_number) makes this idempotent).
    for n in 1..=week_count {
        sqlx::query(
            "INSERT OR IGNORE INTO weeks (id, subject_id, week_number, created_at)
             VALUES (?1, ?2, ?3, strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(subject_id)
        .bind(n)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }

    // Drop weeks beyond the new count.
    sqlx::query("DELETE FROM weeks WHERE subject_id = ?1 AND week_number > ?2")
        .bind(subject_id)
        .bind(week_count)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    // Recompute start_date from term_start (NULL term_start → NULL dates).
    sqlx::query(
        "UPDATE weeks SET start_date = CASE
            WHEN ?1 IS NULL THEN NULL
            ELSE date(?1, '+' || ((week_number - 1) * 7) || ' days')
         END WHERE subject_id = ?2",
    )
    .bind(term_start)
    .bind(subject_id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    get_outline_db(pool, subject_id).await
}

/// Persist a user-confirmed parsed outline in **one transaction**: set the
/// subject's term start + week count, upsert the reviewed weeks (filling
/// topic/summary), reconcile the count, recompute dates, add the reviewed
/// deadlines, save the reviewed unit info + classes, and pre-fill the grade
/// book from the assessment overview. Either it all lands or none of it does.
async fn commit_parsed_outline_db(
    pool: &SqlitePool,
    subject_id: &str,
    term_start: Option<&str>,
    weeks: &[ParsedWeek],
    deadlines: &[ParsedDeadline],
    unit_info: Option<&ParsedUnitInfo>,
) -> Result<Outline, String> {
    let week_count = weeks.len() as i64;
    if !(0..=MAX_WEEKS).contains(&week_count) {
        return Err(format!("week_count must be 0..={MAX_WEEKS}"));
    }

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    sqlx::query(
        "UPDATE subjects SET term_start = ?2, week_count = ?3,
         updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?1",
    )
    .bind(subject_id)
    .bind(term_start)
    .bind(week_count)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Upsert each parsed week by (subject_id, week_number), filling the reviewed
    // topic/summary while keeping any existing row's identity (and its source
    // links, which key off the week id).
    for w in weeks {
        sqlx::query(
            "INSERT INTO weeks (id, subject_id, week_number, title, summary, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
             ON CONFLICT(subject_id, week_number)
             DO UPDATE SET title = excluded.title, summary = excluded.summary",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(subject_id)
        .bind(w.week_number)
        .bind(&w.title)
        .bind(&w.summary)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    // Drop weeks beyond the committed count, then recompute start dates.
    sqlx::query("DELETE FROM weeks WHERE subject_id = ?1 AND week_number > ?2")
        .bind(subject_id)
        .bind(week_count)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query(
        "UPDATE weeks SET start_date = CASE
            WHEN ?1 IS NULL THEN NULL
            ELSE date(?1, '+' || ((week_number - 1) * 7) || ' days')
         END WHERE subject_id = ?2",
    )
    .bind(term_start)
    .bind(subject_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Add each reviewed deadline. Skip any the user left without a date.
    for d in deadlines {
        let date = d.due_date.trim();
        if date.is_empty() {
            continue;
        }
        // Normalise a bare ISO date to the datetime the deadlines table stores.
        let due_at = if date.len() == 10 {
            format!("{date}T00:00:00Z")
        } else {
            date.to_string()
        };
        sqlx::query(
            "INSERT INTO deadlines (id, subject_id, title, due_at, type, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(subject_id)
        .bind(&d.title)
        .bind(&due_at)
        .bind(&d.kind)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    if let Some(info) = unit_info {
        // Only write when something was extracted/entered, so re-importing a
        // syllabus the model couldn't read doesn't blank saved unit info.
        if !info.is_empty() {
            sqlx::query(
                "INSERT INTO unit_info (subject_id, unit_code, delivery_summary, updated_at)
                 VALUES (?1, ?2, ?3, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
                 ON CONFLICT(subject_id) DO UPDATE SET
                    unit_code = excluded.unit_code,
                    delivery_summary = excluded.delivery_summary,
                    updated_at = excluded.updated_at",
            )
            .bind(subject_id)
            .bind(info.unit_code.trim())
            .bind(info.delivery_summary.trim())
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

            // The coordinator is one row of the staff table (which the deep plan
            // fills properly). Replace only the coordinator row so a re-import
            // can't wipe the lecturers and tutors a deep plan already found.
            if !info.coordinator_name.trim().is_empty()
                || !info.coordinator_contact.trim().is_empty()
            {
                sqlx::query("DELETE FROM unit_staff WHERE subject_id = ?1 AND role = ?2")
                    .bind(subject_id)
                    .bind(COORDINATOR_ROLE)
                    .execute(&mut *tx)
                    .await
                    .map_err(|e| e.to_string())?;
                sqlx::query(
                    "INSERT INTO unit_staff (id, subject_id, name, role, contact,
                        consultation, position, created_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, '', 0, strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
                )
                .bind(Uuid::new_v4().to_string())
                .bind(subject_id)
                .bind(info.coordinator_name.trim())
                .bind(COORDINATOR_ROLE)
                .bind(info.coordinator_contact.trim())
                .execute(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;
            }

            // Classes are display-only and nothing references them — replace.
            sqlx::query("DELETE FROM unit_classes WHERE subject_id = ?1")
                .bind(subject_id)
                .execute(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;
            for (i, c) in info.classes.iter().enumerate() {
                sqlx::query(
                    "INSERT INTO unit_classes (id, subject_id, label, schedule, mode,
                        attendance, position, created_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
                )
                .bind(Uuid::new_v4().to_string())
                .bind(subject_id)
                .bind(c.label.trim())
                .bind(c.schedule.trim())
                .bind(c.mode.trim())
                .bind(c.attendance.trim())
                .bind(i as i64)
                .execute(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;
            }
        }

        for a in &info.assessments {
            prefill_grade(&mut tx, subject_id, &a.name, a.weight_percent).await?;
        }
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    get_outline_db(pool, subject_id).await
}

async fn get_unit_info_db(
    pool: &SqlitePool,
    subject_id: &str,
) -> Result<Option<UnitInfoView>, String> {
    let row: Option<(String, String, String, String, String, String)> = sqlx::query_as(
        "SELECT unit_code, delivery_summary, aim, assumed_knowledge, platform, credit_points
         FROM unit_info WHERE subject_id = ?1",
    )
    .bind(subject_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;
    let Some((unit_code, delivery_summary, aim, assumed_knowledge, platform, credit_points)) = row
    else {
        return Ok(None);
    };
    let classes = sqlx::query_as::<_, UnitClass>(
        "SELECT id, label, schedule, mode, attendance FROM unit_classes
         WHERE subject_id = ?1 ORDER BY position",
    )
    .bind(subject_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    let outcomes = sqlx::query_as::<_, UnitOutcome>(
        "SELECT id, code, text FROM unit_outcomes WHERE subject_id = ?1 ORDER BY position",
    )
    .bind(subject_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    let staff = sqlx::query_as::<_, UnitStaff>(
        "SELECT id, name, role, contact, consultation FROM unit_staff
         WHERE subject_id = ?1 ORDER BY position",
    )
    .bind(subject_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    let assessments = sqlx::query_as::<_, UnitAssessment>(
        "SELECT id, name, weight_percent, due_text, kind, outcomes FROM unit_assessments
         WHERE subject_id = ?1 ORDER BY position",
    )
    .bind(subject_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(Some(UnitInfoView {
        unit_code,
        delivery_summary,
        aim,
        assumed_knowledge,
        platform,
        credit_points,
        classes,
        outcomes,
        staff,
        assessments,
    }))
}

async fn update_week_db(
    pool: &SqlitePool,
    week_id: &str,
    title: Option<&str>,
    summary: Option<&str>,
    start_date: Option<&str>,
) -> Result<Week, String> {
    // COALESCE keeps the existing value when an arg is omitted (None → NULL → keep).
    sqlx::query(
        "UPDATE weeks SET
            title = COALESCE(?2, title),
            summary = COALESCE(?3, summary),
            start_date = COALESCE(?4, start_date)
         WHERE id = ?1",
    )
    .bind(week_id)
    .bind(title)
    .bind(summary)
    .bind(start_date)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    fetch_week(pool, week_id).await
}

async fn assign_source_week_db(
    pool: &SqlitePool,
    source_id: &str,
    week_id: Option<&str>,
) -> Result<(), String> {
    sqlx::query("UPDATE sources SET week_id = ?2 WHERE id = ?1")
        .bind(source_id)
        .bind(week_id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

async fn set_coverage_db(
    pool: &SqlitePool,
    deadline_id: &str,
    week_ids: &[String],
) -> Result<(), String> {
    sqlx::query("DELETE FROM assignment_coverage WHERE deadline_id = ?1")
        .bind(deadline_id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    for week_id in week_ids {
        sqlx::query(
            "INSERT OR IGNORE INTO assignment_coverage (deadline_id, week_id) VALUES (?1, ?2)",
        )
        .bind(deadline_id)
        .bind(week_id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

async fn get_coverage_db(pool: &SqlitePool, deadline_id: &str) -> Result<Vec<String>, String> {
    let rows: Vec<(String,)> = sqlx::query_as(
        "SELECT ac.week_id FROM assignment_coverage ac
         JOIN weeks w ON w.id = ac.week_id
         WHERE ac.deadline_id = ?1 ORDER BY w.week_number",
    )
    .bind(deadline_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(rows.into_iter().map(|(id,)| id).collect())
}

// ── Tauri commands ─────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_outline(
    pool: State<'_, SqlitePool>,
    subject_id: String,
) -> Result<Outline, String> {
    get_outline_db(pool.inner(), &subject_id).await
}

#[tauri::command]
pub async fn set_outline(
    pool: State<'_, SqlitePool>,
    subject_id: String,
    term_start: Option<String>,
    week_count: i64,
) -> Result<Outline, String> {
    set_outline_db(pool.inner(), &subject_id, term_start.as_deref(), week_count).await
}

#[tauri::command]
pub async fn update_week(
    pool: State<'_, SqlitePool>,
    week_id: String,
    title: Option<String>,
    summary: Option<String>,
    start_date: Option<String>,
) -> Result<Week, String> {
    update_week_db(
        pool.inner(),
        &week_id,
        title.as_deref(),
        summary.as_deref(),
        start_date.as_deref(),
    )
    .await
}

#[tauri::command]
pub async fn assign_source_week(
    pool: State<'_, SqlitePool>,
    source_id: String,
    week_id: Option<String>,
) -> Result<(), String> {
    assign_source_week_db(pool.inner(), &source_id, week_id.as_deref()).await
}

#[tauri::command]
pub async fn set_assignment_coverage(
    pool: State<'_, SqlitePool>,
    deadline_id: String,
    week_ids: Vec<String>,
) -> Result<(), String> {
    set_coverage_db(pool.inner(), &deadline_id, &week_ids).await
}

#[tauri::command]
pub async fn get_assignment_coverage(
    pool: State<'_, SqlitePool>,
    deadline_id: String,
) -> Result<Vec<String>, String> {
    get_coverage_db(pool.inner(), &deadline_id).await
}

// ── Syllabus parse (sidecar AI, slice 4) ────────────────────────────────────
// The first AI in this feature. The sidecar extracts a structured outline from
// the user's own syllabus; this command just relays it back uncommitted. Nothing
// is written until `commit_parsed_outline` (review-before-trust, ADR-0006).

pub(crate) async fn fetch_preset(pool: &SqlitePool) -> String {
    sqlx::query_as::<_, (String,)>("SELECT ai_preset FROM settings WHERE id = 1")
        .fetch_one(pool)
        .await
        .map(|(p,)| p)
        .unwrap_or_else(|_| "medium".to_string())
}

#[tauri::command]
pub async fn parse_outline_file(
    sidecar: State<'_, Sidecar>,
    pool: State<'_, SqlitePool>,
    subject_id: String,
    file_path: String,
) -> Result<ParsedOutline, String> {
    let base = sidecar
        .base_url()
        .filter(|_| sidecar.is_ready())
        .ok_or("SIDECAR_UNAVAILABLE")?;
    let token = sidecar.token().to_string();
    let preset = fetch_preset(pool.inner()).await;

    let resp = reqwest::Client::new()
        .post(format!("{base}/parse-outline"))
        .header("X-Arbora-Token", &token)
        .json(&serde_json::json!({
            "subject_id": subject_id, "file_path": file_path,
            "llm_config": { "provider": "ollama" }, "preset": preset,
        }))
        // One local LLM call over a whole syllabus — give it room on weak hardware.
        .timeout(Duration::from_secs(180))
        .send()
        .await
        .map_err(|e| format!("PARSE_FAILED: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        // Surface the sidecar's reason (unsupported file, model unavailable, …).
        let detail = resp.text().await.unwrap_or_default();
        return Err(format!("PARSE_FAILED ({status}): {detail}"));
    }
    resp.json::<ParsedOutline>()
        .await
        .map_err(|e| format!("PARSE_FAILED: {e}"))
}

#[tauri::command]
pub async fn commit_parsed_outline(
    pool: State<'_, SqlitePool>,
    subject_id: String,
    term_start: Option<String>,
    weeks: Vec<ParsedWeek>,
    deadlines: Vec<ParsedDeadline>,
    unit_info: Option<ParsedUnitInfo>,
) -> Result<Outline, String> {
    commit_parsed_outline_db(
        pool.inner(),
        &subject_id,
        term_start.as_deref(),
        &weeks,
        &deadlines,
        unit_info.as_ref(),
    )
    .await
}

#[tauri::command]
pub async fn get_unit_info(
    pool: State<'_, SqlitePool>,
    subject_id: String,
) -> Result<Option<UnitInfoView>, String> {
    get_unit_info_db(pool.inner(), &subject_id).await
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
        // Foreign keys aren't on by default for :memory: pools; the SET NULL /
        // CASCADE behaviour we rely on needs them. Set AFTER migrate to match
        // db.rs, where table-rebuild migrations (0017) run with FKs off.
        sqlx::query("PRAGMA foreign_keys = ON")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO subjects (id,name,color,created_at,updated_at) VALUES ('s','S','#000','t','t')")
            .execute(&pool).await.unwrap();
        pool
    }

    #[tokio::test]
    async fn set_outline_seeds_weeks_and_dates() {
        let pool = mem_pool().await;
        let outline = set_outline_db(&pool, "s", Some("2026-02-23"), 3)
            .await
            .unwrap();
        assert_eq!(outline.week_count, Some(3));
        assert_eq!(outline.weeks.len(), 3);
        assert_eq!(outline.weeks[0].start_date.as_deref(), Some("2026-02-23"));
        assert_eq!(outline.weeks[1].start_date.as_deref(), Some("2026-03-02"));
        assert_eq!(outline.weeks[2].start_date.as_deref(), Some("2026-03-09"));
    }

    #[tokio::test]
    async fn set_outline_preserves_edits_and_reconciles_count() {
        let pool = mem_pool().await;
        set_outline_db(&pool, "s", Some("2026-02-23"), 3)
            .await
            .unwrap();
        let w2 = &list_weeks(&pool, "s").await.unwrap()[1];
        update_week_db(&pool, &w2.id, Some("Cell division"), Some("Mitosis"), None)
            .await
            .unwrap();

        // Grow then shrink: the edited week 2 keeps its title; week 3 is pruned.
        set_outline_db(&pool, "s", Some("2026-02-23"), 4)
            .await
            .unwrap();
        let shrunk = set_outline_db(&pool, "s", Some("2026-02-23"), 2)
            .await
            .unwrap();
        assert_eq!(shrunk.weeks.len(), 2);
        assert_eq!(shrunk.weeks[1].title, "Cell division");
        assert_eq!(shrunk.weeks[1].summary, "Mitosis");
    }

    #[tokio::test]
    async fn no_term_start_yields_null_dates() {
        let pool = mem_pool().await;
        let outline = set_outline_db(&pool, "s", None, 2).await.unwrap();
        assert!(outline.weeks.iter().all(|w| w.start_date.is_none()));
        assert!(outline.term_start.is_none());
    }

    #[tokio::test]
    async fn week_count_bounds_are_enforced() {
        let pool = mem_pool().await;
        assert!(set_outline_db(&pool, "s", None, 0).await.is_err());
        assert!(set_outline_db(&pool, "s", None, MAX_WEEKS + 1)
            .await
            .is_err());
    }

    #[tokio::test]
    async fn assign_source_to_week_and_clear() {
        let pool = mem_pool().await;
        set_outline_db(&pool, "s", None, 2).await.unwrap();
        let week_id = list_weeks(&pool, "s").await.unwrap()[0].id.clone();
        sqlx::query("INSERT INTO sources (id,subject_id,type,file_path,title,ingest_state,created_at) VALUES ('src','s','pdf','/a.pdf','A','processed','t')")
            .execute(&pool).await.unwrap();

        assign_source_week_db(&pool, "src", Some(&week_id))
            .await
            .unwrap();
        let (got,): (Option<String>,) =
            sqlx::query_as("SELECT week_id FROM sources WHERE id='src'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(got.as_deref(), Some(week_id.as_str()));

        assign_source_week_db(&pool, "src", None).await.unwrap();
        let (cleared,): (Option<String>,) =
            sqlx::query_as("SELECT week_id FROM sources WHERE id='src'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert!(cleared.is_none());
    }

    #[tokio::test]
    async fn deleting_a_week_unassigns_its_sources() {
        let pool = mem_pool().await;
        set_outline_db(&pool, "s", None, 2).await.unwrap();
        let week_id = list_weeks(&pool, "s").await.unwrap()[1].id.clone();
        sqlx::query("INSERT INTO sources (id,subject_id,type,file_path,title,ingest_state,created_at) VALUES ('src','s','pdf','/a.pdf','A','processed','t')")
            .execute(&pool).await.unwrap();
        assign_source_week_db(&pool, "src", Some(&week_id))
            .await
            .unwrap();

        // Shrinking to 1 week deletes week 2; its source should fall back to NULL.
        set_outline_db(&pool, "s", None, 1).await.unwrap();
        let (got,): (Option<String>,) =
            sqlx::query_as("SELECT week_id FROM sources WHERE id='src'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert!(
            got.is_none(),
            "ON DELETE SET NULL unassigns the orphaned source"
        );
    }

    #[tokio::test]
    async fn coverage_roundtrip_and_replace() {
        let pool = mem_pool().await;
        set_outline_db(&pool, "s", None, 3).await.unwrap();
        let weeks = list_weeks(&pool, "s").await.unwrap();
        sqlx::query("INSERT INTO deadlines (id,subject_id,title,due_at,type,created_at) VALUES ('d','s','Essay','2026-03-20T09:00:00Z','assignment','t')")
            .execute(&pool).await.unwrap();

        set_coverage_db(&pool, "d", &[weeks[0].id.clone(), weeks[1].id.clone()])
            .await
            .unwrap();
        assert_eq!(get_coverage_db(&pool, "d").await.unwrap().len(), 2);

        // Replacing collapses to the new set.
        set_coverage_db(&pool, "d", &[weeks[2].id.clone()])
            .await
            .unwrap();
        let cov = get_coverage_db(&pool, "d").await.unwrap();
        assert_eq!(cov, vec![weeks[2].id.clone()]);
    }

    // ── Parsed-outline commit ────────────────────────────────────────────────

    fn pweek(n: i64, title: &str) -> ParsedWeek {
        ParsedWeek {
            week_number: n,
            title: title.into(),
            summary: String::new(),
        }
    }

    fn pdeadline(title: &str, due: &str, kind: &str) -> ParsedDeadline {
        ParsedDeadline {
            title: title.into(),
            due_date: due.into(),
            kind: kind.into(),
        }
    }

    #[tokio::test]
    async fn commit_writes_weeks_and_dated_deadlines() {
        let pool = mem_pool().await;
        let weeks = vec![
            pweek(1, "Cells"),
            pweek(2, "Membranes"),
            pweek(3, "Genetics"),
        ];
        let deadlines = vec![
            pdeadline("Final exam", "2026-06-20", "exam"),
            pdeadline("No date yet", "", "assignment"), // skipped — user left it blank
        ];

        let outline =
            commit_parsed_outline_db(&pool, "s", Some("2026-02-23"), &weeks, &deadlines, None)
                .await
                .unwrap();
        assert_eq!(outline.week_count, Some(3));
        assert_eq!(outline.weeks[1].title, "Membranes");
        assert_eq!(outline.weeks[0].start_date.as_deref(), Some("2026-02-23"));
        assert_eq!(outline.weeks[2].start_date.as_deref(), Some("2026-03-09"));

        // Only the dated deadline is written, normalised to an ISO datetime.
        let rows: Vec<(String, String)> =
            sqlx::query_as("SELECT title, due_at FROM deadlines WHERE subject_id='s'")
                .fetch_all(&pool)
                .await
                .unwrap();
        assert_eq!(rows.len(), 1, "the dateless deadline is skipped");
        assert_eq!(
            rows[0],
            ("Final exam".into(), "2026-06-20T00:00:00Z".into())
        );
    }

    #[tokio::test]
    async fn commit_reconciles_count_and_keeps_source_links() {
        let pool = mem_pool().await;
        // Existing 3-week outline with a source hung off week 2.
        set_outline_db(&pool, "s", None, 3).await.unwrap();
        let week2 = list_weeks(&pool, "s").await.unwrap()[1].id.clone();
        sqlx::query("INSERT INTO sources (id,subject_id,type,file_path,title,ingest_state,week_id,created_at) VALUES ('src','s','pdf','/a.pdf','A','processed',?1,'t')")
            .bind(&week2).execute(&pool).await.unwrap();

        // Committing a parsed 2-week outline upserts weeks 1-2 and prunes week 3.
        commit_parsed_outline_db(&pool, "s", None, &[pweek(1, "A"), pweek(2, "B")], &[], None)
            .await
            .unwrap();

        let weeks = list_weeks(&pool, "s").await.unwrap();
        assert_eq!(weeks.len(), 2);
        // Week 2 kept its identity (upsert, not replace) so the source stays linked.
        assert_eq!(weeks[1].id, week2);
        let (linked,): (Option<String>,) =
            sqlx::query_as("SELECT week_id FROM sources WHERE id='src'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(linked.as_deref(), Some(week2.as_str()));
    }

    #[tokio::test]
    async fn commit_rejects_too_many_weeks() {
        let pool = mem_pool().await;
        let weeks: Vec<ParsedWeek> = (1..=MAX_WEEKS + 1).map(|n| pweek(n, "x")).collect();
        assert!(
            commit_parsed_outline_db(&pool, "s", None, &weeks, &[], None)
                .await
                .is_err()
        );
    }

    // ── Unit info + grades pre-fill ─────────────────────────────────────────

    fn punit(code: &str, assessments: Vec<ParsedAssessment>) -> ParsedUnitInfo {
        ParsedUnitInfo {
            unit_code: code.into(),
            coordinator_name: "Dr Ada Chen".into(),
            coordinator_contact: "ada@uni.edu".into(),
            delivery_summary: "Online lectures, on-campus tutorials.".into(),
            classes: vec![ParsedClass {
                label: "Tutorial".into(),
                schedule: "Wed 10:00-11:00".into(),
                mode: "on-campus".into(),
                attendance: "hurdle requirement".into(),
            }],
            assessments,
        }
    }

    fn passess(name: &str, weight: f64) -> ParsedAssessment {
        ParsedAssessment {
            name: name.into(),
            weight_percent: weight,
            due_text: String::new(),
        }
    }

    #[tokio::test]
    async fn commit_writes_unit_info_and_prefills_grades() {
        let pool = mem_pool().await;
        let info = punit(
            "BIOL101",
            vec![passess("Assignment 1", 30.0), passess("Final exam", 50.0)],
        );

        commit_parsed_outline_db(&pool, "s", None, &[pweek(1, "A")], &[], Some(&info))
            .await
            .unwrap();

        let stored = get_unit_info_db(&pool, "s").await.unwrap().unwrap();
        assert_eq!(stored.unit_code, "BIOL101");
        assert_eq!(stored.classes.len(), 1);
        assert_eq!(stored.classes[0].attendance, "hurdle requirement");
        // The coordinator is row 0 of the staff table, not a column of its own.
        assert_eq!(stored.staff.len(), 1);
        assert_eq!(stored.staff[0].name, "Dr Ada Chen");
        assert_eq!(stored.staff[0].role, COORDINATOR_ROLE);
        assert_eq!(stored.staff[0].contact, "ada@uni.edu");

        // Assessments landed in the grade book, score empty, weight %→fraction.
        let grades: Vec<(String, Option<f64>, f64)> = sqlx::query_as(
            "SELECT name, score, weight FROM grades WHERE subject_id='s' ORDER BY name",
        )
        .fetch_all(&pool)
        .await
        .unwrap();
        assert_eq!(grades.len(), 2);
        assert_eq!(grades[0], ("Assignment 1".into(), None, 0.3));
        assert_eq!(grades[1], ("Final exam".into(), None, 0.5));
    }

    #[tokio::test]
    async fn reimport_updates_ungraded_weight_and_never_touches_graded_rows() {
        let pool = mem_pool().await;
        let first = punit("BIOL101", vec![passess("Assignment 1", 30.0)]);
        commit_parsed_outline_db(&pool, "s", None, &[pweek(1, "A")], &[], Some(&first))
            .await
            .unwrap();

        // The user grades Assignment 1, then re-imports a corrected syllabus
        // where its weight changed and a new assessment appears.
        sqlx::query("UPDATE grades SET score = 82 WHERE subject_id='s'")
            .execute(&pool)
            .await
            .unwrap();
        let second = punit(
            "BIOL101",
            vec![passess("assignment 1", 40.0), passess("Quiz", 10.0)],
        );
        commit_parsed_outline_db(&pool, "s", None, &[pweek(1, "A")], &[], Some(&second))
            .await
            .unwrap();

        let grades: Vec<(String, Option<f64>, f64)> = sqlx::query_as(
            "SELECT name, score, weight FROM grades WHERE subject_id='s' ORDER BY name",
        )
        .fetch_all(&pool)
        .await
        .unwrap();
        // Case-insensitive match → no duplicate; graded row keeps its weight.
        assert_eq!(grades.len(), 2);
        assert_eq!(grades[0], ("Assignment 1".into(), Some(82.0), 0.3));
        assert_eq!(grades[1], ("Quiz".into(), None, 0.1));

        // Ungraded rows DO get their weight refreshed on a later re-import.
        let third = punit("BIOL101", vec![passess("Quiz", 15.0)]);
        commit_parsed_outline_db(&pool, "s", None, &[pweek(1, "A")], &[], Some(&third))
            .await
            .unwrap();
        let (quiz_weight,): (f64,) =
            sqlx::query_as("SELECT weight FROM grades WHERE subject_id='s' AND name='Quiz'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(quiz_weight, 0.15);
    }

    #[tokio::test]
    async fn empty_unit_info_does_not_blank_saved_data() {
        let pool = mem_pool().await;
        let info = punit("BIOL101", vec![]);
        commit_parsed_outline_db(&pool, "s", None, &[pweek(1, "A")], &[], Some(&info))
            .await
            .unwrap();

        // A re-import whose unit-info extraction degraded to empty leaves the
        // saved info (and classes) alone.
        commit_parsed_outline_db(
            &pool,
            "s",
            None,
            &[pweek(1, "A")],
            &[],
            Some(&ParsedUnitInfo::default()),
        )
        .await
        .unwrap();

        let stored = get_unit_info_db(&pool, "s").await.unwrap().unwrap();
        assert_eq!(stored.unit_code, "BIOL101");
        assert_eq!(stored.classes.len(), 1);
    }

    #[tokio::test]
    async fn reimport_replaces_the_coordinator_but_keeps_other_staff() {
        let pool = mem_pool().await;
        commit_parsed_outline_db(&pool, "s", None, &[], &[], Some(&punit("BIOL101", vec![])))
            .await
            .unwrap();
        // A deep plan later adds a tutor alongside the coordinator.
        sqlx::query(
            "INSERT INTO unit_staff (id,subject_id,name,role,contact,consultation,position,created_at)
             VALUES ('t','s','Sam Tutor','Tutor','sam@uni.edu','',1,'t')",
        )
        .execute(&pool)
        .await
        .unwrap();

        let mut updated = punit("BIOL101", vec![]);
        updated.coordinator_name = "Prof Blake".into();
        commit_parsed_outline_db(&pool, "s", None, &[], &[], Some(&updated))
            .await
            .unwrap();

        let staff = get_unit_info_db(&pool, "s").await.unwrap().unwrap().staff;
        let names: Vec<&str> = staff.iter().map(|s| s.name.as_str()).collect();
        assert!(names.contains(&"Prof Blake"), "coordinator was replaced");
        assert!(names.contains(&"Sam Tutor"), "other staff survived");
        assert_eq!(staff.len(), 2, "no duplicate coordinator row");
    }

    #[tokio::test]
    async fn unit_info_absent_returns_none() {
        let pool = mem_pool().await;
        assert!(get_unit_info_db(&pool, "s").await.unwrap().is_none());
    }
}
