mod commands;
mod db;
mod sidecar;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // ── SQLite: open + migrate, then share the pool with commands. ──
            let db_path = app
                .path()
                .app_data_dir()
                .expect("resolve app data dir")
                .join("arbora.db");
            let pool = tauri::async_runtime::block_on(db::init_pool(&db_path))
                .expect("initialize database");
            app.manage(pool);

            // ── Python sidecar: spawn + health-check on a background thread. ──
            app.manage(sidecar::Sidecar::new());
            let handle = app.handle().clone();
            std::thread::spawn(move || sidecar::run_lifecycle(handle));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::greet,
            commands::db_health,
            commands::sidecar_status,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // Don't leave a zombie sidecar behind when the app exits.
            if let tauri::RunEvent::Exit = event {
                app_handle.state::<sidecar::Sidecar>().kill();
            }
        });
}
