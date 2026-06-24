//! SQLite connection pool + embedded migrations.

use std::path::Path;

use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;

/// Open (creating if needed) the SQLite database at `db_path`, enforce foreign
/// keys, and run all pending migrations from `migrations/`.
pub async fn init_pool(db_path: &Path) -> Result<SqlitePool, sqlx::Error> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }

    let opts = SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(true)
        .foreign_keys(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(opts)
        .await?;

    // Migrations are embedded at compile time from src-tauri/migrations/.
    sqlx::migrate!("./migrations").run(&pool).await?;

    Ok(pool)
}
