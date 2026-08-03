//! Tauri commands exposed to the React UI, grouped by domain.
//!
//! Each domain lives in its own submodule (`subjects`, …); this file holds the
//! cross-cutting dev/liveness pings. The single typed seam on the UI side is
//! `src/lib/ipc.ts` — keep the two in sync.

pub mod alerts;
pub mod assess;
pub mod assignment;
pub mod chat;
pub mod content;
pub mod dashboard;
pub mod diagram;
pub mod events;
pub mod generate;
pub mod map;
pub mod model;
pub mod notes;
pub mod outline;
pub mod path;
pub mod pet;
pub mod plan;
pub mod priority;
pub mod profile;
pub mod review;
pub mod scheduler;
pub mod settings;
pub mod sources;
pub mod study;
pub mod subjects;
pub mod todos;
pub mod unit_plan;
pub mod walkthrough;

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

/// Device capability snapshot for the AI-preset recommendation. RAM only, by
/// design: cross-platform VRAM detection would need a native dep per OS and the
/// recommendation is a heuristic the user can always override.
#[derive(Serialize)]
pub struct SystemInfo {
    pub total_ram_gb: f64,
}

#[tauri::command]
pub fn get_system_info() -> SystemInfo {
    let mut sys = sysinfo::System::new();
    sys.refresh_memory();
    SystemInfo {
        total_ram_gb: sys.total_memory() as f64 / (1024.0 * 1024.0 * 1024.0),
    }
}
