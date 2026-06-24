//! Tauri commands exposed to the React UI.

use sqlx::SqlitePool;
use tauri::State;

use crate::sidecar::{Sidecar, SidecarStatus};

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
