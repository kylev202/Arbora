//! SQLite connection pool + embedded migrations.

use std::path::Path;

use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;

/// Open (creating if needed) the SQLite database at `db_path`, run all pending
/// migrations from `migrations/`, and return a pool that enforces foreign keys.
///
/// Migrations run on a separate connection with foreign keys OFF: sqlx wraps
/// every SQLite migration in a transaction (its `-- no-transaction` marker is
/// not honoured by the SQLite driver), and `PRAGMA foreign_keys` is a silent
/// no-op inside a transaction — so a table-rebuild migration (0008, 0017)
/// could never disable FK enforcement itself. With FKs ON, 0017's
/// `DROP TABLE sources` would fire the children's ON DELETE CASCADE and wipe
/// every chunk. Each migration is still transactional (atomic) — only the
/// cross-table FK checks are off while the schema is rebuilt.
pub async fn init_pool(db_path: &Path) -> Result<SqlitePool, sqlx::Error> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }

    let base = SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(true);

    {
        let migrate_pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(base.clone().foreign_keys(false))
            .await?;
        // Migrations are embedded at compile time from src-tauri/migrations/.
        sqlx::migrate!("./migrations").run(&migrate_pool).await?;
        migrate_pool.close().await;
    }

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(base.foreign_keys(true))
        .await?;

    Ok(pool)
}
