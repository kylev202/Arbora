//! Tauri commands exposed to the React UI, grouped by domain.
//!
//! Each domain lives in its own submodule (`subjects`, …); this file holds the
//! cross-cutting dev/liveness pings. The single typed seam on the UI side is
//! `src/lib/ipc.ts` — keep the two in sync.

pub mod content;
pub mod dashboard;
pub mod export;
pub mod generate;
pub mod plan;
pub mod review;
pub mod settings;
pub mod sources;
pub mod study;
pub mod subjects;

use serde::Serialize;
use sqlx::SqlitePool;
use tauri::State;

use crate::sidecar::{Sidecar, SidecarStatus};

/// Returned by commands that kick off a long-running sidecar job; progress and
/// completion then arrive as Tauri events (`ingest:*`, `generate:*`).
#[derive(Serialize)]
pub struct JobHandle {
    pub job_id: String,
}

/// Liveness ping for the React → Rust IPC bridge.
#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {name}! Arbora core is alive.")
}

/// Proves the database is connected and migrated by counting the singleton
/// `settings` row (always 1 after `0001_initial.sql`).
#[tauri::command]
pub async fn db_health(pool: State<'_, SqlitePool>) -> Result<i64, String> {
    let (count,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM settings")
        .fetch_one(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    Ok(count)
}

/// Current sidecar readiness + its loopback base URL.
#[tauri::command]
pub fn sidecar_status(state: State<'_, Sidecar>) -> SidecarStatus {
    SidecarStatus {
        ready: state.is_ready(),
        base_url: state.base_url(),
    }
}
