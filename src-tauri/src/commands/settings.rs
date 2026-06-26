//! The settings singleton (`settings` row id=1). Only the device/AI prefs that
//! have a real DB column live here — `ai_preset`, `whisper_model`, `onboarded`.
//! Display/accessibility prefs (theme, contrast, font size) are pure UI state and
//! stay in the browser's localStorage, not the DB. BYO-key fields are deliberately
//! NOT exposed: that path is isolated behind its own opt-in (law #3).

use serde::Serialize;
use sqlx::SqlitePool;
use tauri::State;

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Settings {
    ai_preset: String,
    whisper_model: String,
    onboarded: bool,
}

async fn get(pool: &SqlitePool) -> Result<Settings, String> {
    sqlx::query_as::<_, Settings>(
        "SELECT ai_preset, whisper_model, onboarded FROM settings WHERE id = 1",
    )
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())
}

async fn update(
    pool: &SqlitePool,
    ai_preset: Option<String>,
    whisper_model: Option<String>,
    onboarded: Option<bool>,
) -> Result<Settings, String> {
    sqlx::query(
        "UPDATE settings
         SET ai_preset = COALESCE(?1, ai_preset),
             whisper_model = COALESCE(?2, whisper_model),
             onboarded = COALESCE(?3, onboarded),
             updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
         WHERE id = 1",
    )
    .bind(ai_preset)
    .bind(whisper_model)
    .bind(onboarded)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    get(pool).await
}

#[tauri::command]
pub async fn get_settings(pool: State<'_, SqlitePool>) -> Result<Settings, String> {
    get(pool.inner()).await
}

#[tauri::command]
pub async fn update_settings(
    pool: State<'_, SqlitePool>,
    ai_preset: Option<String>,
    whisper_model: Option<String>,
    onboarded: Option<bool>,
) -> Result<Settings, String> {
    update(pool.inner(), ai_preset, whisper_model, onboarded).await
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
        pool
    }

    #[tokio::test]
    async fn defaults_then_patch_preset_only() {
        let pool = mem_pool().await;
        let s = get(&pool).await.unwrap();
        assert_eq!(s.ai_preset, "medium", "migration default");
        assert_eq!(s.whisper_model, "base");
        assert!(!s.onboarded);

        // Patch one field; the others are preserved by COALESCE.
        let s = update(&pool, Some("high".into()), None, Some(true))
            .await
            .unwrap();
        assert_eq!(s.ai_preset, "high");
        assert_eq!(s.whisper_model, "base", "untouched field preserved");
        assert!(s.onboarded);
    }
}
