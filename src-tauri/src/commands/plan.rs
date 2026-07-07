//! Planning (S-07): deadlines + the grade book. Pure SQLite; no sidecar.
//!
//! `get_grade_summary` computes a real weighted average from graded items.
//! GPA is intentionally left `null`: a percentage→GPA mapping is locale-specific
//! and a product decision, not something to invent here. The what-if rows project
//! the resulting *average* if the remaining ungraded items score a given percent.

use serde::Serialize;
use sqlx::SqlitePool;
use tauri::State;
use uuid::Uuid;

// ── Deadlines ──────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Deadline {
    id: String,
    subject_id: String,
    title: String,
    due_at: String,
    #[serde(rename = "type")]
    kind: String,
}

const DEADLINE_COLS: &str = "SELECT id, subject_id, title, due_at, type AS kind FROM deadlines";

async fn fetch_deadline(pool: &SqlitePool, id: &str) -> Result<Deadline, String> {
    sqlx::query_as::<_, Deadline>(&format!("{DEADLINE_COLS} WHERE id = ?1"))
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "DEADLINE_NOT_FOUND".to_string())
}

async fn list_deadlines_db(pool: &SqlitePool, subject_id: &str) -> Result<Vec<Deadline>, String> {
    sqlx::query_as::<_, Deadline>(&format!(
        "{DEADLINE_COLS} WHERE subject_id = ?1 ORDER BY due_at ASC"
    ))
    .bind(subject_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())
}

async fn create_deadline_db(
    pool: &SqlitePool,
    subject_id: &str,
    title: &str,
    due_at: &str,
    kind: &str,
) -> Result<Deadline, String> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO deadlines (id, subject_id, title, due_at, type, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
    )
    .bind(&id)
    .bind(subject_id)
    .bind(title)
    .bind(due_at)
    .bind(kind)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    fetch_deadline(pool, &id).await
}

// ── Grades ─────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Grade {
    id: String,
    subject_id: String,
    name: String,
    category: String,
    score: Option<f64>,
    max_score: f64,
    weight: f64,
}

const GRADE_COLS: &str =
    "SELECT id, subject_id, name, category, score, max_score, weight FROM grades";

async fn fetch_grade(pool: &SqlitePool, id: &str) -> Result<Grade, String> {
    sqlx::query_as::<_, Grade>(&format!("{GRADE_COLS} WHERE id = ?1"))
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "GRADE_NOT_FOUND".to_string())
}

async fn list_grades_db(pool: &SqlitePool, subject_id: &str) -> Result<Vec<Grade>, String> {
    sqlx::query_as::<_, Grade>(&format!(
        "{GRADE_COLS} WHERE subject_id = ?1 ORDER BY created_at"
    ))
    .bind(subject_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())
}

#[allow(clippy::too_many_arguments)]
async fn create_grade_db(
    pool: &SqlitePool,
    subject_id: &str,
    name: &str,
    category: &str,
    score: Option<f64>,
    max_score: f64,
    weight: f64,
) -> Result<Grade, String> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO grades (id, subject_id, name, category, score, max_score, weight, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
    )
    .bind(&id)
    .bind(subject_id)
    .bind(name)
    .bind(category)
    .bind(score)
    .bind(max_score)
    .bind(weight)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    fetch_grade(pool, &id).await
}

async fn delete_row(pool: &SqlitePool, table: &'static str, id: &str) -> Result<(), String> {
    // `table` is a fixed literal — `&'static str` makes passing runtime
    // (user-derived) strings a compile error, so it can never be injected.
    sqlx::query(&format!("DELETE FROM {table} WHERE id = ?1"))
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Grade summary (pure computation over the fetched rows) ──────────────────

#[derive(Serialize)]
struct WhatIf {
    label: String,
    /// Resulting overall average — the field is named `gpa` for the TS contract,
    /// but holds a percentage average while GPA is descoped.
    gpa: f64,
}

#[derive(Serialize)]
pub struct GradeSummary {
    current_average: Option<f64>,
    gpa: Option<f64>,
    what_if: Vec<WhatIf>,
}

/// Percentage a graded item scored, or `None` if it has no score yet.
fn pct(g: &Grade) -> Option<f64> {
    g.score.map(|s| {
        if g.max_score > 0.0 {
            s / g.max_score * 100.0
        } else {
            0.0
        }
    })
}

/// Average if every ungraded item scored `hypothetical` percent. Weighted when
/// any weights are set, else a simple mean.
fn projected_average(grades: &[Grade], hypothetical: f64) -> f64 {
    let wsum: f64 = grades.iter().map(|g| g.weight).sum();
    if wsum > 0.0 {
        grades
            .iter()
            .map(|g| pct(g).unwrap_or(hypothetical) * g.weight)
            .sum::<f64>()
            / wsum
    } else {
        grades
            .iter()
            .map(|g| pct(g).unwrap_or(hypothetical))
            .sum::<f64>()
            / grades.len() as f64
    }
}

fn summarize(grades: &[Grade]) -> GradeSummary {
    let graded: Vec<&Grade> = grades.iter().filter(|g| g.score.is_some()).collect();

    let current_average = if graded.is_empty() {
        None
    } else {
        let wsum: f64 = graded.iter().map(|g| g.weight).sum();
        Some(if wsum > 0.0 {
            graded
                .iter()
                .map(|g| pct(g).unwrap() * g.weight)
                .sum::<f64>()
                / wsum
        } else {
            graded.iter().map(|g| pct(g).unwrap()).sum::<f64>() / graded.len() as f64
        })
    };

    let has_ungraded = grades.iter().any(|g| g.score.is_none());
    let what_if = if current_average.is_some() && has_ungraded {
        [70.0, 85.0, 95.0]
            .into_iter()
            .map(|h| WhatIf {
                label: format!("Remaining at {}%", h as i64),
                gpa: projected_average(grades, h),
            })
            .collect()
    } else {
        Vec::new()
    };

    GradeSummary {
        current_average,
        gpa: None,
        what_if,
    }
}

// ── Tauri commands ─────────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_deadlines(
    pool: State<'_, SqlitePool>,
    subject_id: String,
) -> Result<Vec<Deadline>, String> {
    list_deadlines_db(pool.inner(), &subject_id).await
}

#[tauri::command]
pub async fn create_deadline(
    pool: State<'_, SqlitePool>,
    subject_id: String,
    title: String,
    due_at: String,
    r#type: String,
) -> Result<Deadline, String> {
    create_deadline_db(pool.inner(), &subject_id, &title, &due_at, &r#type).await
}

#[tauri::command]
pub async fn delete_deadline(pool: State<'_, SqlitePool>, id: String) -> Result<(), String> {
    delete_row(pool.inner(), "deadlines", &id).await
}

#[tauri::command]
pub async fn list_grades(
    pool: State<'_, SqlitePool>,
    subject_id: String,
) -> Result<Vec<Grade>, String> {
    list_grades_db(pool.inner(), &subject_id).await
}

#[tauri::command]
pub async fn create_grade(
    pool: State<'_, SqlitePool>,
    subject_id: String,
    name: String,
    category: String,
    score: Option<f64>,
    max_score: f64,
    weight: f64,
) -> Result<Grade, String> {
    create_grade_db(
        pool.inner(),
        &subject_id,
        &name,
        &category,
        score,
        max_score,
        weight,
    )
    .await
}

#[tauri::command]
pub async fn delete_grade(pool: State<'_, SqlitePool>, id: String) -> Result<(), String> {
    delete_row(pool.inner(), "grades", &id).await
}

#[tauri::command]
pub async fn get_grade_summary(
    pool: State<'_, SqlitePool>,
    subject_id: String,
) -> Result<GradeSummary, String> {
    let grades = list_grades_db(pool.inner(), &subject_id).await?;
    Ok(summarize(&grades))
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
        sqlx::query("INSERT INTO subjects (id,name,color,created_at,updated_at) VALUES ('s','S','#000','t','t')")
            .execute(&pool).await.unwrap();
        pool
    }

    fn grade(score: Option<f64>, max: f64, weight: f64) -> Grade {
        Grade {
            id: "x".into(),
            subject_id: "s".into(),
            name: "n".into(),
            category: "c".into(),
            score,
            max_score: max,
            weight,
        }
    }

    #[tokio::test]
    async fn deadline_crud_roundtrip() {
        let pool = mem_pool().await;
        let d = create_deadline_db(&pool, "s", "Midterm", "2026-07-21T09:00:00Z", "exam")
            .await
            .unwrap();
        assert_eq!(list_deadlines_db(&pool, "s").await.unwrap().len(), 1);
        let json = serde_json::to_value(&d).unwrap();
        assert_eq!(json["type"], "exam", "serialised as `type`");
        delete_row(&pool, "deadlines", &d.id).await.unwrap();
        assert!(list_deadlines_db(&pool, "s").await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn grade_crud_roundtrip() {
        let pool = mem_pool().await;
        let g = create_grade_db(&pool, "s", "HW1", "Assignment", Some(9.0), 10.0, 0.1)
            .await
            .unwrap();
        assert_eq!(list_grades_db(&pool, "s").await.unwrap().len(), 1);
        delete_row(&pool, "grades", &g.id).await.unwrap();
        assert!(list_grades_db(&pool, "s").await.unwrap().is_empty());
    }

    #[test]
    fn weighted_average_over_graded_only() {
        // Midterm 75/100 @0.3, HW 9/10=90% @0.1, Final ungraded @0.6.
        let grades = vec![
            grade(Some(75.0), 100.0, 0.3),
            grade(Some(9.0), 10.0, 0.1),
            grade(None, 100.0, 0.6),
        ];
        let s = summarize(&grades);
        // (75*0.3 + 90*0.1) / 0.4 = 78.75
        assert!((s.current_average.unwrap() - 78.75).abs() < 1e-9);
        assert!(s.gpa.is_none(), "GPA descoped");
        assert_eq!(
            s.what_if.len(),
            3,
            "3 projections while a grade is outstanding"
        );
        // Final at 70%: 75*0.3 + 90*0.1 + 70*0.6 = 73.5
        assert!((s.what_if[0].gpa - 73.5).abs() < 1e-9);
    }

    #[test]
    fn no_grades_means_no_average_no_whatif() {
        let s = summarize(&[]);
        assert!(s.current_average.is_none());
        assert!(s.what_if.is_empty());
    }

    #[test]
    fn all_graded_has_no_whatif() {
        let grades = vec![grade(Some(80.0), 100.0, 0.5), grade(Some(90.0), 100.0, 0.5)];
        let s = summarize(&grades);
        assert!((s.current_average.unwrap() - 85.0).abs() < 1e-9);
        assert!(s.what_if.is_empty(), "nothing outstanding to project");
    }

    #[test]
    fn unweighted_falls_back_to_simple_mean() {
        let grades = vec![grade(Some(60.0), 100.0, 0.0), grade(Some(80.0), 100.0, 0.0)];
        let s = summarize(&grades);
        assert!((s.current_average.unwrap() - 70.0).abs() < 1e-9);
    }
}
