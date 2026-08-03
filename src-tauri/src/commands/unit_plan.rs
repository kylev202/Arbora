//! The deep unit plan: the "unit at a glance", the assessment mark map, and
//! per-week detail — everything a real unit outline carries beyond the weeks
//! and deadlines `outline.rs` already imports.
//!
//! **Why it is a background job.** The sidecar runs several constrained LLM
//! calls for this (see `outline/plan.py`), which is minutes on the low preset.
//! Making the import modal wait would make importing a syllabus feel broken on
//! exactly the hardware Arbora targets. So the fast import commits first, this
//! runs behind it, and the result is staged in `unit_plan_drafts` until the user
//! opens the review gate — nothing extracted here reaches the real tables
//! without an explicit accept (ADR-0006, law #2).
//!
//! The draft is a table rather than in-memory state so a plan that finishes
//! while the user is elsewhere in the app — or after a restart — is still there
//! to review.

use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::SqlitePool;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use super::outline::{fetch_preset, prefill_grade, COORDINATOR_ROLE};
use crate::sidecar::Sidecar;

/// The deep pass is several LLM calls over a whole syllabus. On the low preset
/// that is minutes, not seconds — nothing is waiting on it, so the timeout is
/// generous enough that weak hardware finishes rather than fails.
const PARSE_TIMEOUT: Duration = Duration::from_secs(900);

// ── Wire shapes (mirror `schemas/output.py::UnitPlanResult`) ────────────────

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PlanOutcome {
    #[serde(default)]
    pub code: String,
    pub text: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PlanStaff {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub role: String,
    #[serde(default)]
    pub contact: String,
    #[serde(default)]
    pub consultation: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PlanEssentials {
    #[serde(default)]
    pub aim: String,
    #[serde(default)]
    pub assumed_knowledge: String,
    #[serde(default)]
    pub platform: String,
    #[serde(default)]
    pub credit_points: String,
    #[serde(default)]
    pub outcomes: Vec<PlanOutcome>,
    #[serde(default)]
    pub staff: Vec<PlanStaff>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PlanAssessment {
    pub name: String,
    #[serde(default)]
    pub weight_percent: f64,
    #[serde(default)]
    pub due_text: String,
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub outcomes: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PlanWeekDetail {
    pub week_number: i64,
    #[serde(default)]
    pub lecture: String,
    #[serde(default)]
    pub lab: String,
    #[serde(default)]
    pub assessment_note: String,
    #[serde(default)]
    pub focus: Vec<String>,
    #[serde(default)]
    pub deliverables: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct UnitPlan {
    #[serde(default)]
    pub essentials: PlanEssentials,
    #[serde(default)]
    pub assessments: Vec<PlanAssessment>,
    #[serde(default)]
    pub week_details: Vec<PlanWeekDetail>,
}

impl UnitPlan {
    /// True when every pass degraded to nothing. There is no point opening a
    /// review gate over an empty plan, so the job reports this as an error the
    /// user can act on ("we couldn't read more detail out of this file").
    fn is_empty(&self) -> bool {
        let e = &self.essentials;
        e.aim.trim().is_empty()
            && e.assumed_knowledge.trim().is_empty()
            && e.platform.trim().is_empty()
            && e.credit_points.trim().is_empty()
            && e.outcomes.is_empty()
            && e.staff.is_empty()
            && self.assessments.is_empty()
            && self.week_details.is_empty()
    }
}

/// The staged draft as the UI reads it. `state` is `running` | `ready` | `error`.
#[derive(Debug, Serialize)]
pub struct UnitPlanDraft {
    pub state: String,
    pub plan: Option<UnitPlan>,
    pub error: String,
    pub updated_at: String,
}

// ── Draft storage ───────────────────────────────────────────────────────────

async fn set_draft(
    pool: &SqlitePool,
    subject_id: &str,
    state: &str,
    file_path: &str,
    payload: &str,
    error: &str,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO unit_plan_drafts (subject_id, state, file_path, payload, error, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
         ON CONFLICT(subject_id) DO UPDATE SET
            state = excluded.state, file_path = excluded.file_path,
            payload = excluded.payload, error = excluded.error,
            updated_at = excluded.updated_at",
    )
    .bind(subject_id)
    .bind(state)
    .bind(file_path)
    .bind(payload)
    .bind(error)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

async fn get_draft_db(
    pool: &SqlitePool,
    subject_id: &str,
) -> Result<Option<UnitPlanDraft>, String> {
    let row: Option<(String, String, String, String)> = sqlx::query_as(
        "SELECT state, payload, error, updated_at FROM unit_plan_drafts WHERE subject_id = ?1",
    )
    .bind(subject_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;
    let Some((state, payload, error, updated_at)) = row else {
        return Ok(None);
    };
    // A payload that no longer deserialises (an older draft after a shape
    // change) degrades to "nothing to review" rather than breaking the screen.
    let plan = serde_json::from_str::<UnitPlan>(&payload).ok();
    Ok(Some(UnitPlanDraft {
        state,
        plan,
        error,
        updated_at,
    }))
}

async fn dismiss_draft_db(pool: &SqlitePool, subject_id: &str) -> Result<(), String> {
    sqlx::query("DELETE FROM unit_plan_drafts WHERE subject_id = ?1")
        .bind(subject_id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Commit (the review gate's accept) ───────────────────────────────────────

/// Persist a user-confirmed deep plan in **one transaction**. Each section is
/// replaced wholesale — the user just reviewed the whole thing, and these
/// tables are display-only (nothing references their ids) — except the weeks,
/// which are matched by `week_number` so their identity, and the sources hung
/// off them, survive.
async fn commit_unit_plan_db(
    pool: &SqlitePool,
    subject_id: &str,
    plan: &UnitPlan,
) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let e = &plan.essentials;

    // Ensure a unit_info row exists even when only a deep plan has ever run —
    // `get_unit_info` keys off it, and would otherwise return None with the
    // outcomes and staff stranded.
    sqlx::query(
        "INSERT INTO unit_info (subject_id, aim, assumed_knowledge, platform,
            credit_points, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
         ON CONFLICT(subject_id) DO UPDATE SET
            aim = excluded.aim,
            assumed_knowledge = excluded.assumed_knowledge,
            platform = excluded.platform,
            credit_points = excluded.credit_points,
            updated_at = excluded.updated_at",
    )
    .bind(subject_id)
    .bind(e.aim.trim())
    .bind(e.assumed_knowledge.trim())
    .bind(e.platform.trim())
    .bind(e.credit_points.trim())
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Learning outcomes.
    sqlx::query("DELETE FROM unit_outcomes WHERE subject_id = ?1")
        .bind(subject_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    for (i, o) in e.outcomes.iter().enumerate() {
        if o.text.trim().is_empty() {
            continue;
        }
        sqlx::query(
            "INSERT INTO unit_outcomes (id, subject_id, code, text, position, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(subject_id)
        .bind(o.code.trim())
        .bind(o.text.trim())
        .bind(i as i64)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    // Teaching staff. Only replace when this pass actually found people —
    // otherwise an empty essentials pass would delete the coordinator the fast
    // import already saved.
    if !e.staff.is_empty() {
        sqlx::query("DELETE FROM unit_staff WHERE subject_id = ?1")
            .bind(subject_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        for (i, s) in e.staff.iter().enumerate() {
            if s.name.trim().is_empty() && s.contact.trim().is_empty() {
                continue;
            }
            let role = if s.role.trim().is_empty() && i == 0 {
                COORDINATOR_ROLE
            } else {
                s.role.trim()
            };
            sqlx::query(
                "INSERT INTO unit_staff (id, subject_id, name, role, contact,
                    consultation, position, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
            )
            .bind(Uuid::new_v4().to_string())
            .bind(subject_id)
            .bind(s.name.trim())
            .bind(role)
            .bind(s.contact.trim())
            .bind(s.consultation.trim())
            .bind(i as i64)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    // Mark map, plus the same grade-book pre-fill the fast import does: the
    // deep pass routinely finds assessments (weekly labs, quizzes) the summary
    // pass misses, and a graded row is still never overwritten.
    sqlx::query("DELETE FROM unit_assessments WHERE subject_id = ?1")
        .bind(subject_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    for (i, a) in plan.assessments.iter().enumerate() {
        if a.name.trim().is_empty() {
            continue;
        }
        sqlx::query(
            "INSERT INTO unit_assessments (id, subject_id, name, weight_percent,
                due_text, kind, outcomes, position, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(subject_id)
        .bind(a.name.trim())
        .bind(a.weight_percent.clamp(0.0, 100.0))
        .bind(a.due_text.trim())
        .bind(a.kind.trim())
        .bind(a.outcomes.trim())
        .bind(i as i64)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
        prefill_grade(&mut tx, subject_id, &a.name, a.weight_percent).await?;
    }

    // Per-week detail, matched to existing weeks by number. A week the outline
    // doesn't have is skipped rather than created: the outline is the spine,
    // and inventing a week here would desync it from the user's week count.
    for d in &plan.week_details {
        let week_id: Option<(String,)> =
            sqlx::query_as("SELECT id FROM weeks WHERE subject_id = ?1 AND week_number = ?2")
                .bind(subject_id)
                .bind(d.week_number)
                .fetch_optional(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;
        let Some((week_id,)) = week_id else { continue };

        sqlx::query("UPDATE weeks SET lecture = ?2, lab = ?3, assessment_note = ?4 WHERE id = ?1")
            .bind(&week_id)
            .bind(d.lecture.trim())
            .bind(d.lab.trim())
            .bind(d.assessment_note.trim())
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

        sqlx::query("DELETE FROM week_items WHERE week_id = ?1")
            .bind(&week_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        let items = d
            .focus
            .iter()
            .map(|t| ("focus", t))
            .chain(d.deliverables.iter().map(|t| ("deliverable", t)));
        for (i, (kind, text)) in items.enumerate() {
            if text.trim().is_empty() {
                continue;
            }
            sqlx::query(
                "INSERT INTO week_items (id, week_id, kind, text, position, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
            )
            .bind(Uuid::new_v4().to_string())
            .bind(&week_id)
            .bind(kind)
            .bind(text.trim())
            .bind(i as i64)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    sqlx::query("DELETE FROM unit_plan_drafts WHERE subject_id = ?1")
        .bind(subject_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())
}

// ── The background job ──────────────────────────────────────────────────────

async fn week_refs(pool: &SqlitePool, subject_id: &str) -> Result<Vec<serde_json::Value>, String> {
    let rows: Vec<(i64, String)> = sqlx::query_as(
        "SELECT week_number, title FROM weeks WHERE subject_id = ?1 ORDER BY week_number",
    )
    .bind(subject_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(rows
        .into_iter()
        .map(|(week_number, title)| json!({ "week_number": week_number, "title": title }))
        .collect())
}

async fn run_unit_plan(
    app: AppHandle,
    pool: SqlitePool,
    base: String,
    token: String,
    subject_id: String,
    file_path: String,
) {
    let result: Result<UnitPlan, String> = async {
        let weeks = week_refs(&pool, &subject_id).await?;
        let preset = fetch_preset(&pool).await;
        let resp = reqwest::Client::new()
            .post(format!("{base}/parse-unit-plan"))
            .header("X-Arbora-Token", &token)
            .json(&json!({
                "subject_id": subject_id, "file_path": file_path, "weeks": weeks,
                "llm_config": { "provider": "ollama" }, "preset": preset,
            }))
            .timeout(PARSE_TIMEOUT)
            .send()
            .await
            .map_err(|e| format!("PLAN_FAILED: {e}"))?;
        if !resp.status().is_success() {
            let status = resp.status();
            let detail = resp.text().await.unwrap_or_default();
            return Err(format!("PLAN_FAILED ({status}): {detail}"));
        }
        resp.json::<UnitPlan>()
            .await
            .map_err(|e| format!("PLAN_FAILED: {e}"))
    }
    .await;

    match result {
        Ok(plan) if plan.is_empty() => {
            fail(&app, &pool, &subject_id, &file_path, "PLAN_EMPTY").await;
        }
        Ok(plan) => {
            let payload = serde_json::to_string(&plan).unwrap_or_default();
            if let Err(e) = set_draft(&pool, &subject_id, "ready", &file_path, &payload, "").await {
                return fail(&app, &pool, &subject_id, &file_path, &e).await;
            }
            let _ = app.emit("unitplan:ready", json!({ "subject_id": subject_id }));
        }
        Err(e) => fail(&app, &pool, &subject_id, &file_path, &e).await,
    }
}

async fn fail(app: &AppHandle, pool: &SqlitePool, subject_id: &str, file_path: &str, error: &str) {
    let _ = set_draft(pool, subject_id, "error", file_path, "", error).await;
    let _ = app.emit(
        "unitplan:error",
        json!({ "subject_id": subject_id, "error": error }),
    );
}

// ── Tauri commands ─────────────────────────────────────────────────────────

/// Kick off the deep pass for a syllabus the user just imported. Returns as
/// soon as the job is queued; completion arrives as `unitplan:ready` /
/// `unitplan:error`, and the result waits in the draft either way.
#[tauri::command]
pub async fn start_unit_plan(
    app: AppHandle,
    pool: State<'_, SqlitePool>,
    sidecar: State<'_, Sidecar>,
    subject_id: String,
    file_path: String,
) -> Result<(), String> {
    let base = sidecar
        .base_url()
        .filter(|_| sidecar.is_ready())
        .ok_or("SIDECAR_UNAVAILABLE")?;
    let token = sidecar.token().to_string();
    let pool = pool.inner().clone();

    set_draft(&pool, &subject_id, "running", &file_path, "", "").await?;
    tauri::async_runtime::spawn(async move {
        run_unit_plan(app, pool, base, token, subject_id, file_path).await;
    });
    Ok(())
}

#[tauri::command]
pub async fn get_unit_plan_draft(
    pool: State<'_, SqlitePool>,
    subject_id: String,
) -> Result<Option<UnitPlanDraft>, String> {
    get_draft_db(pool.inner(), &subject_id).await
}

/// Accept the reviewed plan. The UI sends back what the user edited, not the
/// stored draft, so their corrections are what lands.
#[tauri::command]
pub async fn commit_unit_plan(
    pool: State<'_, SqlitePool>,
    subject_id: String,
    plan: UnitPlan,
) -> Result<(), String> {
    commit_unit_plan_db(pool.inner(), &subject_id, &plan).await
}

#[tauri::command]
pub async fn dismiss_unit_plan_draft(
    pool: State<'_, SqlitePool>,
    subject_id: String,
) -> Result<(), String> {
    dismiss_draft_db(pool.inner(), &subject_id).await
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
        sqlx::query("PRAGMA foreign_keys = ON")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO subjects (id,name,color,created_at,updated_at) VALUES ('s','S','#000','t','t')")
            .execute(&pool).await.unwrap();
        for n in 1..=3 {
            sqlx::query(
                "INSERT INTO weeks (id,subject_id,week_number,created_at)
                 VALUES (?1,'s',?2,'t')",
            )
            .bind(format!("w{n}"))
            .bind(n)
            .execute(&pool)
            .await
            .unwrap();
        }
        pool
    }

    fn sample_plan() -> UnitPlan {
        UnitPlan {
            essentials: PlanEssentials {
                aim: "Build well-architected cloud deployments.".into(),
                assumed_knowledge: "PHP, SQL".into(),
                platform: "AWS Academy".into(),
                credit_points: "12.5 CP".into(),
                outcomes: vec![
                    PlanOutcome {
                        code: "ULO1".into(),
                        text: "Describe cloud computing".into(),
                    },
                    PlanOutcome {
                        code: "ULO2".into(),
                        text: "Create cloud services".into(),
                    },
                ],
                staff: vec![PlanStaff {
                    name: "Dr Man Lau".into(),
                    role: "Unit Coordinator".into(),
                    contact: "elau@swin.edu.au".into(),
                    consultation: "Mon 14:00-15:00".into(),
                }],
            },
            assessments: vec![PlanAssessment {
                name: "Labs".into(),
                weight_percent: 10.0,
                due_text: "Weeks 2-11".into(),
                kind: "Individual".into(),
                outcomes: "ULO2, ULO3".into(),
            }],
            week_details: vec![PlanWeekDetail {
                week_number: 2,
                lecture: "Compute services".into(),
                lab: "ACF Lab 3 — EC2".into(),
                assessment_note: "First marked lab".into(),
                focus: vec!["Tell EC2 purchasing options apart".into()],
                deliverables: vec!["Service card for EC2".into()],
            }],
        }
    }

    #[tokio::test]
    async fn commit_writes_every_section() {
        let pool = mem_pool().await;
        commit_unit_plan_db(&pool, "s", &sample_plan())
            .await
            .unwrap();

        let (aim, cp): (String, String) =
            sqlx::query_as("SELECT aim, credit_points FROM unit_info WHERE subject_id='s'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(aim, "Build well-architected cloud deployments.");
        assert_eq!(cp, "12.5 CP");

        let outcomes: Vec<(String, String)> = sqlx::query_as(
            "SELECT code, text FROM unit_outcomes WHERE subject_id='s' ORDER BY position",
        )
        .fetch_all(&pool)
        .await
        .unwrap();
        assert_eq!(outcomes.len(), 2);
        assert_eq!(outcomes[0].0, "ULO1");

        let (name, consult): (String, String) =
            sqlx::query_as("SELECT name, consultation FROM unit_staff WHERE subject_id='s'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(name, "Dr Man Lau");
        assert_eq!(consult, "Mon 14:00-15:00");

        let (a_name, weight, kind): (String, f64, String) = sqlx::query_as(
            "SELECT name, weight_percent, kind FROM unit_assessments WHERE subject_id='s'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(
            (a_name.as_str(), weight, kind.as_str()),
            ("Labs", 10.0, "Individual")
        );

        // The mark map also seeds the grade book, weight as a fraction.
        let (g_weight, score): (f64, Option<f64>) =
            sqlx::query_as("SELECT weight, score FROM grades WHERE subject_id='s'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(g_weight, 0.1);
        assert!(score.is_none(), "a pre-filled grade starts ungraded");
    }

    #[tokio::test]
    async fn commit_attaches_week_detail_by_number() {
        let pool = mem_pool().await;
        commit_unit_plan_db(&pool, "s", &sample_plan())
            .await
            .unwrap();

        let (lecture, lab): (String, String) =
            sqlx::query_as("SELECT lecture, lab FROM weeks WHERE id='w2'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(lecture, "Compute services");
        assert_eq!(lab, "ACF Lab 3 — EC2");

        let items: Vec<(String, String)> = sqlx::query_as(
            "SELECT kind, text FROM week_items WHERE week_id='w2' ORDER BY position",
        )
        .fetch_all(&pool)
        .await
        .unwrap();
        assert_eq!(items[0].0, "focus");
        assert_eq!(items[1].0, "deliverable");

        // Weeks the plan said nothing about are untouched.
        let (w1_lecture,): (String,) = sqlx::query_as("SELECT lecture FROM weeks WHERE id='w1'")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(w1_lecture, "");
    }

    #[tokio::test]
    async fn week_detail_for_a_week_that_does_not_exist_is_skipped() {
        let pool = mem_pool().await;
        let mut plan = sample_plan();
        plan.week_details[0].week_number = 40; // outline only has 3 weeks
        commit_unit_plan_db(&pool, "s", &plan).await.unwrap();

        let (weeks,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM weeks WHERE subject_id='s'")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(weeks, 3, "no phantom week was created");
    }

    #[tokio::test]
    async fn empty_staff_does_not_wipe_the_imported_coordinator() {
        let pool = mem_pool().await;
        sqlx::query(
            "INSERT INTO unit_staff (id,subject_id,name,role,contact,consultation,position,created_at)
             VALUES ('st','s','Dr Ada Chen','Unit Coordinator','ada@uni.edu','',0,'t')",
        )
        .execute(&pool)
        .await
        .unwrap();

        let mut plan = sample_plan();
        plan.essentials.staff.clear();
        commit_unit_plan_db(&pool, "s", &plan).await.unwrap();

        let (name,): (String,) = sqlx::query_as("SELECT name FROM unit_staff WHERE subject_id='s'")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(name, "Dr Ada Chen");
    }

    #[tokio::test]
    async fn commit_clears_the_draft() {
        let pool = mem_pool().await;
        set_draft(&pool, "s", "ready", "/a.pdf", "{}", "")
            .await
            .unwrap();
        commit_unit_plan_db(&pool, "s", &sample_plan())
            .await
            .unwrap();
        assert!(get_draft_db(&pool, "s").await.unwrap().is_none());
    }

    #[tokio::test]
    async fn draft_roundtrip_and_dismiss() {
        let pool = mem_pool().await;
        let payload = serde_json::to_string(&sample_plan()).unwrap();
        set_draft(&pool, "s", "ready", "/a.pdf", &payload, "")
            .await
            .unwrap();

        let draft = get_draft_db(&pool, "s").await.unwrap().unwrap();
        assert_eq!(draft.state, "ready");
        assert_eq!(draft.plan.unwrap().essentials.credit_points, "12.5 CP");

        dismiss_draft_db(&pool, "s").await.unwrap();
        assert!(get_draft_db(&pool, "s").await.unwrap().is_none());
    }

    #[tokio::test]
    async fn an_unreadable_payload_degrades_to_no_plan() {
        let pool = mem_pool().await;
        set_draft(&pool, "s", "error", "/a.pdf", "", "PLAN_FAILED")
            .await
            .unwrap();
        let draft = get_draft_db(&pool, "s").await.unwrap().unwrap();
        assert_eq!(draft.state, "error");
        assert!(draft.plan.is_none());
        assert_eq!(draft.error, "PLAN_FAILED");
    }

    #[tokio::test]
    async fn an_all_empty_plan_is_recognised() {
        assert!(UnitPlan::default().is_empty());
        assert!(!sample_plan().is_empty());
    }
}
