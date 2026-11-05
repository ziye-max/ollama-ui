mod commands;
mod downloads;
mod error;
mod library;
mod ollama;
mod settings;
mod tray;

use std::{path::PathBuf, sync::Arc};
use tauri::Manager;
use tokio::sync::{Mutex, RwLock};

pub struct AppState {
    client: reqwest::Client,
    settings: Arc<RwLock<settings::Settings>>,
    downloads: Arc<downloads::DownloadManager>,
    data_dir: PathBuf,
    operation_gate: Mutex<()>,
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = match std::env::var_os("LOCAL_OLLAMA_DATA_DIR") {
                Some(path) => PathBuf::from(path),
                None => app.path().app_data_dir()?,
            };
            std::fs::create_dir_all(&data_dir)?;
            let settings = match std::fs::read(data_dir.join("settings.json")) {
                Ok(data) => serde_json::from_slice::<settings::Settings>(&data)?.validate()?,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                    settings::Settings::default()
                }
                Err(error) => return Err(error.into()),
            };
            let client = ollama::client()?;
            let downloads =
                downloads::DownloadManager::new(data_dir.join("downloads.json"), client.clone())?;
            let state = Arc::new(AppState {
                client,
                settings: Arc::new(RwLock::new(settings)),
                downloads: downloads.clone(),
                data_dir,
                operation_gate: Mutex::new(()),
            });
            app.manage(state);
            tray::setup(app)?;
            tauri::async_runtime::spawn(downloads.run());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::save_settings,
            commands::get_connection_status,
            commands::list_models,
            commands::list_running_models,
            commands::search_library,
            commands::get_library_model,
            commands::get_model_details,
            commands::load_model,
            commands::unload_model,
            commands::delete_model,
            commands::list_download_tasks,
            commands::subscribe_downloads,
            commands::enqueue_download,
            commands::cancel_download,
            commands::retry_download,
            commands::clear_download_history,
            commands::shutdown_downloads,
            commands::exit_app,
            commands::open_official_library,
        ])
        .run(tauri::generate_context!())
        .expect("无法启动 ollama ui 客户端");
}
