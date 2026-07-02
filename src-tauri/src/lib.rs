mod commands;
mod db;
mod sidecar;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
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
            commands::get_system_info,
            commands::subjects::list_subjects,
            commands::subjects::get_subject,
            commands::subjects::create_subject,
            commands::subjects::update_subject,
            commands::subjects::delete_subject,
            commands::sources::list_sources,
            commands::sources::add_source,
            commands::sources::rename_source,
            commands::sources::delete_source,
            commands::sources::ingest_source,
            commands::generate::generate_content,
            commands::generate::generate_assignment_brief,
            commands::review::get_review_queue,
            commands::review::approve_card,
            commands::review::reject_card,
            commands::review::approve_quiz_item,
            commands::review::reject_quiz_item,
            commands::review::approve_note,
            commands::review::reject_note,
            commands::review::approve_brief,
            commands::review::reject_brief,
            commands::study::get_due_cards,
            commands::study::get_due_cards_interleaved,
            commands::study::get_due_cards_prioritized,
            commands::study::submit_card_review,
            commands::study::get_study_stats,
            commands::content::list_cards,
            commands::content::list_quiz,
            commands::content::list_notes,
            commands::content::list_assignment_briefs,
            commands::dashboard::get_subject_dashboard,
            commands::plan::list_deadlines,
            commands::plan::create_deadline,
            commands::plan::delete_deadline,
            commands::plan::list_grades,
            commands::plan::create_grade,
            commands::plan::delete_grade,
            commands::plan::get_grade_summary,
            commands::outline::get_outline,
            commands::outline::set_outline,
            commands::outline::update_week,
            commands::outline::assign_source_week,
            commands::outline::set_assignment_coverage,
            commands::outline::get_assignment_coverage,
            commands::outline::parse_outline_file,
            commands::outline::commit_parsed_outline,
            commands::priority::get_priority_queue,
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::profile::get_profile,
            commands::profile::update_profile,
            commands::profile::list_study_windows,
            commands::profile::set_study_windows,
            commands::export::export_apkg,
            commands::chat::chat_message,
            commands::diagram::generate_diagram,
            commands::map::get_knowledge_map,
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
