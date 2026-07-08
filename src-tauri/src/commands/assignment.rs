//! Assignment detail: upload a spec or rubric for a deadline → sidecar
//! extraction → user review → transactional commit (review-before-trust,
//! ADR-0006, same contract as the syllabus import). The uploaded file also
//! joins the source library (copy-on-import, like `add_source`) linked to the
//! deadline via `deadline_sources`, so after ingest the assignment brief can
//! ground and cite the spec itself — not just the covered weeks' materials.

use std::path::PathBuf;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

use super::sources::{self, Source};
use super::todos::Todo;
use crate::sidecar::Sidecar;

// ── Wire shapes ─────────────────────────────────────────────────────────────

/// An assignment spec parsed by the sidecar but **not yet written** — the UI
/// reviews and edits this, then `commit_assignment_spec` persists it.
#[derive(Debug, Serialize, Deserialize)]
pub struct ParsedSpec {
    #[serde(default)]
    pub overview: String,
    /// ISO date (YYYY-MM-DD) or "" — commit only touches the deadline's due
    /// date when the user opts in (`update_due`).
    #[serde(default)]
    pub due_date: String,
    #[serde(default)]
    pub requirements: Vec<String>,
    #[serde(default)]
    pub process_steps: Vec<String>,
    #[serde(default)]
    pub plan_steps: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ParsedRubricLevel {
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub descriptor: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ParsedRubricCriterion {
    pub name: String,
    #[serde(default)]
    pub weight_text: String,
    #[serde(default)]
    pub levels: Vec<ParsedRubricLevel>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ParsedRubric {
    #[serde(default)]
    pub criteria: Vec<ParsedRubricCriterion>,
}

/// Stored assignment detail, as the UI reads it back.
#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct AssignmentItem {
    pub id: String,
    pub kind: String, // requirement | process | plan
    pub text: String,
    pub done: bool,
    pub todo_id: Option<String>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct RubricLevelView {
    pub label: String,
    pub descriptor: String,
}

#[derive(Debug, Serialize)]
pub struct RubricCriterionView {
    pub id: String,
    pub name: String,
    pub weight_text: String,
    pub levels: Vec<RubricLevelView>,
}

#[derive(Debug, Serialize)]
pub struct AssignmentDetail {
    pub overview: String,
    pub items: Vec<AssignmentItem>,
    pub criteria: Vec<RubricCriterionView>,
    pub spec_source_id: Option<String>,
    pub rubric_source_id: Option<String>,
}

/// The deadline's title, verifying it belongs to the subject (parse) or merely
/// exists (commit paths that don't carry a subject).
async fn fetch_deadline_title(
    pool: &SqlitePool,
    deadline_id: &str,
    subject_id: Option<&str>,
) -> Result<String, String> {
    let row: Option<(String,)> = match subject_id {
        Some(sid) => {
            sqlx::query_as("SELECT title FROM deadlines WHERE id = ?1 AND subject_id = ?2")
                .bind(deadline_id)
                .bind(sid)
                .fetch_optional(pool)
                .await
        }
        None => {
            sqlx::query_as("SELECT title FROM deadlines WHERE id = ?1")
                .bind(deadline_id)
                .fetch_optional(pool)
                .await
        }
    }
    .map_err(|e| e.to_string())?;
    row.map(|(t,)| t)
        .ok_or_else(|| "DEADLINE_NOT_FOUND".to_string())
}

// ── DB layer (plain pool → unit-testable) ──────────────────────────────────

/// Persist a user-confirmed spec in **one transaction**: upsert the overview,
/// replace the requirement/process/plan items (carrying each row's checklist
/// state over by `(kind, trimmed text)` so a re-upload doesn't wipe progress),
/// optionally update the deadline's due date, add the stored file as a library
/// source, and point the deadline's `spec` link at it. Returns the new source
/// so the UI can kick off the normal ingest job next.
async fn commit_spec_db(
    pool: &SqlitePool,
    subject_id: &str,
    deadline_id: &str,
    stored_path: &str,
    title: &str,
    spec: &ParsedSpec,
    update_due: bool,
) -> Result<Source, String> {
    fetch_deadline_title(pool, deadline_id, Some(subject_id)).await?;
    let kind = sources::detect_type(stored_path)?;
    let source_id = Uuid::new_v4().to_string();

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    sqlx::query(
        "INSERT INTO assignment_details (deadline_id, overview, updated_at)
         VALUES (?1, ?2, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
         ON CONFLICT(deadline_id) DO UPDATE SET
            overview = excluded.overview, updated_at = excluded.updated_at",
    )
    .bind(deadline_id)
    .bind(spec.overview.trim())
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Carry checklist state (done / linked todo) across a re-upload for rows
    // whose kind + text survive unchanged.
    let old: Vec<(String, String, bool, Option<String>)> = sqlx::query_as(
        "SELECT kind, text, done, todo_id FROM assignment_items WHERE deadline_id = ?1",
    )
    .bind(deadline_id)
    .fetch_all(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;
    let carried: std::collections::HashMap<(String, String), (bool, Option<String>)> = old
        .into_iter()
        .map(|(k, t, done, todo)| ((k, t.trim().to_string()), (done, todo)))
        .collect();

    sqlx::query("DELETE FROM assignment_items WHERE deadline_id = ?1")
        .bind(deadline_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    let groups = [
        ("requirement", &spec.requirements),
        ("process", &spec.process_steps),
        ("plan", &spec.plan_steps),
    ];
    for (kind_name, texts) in groups {
        for (i, text) in texts.iter().enumerate() {
            let text = text.trim();
            if text.is_empty() {
                continue;
            }
            let (done, todo_id) = carried
                .get(&(kind_name.to_string(), text.to_string()))
                .cloned()
                .unwrap_or((false, None));
            sqlx::query(
                "INSERT INTO assignment_items
                    (id, deadline_id, kind, text, done, position, todo_id, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
            )
            .bind(Uuid::new_v4().to_string())
            .bind(deadline_id)
            .bind(kind_name)
            .bind(text)
            .bind(done)
            .bind(i as i64)
            .bind(&todo_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    let due = spec.due_date.trim();
    if update_due && !due.is_empty() {
        // Normalise a bare ISO date like the outline commit does.
        let due_at = if due.len() == 10 {
            format!("{due}T00:00:00Z")
        } else {
            due.to_string()
        };
        sqlx::query("UPDATE deadlines SET due_at = ?2 WHERE id = ?1")
            .bind(deadline_id)
            .bind(&due_at)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }

    insert_linked_source(
        &mut tx,
        &source_id,
        subject_id,
        deadline_id,
        "spec",
        kind,
        stored_path,
        title,
    )
    .await?;

    tx.commit().await.map_err(|e| e.to_string())?;
    sources::fetch_source(pool, &source_id).await
}

/// Persist a user-confirmed rubric in **one transaction**: replace the
/// criteria/levels (nothing references them — a rubric is re-read wholesale),
/// add the stored file as a library source, and point the deadline's `rubric`
/// link at it.
async fn commit_rubric_db(
    pool: &SqlitePool,
    subject_id: &str,
    deadline_id: &str,
    stored_path: &str,
    title: &str,
    rubric: &ParsedRubric,
) -> Result<Source, String> {
    fetch_deadline_title(pool, deadline_id, Some(subject_id)).await?;
    let kind = sources::detect_type(stored_path)?;
    let source_id = Uuid::new_v4().to_string();

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM rubric_criteria WHERE deadline_id = ?1")
        .bind(deadline_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    for (i, c) in rubric.criteria.iter().enumerate() {
        let name = c.name.trim();
        if name.is_empty() {
            continue;
        }
        let criterion_id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO rubric_criteria (id, deadline_id, name, weight_text, position, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
        )
        .bind(&criterion_id)
        .bind(deadline_id)
        .bind(name)
        .bind(c.weight_text.trim())
        .bind(i as i64)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
        for (j, level) in c.levels.iter().enumerate() {
            if level.label.trim().is_empty() && level.descriptor.trim().is_empty() {
                continue;
            }
            sqlx::query(
                "INSERT INTO rubric_levels (id, criterion_id, label, descriptor, position)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
            )
            .bind(Uuid::new_v4().to_string())
            .bind(&criterion_id)
            .bind(level.label.trim())
            .bind(level.descriptor.trim())
            .bind(j as i64)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    insert_linked_source(
        &mut tx,
        &source_id,
        subject_id,
        deadline_id,
        "rubric",
        kind,
        stored_path,
        title,
    )
    .await?;

    tx.commit().await.map_err(|e| e.to_string())?;
    sources::fetch_source(pool, &source_id).await
}

/// Insert the stored file as a queued library source and (re)point the
/// deadline's spec/rubric link at it. A replaced file's old source row stays in
/// the library as a normal source the user can delete from Drive.
#[allow(clippy::too_many_arguments)]
async fn insert_linked_source(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    source_id: &str,
    subject_id: &str,
    deadline_id: &str,
    role: &str,
    kind: &str,
    stored_path: &str,
    title: &str,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO sources (id, subject_id, type, file_path, title, ingest_state, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'queued', strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
    )
    .bind(source_id)
    .bind(subject_id)
    .bind(kind)
    .bind(stored_path)
    .bind(title)
    .execute(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;
    sqlx::query(
        "INSERT OR REPLACE INTO deadline_sources (deadline_id, role, source_id, created_at)
         VALUES (?1, ?2, ?3, strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
    )
    .bind(deadline_id)
    .bind(role)
    .bind(source_id)
    .execute(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

async fn get_detail_db(pool: &SqlitePool, deadline_id: &str) -> Result<AssignmentDetail, String> {
    fetch_deadline_title(pool, deadline_id, None).await?;

    let overview: Option<(String,)> =
        sqlx::query_as("SELECT overview FROM assignment_details WHERE deadline_id = ?1")
            .bind(deadline_id)
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?;

    let items = sqlx::query_as::<_, AssignmentItem>(
        "SELECT id, kind, text, done, todo_id FROM assignment_items
         WHERE deadline_id = ?1 ORDER BY kind, position",
    )
    .bind(deadline_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let criteria_rows: Vec<(String, String, String)> = sqlx::query_as(
        "SELECT id, name, weight_text FROM rubric_criteria
         WHERE deadline_id = ?1 ORDER BY position",
    )
    .bind(deadline_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    let mut criteria = Vec::with_capacity(criteria_rows.len());
    for (id, name, weight_text) in criteria_rows {
        let levels = sqlx::query_as::<_, RubricLevelView>(
            "SELECT label, descriptor FROM rubric_levels
             WHERE criterion_id = ?1 ORDER BY position",
        )
        .bind(&id)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
        criteria.push(RubricCriterionView {
            id,
            name,
            weight_text,
            levels,
        });
    }

    let links: Vec<(String, String)> =
        sqlx::query_as("SELECT role, source_id FROM deadline_sources WHERE deadline_id = ?1")
            .bind(deadline_id)
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?;
    let mut spec_source_id = None;
    let mut rubric_source_id = None;
    for (role, source_id) in links {
        match role.as_str() {
            "spec" => spec_source_id = Some(source_id),
            "rubric" => rubric_source_id = Some(source_id),
            _ => {}
        }
    }

    Ok(AssignmentDetail {
        overview: overview.map(|(o,)| o).unwrap_or_default(),
        items,
        criteria,
        spec_source_id,
        rubric_source_id,
    })
}

async fn set_item_done_db(pool: &SqlitePool, item_id: &str, done: bool) -> Result<(), String> {
    let res = sqlx::query("UPDATE assignment_items SET done = ?2 WHERE id = ?1")
        .bind(item_id)
        .bind(done)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    if res.rows_affected() == 0 {
        return Err("ITEM_NOT_FOUND".to_string());
    }
    Ok(())
}

const TODO_COLS: &str = "SELECT id, subject_id, title, due, session_slot, kind, done, source, \
    notes, repeat, linked_event_id FROM todos";

/// Turn one plan/process step into a real todo (`source='ai'`, the scheduler
/// precedent for AI-authored rows the user explicitly accepted). Idempotent:
/// a step that already has a live todo just returns it. No due date is set, so
/// no calendar event is mirrored — the user adds one from the Todos screen if
/// they want it scheduled.
async fn add_step_todo_db(pool: &SqlitePool, item_id: &str) -> Result<Todo, String> {
    let row: Option<(String, Option<String>, String, String)> = sqlx::query_as(
        "SELECT ai.text, ai.todo_id, d.subject_id, d.title
         FROM assignment_items ai JOIN deadlines d ON d.id = ai.deadline_id
         WHERE ai.id = ?1",
    )
    .bind(item_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;
    let (text, todo_id, subject_id, deadline_title) =
        row.ok_or_else(|| "ITEM_NOT_FOUND".to_string())?;

    if let Some(existing) = todo_id {
        let todo: Option<Todo> = sqlx::query_as(&format!("{TODO_COLS} WHERE id = ?1"))
            .bind(&existing)
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?;
        if let Some(todo) = todo {
            return Ok(todo);
        }
        // The linked todo was deleted — fall through and create a fresh one.
    }

    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO todos (id, subject_id, title, kind, notes, source, created_at)
         VALUES (?1, ?2, ?3, 'task', ?4, 'ai', strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
    )
    .bind(&id)
    .bind(&subject_id)
    .bind(&text)
    .bind(format!("From assignment: {deadline_title}"))
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    sqlx::query("UPDATE assignment_items SET todo_id = ?2 WHERE id = ?1")
        .bind(item_id)
        .bind(&id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query_as::<_, Todo>(&format!("{TODO_COLS} WHERE id = ?1"))
        .bind(&id)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())
}

// ── Sidecar parse relays (write nothing — review-before-trust) ──────────────

async fn parse_relay<T: serde::de::DeserializeOwned>(
    sidecar: &Sidecar,
    pool: &SqlitePool,
    endpoint: &str,
    subject_id: &str,
    file_path: &str,
    assignment_title: &str,
) -> Result<T, String> {
    let base = sidecar
        .base_url()
        .filter(|_| sidecar.is_ready())
        .ok_or("SIDECAR_UNAVAILABLE")?;
    let token = sidecar.token().to_string();
    let preset = super::outline::fetch_preset(pool).await;

    let resp = reqwest::Client::new()
        .post(format!("{base}/{endpoint}"))
        .header("X-Arbora-Token", &token)
        .json(&serde_json::json!({
            "subject_id": subject_id, "file_path": file_path,
            "assignment_title": assignment_title,
            "llm_config": { "provider": "ollama" }, "preset": preset,
        }))
        // One local LLM call over a whole document — room for weak hardware.
        .timeout(Duration::from_secs(180))
        .send()
        .await
        .map_err(|e| format!("PARSE_FAILED: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let detail = resp.text().await.unwrap_or_default();
        return Err(format!("PARSE_FAILED ({status}): {detail}"));
    }
    resp.json::<T>()
        .await
        .map_err(|e| format!("PARSE_FAILED: {e}"))
}

// ── Tauri commands ─────────────────────────────────────────────────────────

#[tauri::command]
pub async fn parse_assignment_spec(
    sidecar: State<'_, Sidecar>,
    pool: State<'_, SqlitePool>,
    subject_id: String,
    deadline_id: String,
    file_path: String,
) -> Result<ParsedSpec, String> {
    let title = fetch_deadline_title(pool.inner(), &deadline_id, Some(&subject_id)).await?;
    parse_relay(
        sidecar.inner(),
        pool.inner(),
        "parse-assignment-spec",
        &subject_id,
        &file_path,
        &title,
    )
    .await
}

#[tauri::command]
pub async fn parse_rubric(
    sidecar: State<'_, Sidecar>,
    pool: State<'_, SqlitePool>,
    subject_id: String,
    deadline_id: String,
    file_path: String,
) -> Result<ParsedRubric, String> {
    let title = fetch_deadline_title(pool.inner(), &deadline_id, Some(&subject_id)).await?;
    parse_relay(
        sidecar.inner(),
        pool.inner(),
        "parse-rubric",
        &subject_id,
        &file_path,
        &title,
    )
    .await
}

/// Copy the picked file into the source library (like `add_source`), then run
/// the transactional spec commit. Returns the new source; the UI ingests it
/// next with the ordinary `ingest_source` job.
#[tauri::command]
pub async fn commit_assignment_spec(
    app: AppHandle,
    pool: State<'_, SqlitePool>,
    subject_id: String,
    deadline_id: String,
    file_path: String,
    spec: ParsedSpec,
    update_due: bool,
) -> Result<Source, String> {
    let stored = copy_to_library(&app, &file_path).await?;
    commit_spec_db(
        pool.inner(),
        &subject_id,
        &deadline_id,
        &stored,
        &sources::display_title(&file_path),
        &spec,
        update_due,
    )
    .await
}

#[tauri::command]
pub async fn commit_rubric(
    app: AppHandle,
    pool: State<'_, SqlitePool>,
    subject_id: String,
    deadline_id: String,
    file_path: String,
    rubric: ParsedRubric,
) -> Result<Source, String> {
    let stored = copy_to_library(&app, &file_path).await?;
    commit_rubric_db(
        pool.inner(),
        &subject_id,
        &deadline_id,
        &stored,
        &sources::display_title(&file_path),
        &rubric,
    )
    .await
}

async fn copy_to_library(app: &AppHandle, file_path: &str) -> Result<String, String> {
    sources::detect_type(file_path)?; // reject unsupported types before copying
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let original = PathBuf::from(file_path);
    let stored = tauri::async_runtime::spawn_blocking(move || {
        sources::copy_into_library(&data_dir, &original)
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(stored.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn get_assignment_detail(
    pool: State<'_, SqlitePool>,
    deadline_id: String,
) -> Result<AssignmentDetail, String> {
    get_detail_db(pool.inner(), &deadline_id).await
}

#[tauri::command]
pub async fn set_assignment_item_done(
    pool: State<'_, SqlitePool>,
    item_id: String,
    done: bool,
) -> Result<(), String> {
    set_item_done_db(pool.inner(), &item_id, done).await
}

#[tauri::command]
pub async fn add_assignment_step_todo(
    pool: State<'_, SqlitePool>,
    item_id: String,
) -> Result<Todo, String> {
    add_step_todo_db(pool.inner(), &item_id).await
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
        // FKs after migrate, matching db.rs (0017 rebuilds `sources` FK-off).
        sqlx::query("PRAGMA foreign_keys = ON")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO subjects (id,name,color,created_at,updated_at) VALUES ('s','S','#000','t','t')")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO deadlines (id,subject_id,title,due_at,type,created_at) VALUES ('d','s','Assignment 1','2026-03-01T00:00:00Z','assignment','t')")
            .execute(&pool).await.unwrap();
        pool
    }

    fn spec(plan: &[&str]) -> ParsedSpec {
        ParsedSpec {
            overview: "A report.".into(),
            due_date: "2026-03-15".into(),
            requirements: vec!["2000 words".into()],
            process_steps: vec!["Submit via Turnitin".into()],
            plan_steps: plan.iter().map(|s| s.to_string()).collect(),
        }
    }

    #[tokio::test]
    async fn spec_commit_roundtrip_and_due_update() {
        let pool = mem_pool().await;
        let src = commit_spec_db(
            &pool,
            "s",
            "d",
            "/lib/spec.pdf",
            "Spec",
            &spec(&["Draft"]),
            true,
        )
        .await
        .unwrap();
        assert_eq!(src.kind, "pdf");

        let detail = get_detail_db(&pool, "d").await.unwrap();
        assert_eq!(detail.overview, "A report.");
        assert_eq!(detail.items.len(), 3);
        assert_eq!(detail.spec_source_id.as_deref(), Some(src.id.as_str()));
        assert!(detail.rubric_source_id.is_none());

        // Opted-in due update, normalised to the stored datetime shape.
        let (due,): (String,) = sqlx::query_as("SELECT due_at FROM deadlines WHERE id='d'")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(due, "2026-03-15T00:00:00Z");
    }

    #[tokio::test]
    async fn recommit_preserves_done_state_and_replaces_spec_link() {
        let pool = mem_pool().await;
        commit_spec_db(
            &pool,
            "s",
            "d",
            "/lib/a.pdf",
            "A",
            &spec(&["Draft", "Revise"]),
            false,
        )
        .await
        .unwrap();
        let detail = get_detail_db(&pool, "d").await.unwrap();
        let draft = detail.items.iter().find(|i| i.text == "Draft").unwrap();
        set_item_done_db(&pool, &draft.id, true).await.unwrap();
        let todo = add_step_todo_db(&pool, &draft.id).await.unwrap();

        // Re-upload keeps "Draft" (same kind+text) → done + todo carried over;
        // "Revise" is gone; the new "Submit" starts fresh.
        let src2 = commit_spec_db(
            &pool,
            "s",
            "d",
            "/lib/b.pdf",
            "B",
            &spec(&["Draft", "Submit"]),
            false,
        )
        .await
        .unwrap();
        let detail = get_detail_db(&pool, "d").await.unwrap();
        let draft = detail.items.iter().find(|i| i.text == "Draft").unwrap();
        assert!(draft.done);
        assert_eq!(draft.todo_id.as_deref(), Some(todo.id.as_str()));
        let submit = detail.items.iter().find(|i| i.text == "Submit").unwrap();
        assert!(!submit.done);
        assert!(submit.todo_id.is_none());
        assert!(!detail.items.iter().any(|i| i.text == "Revise"));

        // The spec link moved to the new source; the old file stays a source.
        assert_eq!(detail.spec_source_id.as_deref(), Some(src2.id.as_str()));
        let (n,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM sources WHERE subject_id='s'")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(n, 2);

        // Due untouched without the opt-in.
        let (due,): (String,) = sqlx::query_as("SELECT due_at FROM deadlines WHERE id='d'")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(due, "2026-03-01T00:00:00Z");
    }

    #[tokio::test]
    async fn rubric_commit_replaces_criteria() {
        let pool = mem_pool().await;
        let rubric = ParsedRubric {
            criteria: vec![ParsedRubricCriterion {
                name: "Accuracy".into(),
                weight_text: "40%".into(),
                levels: vec![
                    ParsedRubricLevel {
                        label: "HD".into(),
                        descriptor: "All correct.".into(),
                    },
                    ParsedRubricLevel {
                        label: "Pass".into(),
                        descriptor: "Mostly correct.".into(),
                    },
                ],
            }],
        };
        commit_rubric_db(&pool, "s", "d", "/lib/r.pdf", "Rubric", &rubric)
            .await
            .unwrap();
        let detail = get_detail_db(&pool, "d").await.unwrap();
        assert_eq!(detail.criteria.len(), 1);
        assert_eq!(detail.criteria[0].levels.len(), 2);
        assert!(detail.rubric_source_id.is_some());

        // Re-upload wholesale-replaces (criteria cascade their levels).
        let smaller = ParsedRubric {
            criteria: vec![ParsedRubricCriterion {
                name: "Referencing".into(),
                weight_text: String::new(),
                levels: vec![],
            }],
        };
        commit_rubric_db(&pool, "s", "d", "/lib/r2.pdf", "Rubric 2", &smaller)
            .await
            .unwrap();
        let detail = get_detail_db(&pool, "d").await.unwrap();
        assert_eq!(detail.criteria.len(), 1);
        assert_eq!(detail.criteria[0].name, "Referencing");
        let (levels,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM rubric_levels")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(levels, 0, "old levels cascade-deleted");
    }

    #[tokio::test]
    async fn step_todo_is_ai_sourced_idempotent_and_calendar_free() {
        let pool = mem_pool().await;
        commit_spec_db(&pool, "s", "d", "/lib/a.pdf", "A", &spec(&["Draft"]), false)
            .await
            .unwrap();
        let detail = get_detail_db(&pool, "d").await.unwrap();
        let step = detail.items.iter().find(|i| i.kind == "plan").unwrap();

        let todo = add_step_todo_db(&pool, &step.id).await.unwrap();
        assert_eq!(todo.source, "ai");
        assert_eq!(todo.title, "Draft");
        assert_eq!(todo.subject_id.as_deref(), Some("s"));
        assert!(todo.due.is_none());

        // Second click returns the same todo instead of duplicating it.
        let again = add_step_todo_db(&pool, &step.id).await.unwrap();
        assert_eq!(again.id, todo.id);
        let (n,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM todos")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(n, 1);

        // due is NULL → no mirrored calendar event.
        let (events,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM calendar_events")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(events, 0);
    }

    #[tokio::test]
    async fn deadline_delete_cascades_detail() {
        let pool = mem_pool().await;
        commit_spec_db(&pool, "s", "d", "/lib/a.pdf", "A", &spec(&["Draft"]), false)
            .await
            .unwrap();
        sqlx::query("DELETE FROM deadlines WHERE id='d'")
            .execute(&pool)
            .await
            .unwrap();
        for table in ["assignment_details", "assignment_items", "deadline_sources"] {
            let (n,): (i64,) = sqlx::query_as(&format!("SELECT COUNT(*) FROM {table}"))
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(n, 0, "{table} rows cascade with the deadline");
        }
        // The uploaded file itself survives as an ordinary library source.
        let (n,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM sources")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(n, 1);
    }

    #[tokio::test]
    async fn unknown_deadline_is_rejected() {
        let pool = mem_pool().await;
        assert!(
            commit_spec_db(&pool, "s", "nope", "/lib/a.pdf", "A", &spec(&[]), false)
                .await
                .is_err()
        );
        assert!(get_detail_db(&pool, "nope").await.is_err());
    }
}
