use crate::{
    downloads::DownloadTask,
    error::{AppError, Result},
    ollama,
    settings::{write_json, Settings},
    AppState,
};
use serde_json::{json, Value};
use std::{sync::Arc, time::Duration};
use tauri::{ipc::Channel, State};

type App<'a> = State<'a, Arc<AppState>>;

#[tauri::command]
pub async fn get_settings(state: App<'_>) -> Result<Settings> {
    Ok(state.settings.read().await.clone())
}

#[tauri::command]
pub async fn save_settings(
    app: tauri::AppHandle,
    state: App<'_>,
    settings: Settings,
) -> Result<Settings> {
    let _gate = state.operation_gate.lock().await;
    let settings = settings.validate()?;
    if settings.endpoint != state.settings.read().await.endpoint
        && state.downloads.has_active().await
    {
        return Err(AppError::new(
            "active_downloads",
            "请先中止或完成下载队列，再修改服务地址。",
        ));
    }
    write_json(&state.data_dir.join("settings.json"), &settings).await?;
    *state.settings.write().await = settings.clone();
    if let Err(error) = crate::tray::update_language(&app, &settings.language) {
        eprintln!("update tray language: {error}");
    }
    Ok(settings)
}

#[tauri::command]
pub async fn get_connection_status(state: App<'_>, endpoint: Option<String>) -> Result<Value> {
    let endpoint = match endpoint {
        Some(value) => crate::settings::validate_endpoint(&value)?,
        None => state.settings.read().await.endpoint.clone(),
    };
    let value = ollama::get(&state.client, &endpoint, "/api/version").await?;
    if value["version"].as_str().is_none() {
        return Err(AppError::new(
            "not_ollama",
            "服务未返回有效的 Ollama 版本，请检查地址与端口。",
        ));
    }
    Ok(value)
}

async fn model_list(state: &AppState, path: &str) -> Result<Vec<Value>> {
    let endpoint = state.settings.read().await.endpoint.clone();
    let value = ollama::get(&state.client, &endpoint, path).await?;
    value["models"]
        .as_array()
        .cloned()
        .ok_or_else(|| AppError::new("invalid_response", "Ollama 模型列表格式不兼容。"))
}

#[tauri::command]
pub async fn list_models(state: App<'_>) -> Result<Vec<Value>> {
    model_list(&state, "/api/tags").await
}

#[tauri::command]
pub async fn list_running_models(state: App<'_>) -> Result<Vec<Value>> {
    model_list(&state, "/api/ps").await
}

#[tauri::command]
pub async fn search_library(query: String, page: u32) -> Result<crate::library::LibrarySearch> {
    crate::library::search(&query, page).await
}

#[tauri::command]
pub async fn get_library_model(name: String) -> Result<crate::library::LibraryModel> {
    crate::library::model_details(&name).await
}

#[tauri::command]
pub async fn get_model_details(state: App<'_>, name: String) -> Result<Value> {
    let name = ollama::canonical_name(&name)?;
    let endpoint = state.settings.read().await.endpoint.clone();
    ollama::post(
        &state.client,
        &endpoint,
        "/api/show",
        json!({"model": name}),
        Duration::from_secs(30),
    )
    .await
}

async fn residency(state: &AppState, name: &str, load: bool) -> Result<()> {
    let _gate = state.operation_gate.lock().await;
    let name = ollama::canonical_name(name)?;
    let settings = state.settings.read().await.clone();
    if state.downloads.model_busy(&settings.endpoint, &name).await {
        return Err(AppError::new(
            "model_busy",
            "该模型正在下载，请等待下载结束。",
        ));
    }
    ollama::change_residency(
        &state.client,
        &settings.endpoint,
        &name,
        if load {
            settings.keep_alive_minutes * 60
        } else {
            0
        },
    )
    .await
}

#[tauri::command]
pub async fn load_model(state: App<'_>, name: String) -> Result<()> {
    residency(&state, &name, true).await
}

#[tauri::command]
pub async fn unload_model(state: App<'_>, name: String) -> Result<()> {
    residency(&state, &name, false).await
}

#[tauri::command]
pub async fn delete_model(state: App<'_>, name: String) -> Result<()> {
    let _gate = state.operation_gate.lock().await;
    let name = ollama::canonical_name(&name)?;
    let endpoint = state.settings.read().await.endpoint.clone();
    if state.downloads.model_busy(&endpoint, &name).await {
        return Err(AppError::new("model_busy", "该模型正在下载，不能删除。"));
    }
    let running = model_list(&state, "/api/ps").await?;
    if running.iter().any(|model| {
        model["name"].as_str() == Some(&name) || model["model"].as_str() == Some(&name)
    }) {
        return Err(AppError::new("model_loaded", "请先卸载模型，再删除文件。"));
    }
    let response = state
        .client
        .delete(format!("{endpoint}/api/delete"))
        .timeout(Duration::from_secs(30))
        .json(&json!({"model": name}))
        .send()
        .await?;
    ollama::check_response(response).await?;
    let remaining = model_list(&state, "/api/tags").await?;
    if remaining
        .iter()
        .any(|model| model["name"].as_str() == Some(&name))
    {
        return Err(AppError::new(
            "delete_unconfirmed",
            "删除请求已发送，但模型仍在本地列表中，请刷新检查。",
        ));
    }
    Ok(())
}

#[tauri::command]
pub async fn list_download_tasks(state: App<'_>) -> Result<Vec<DownloadTask>> {
    let endpoint = state.settings.read().await.endpoint.clone();
    Ok(state.downloads.list(&endpoint).await)
}

#[tauri::command]
pub async fn subscribe_downloads(state: App<'_>, channel: Channel<DownloadTask>) -> Result<()> {
    state.downloads.subscribe(channel);
    Ok(())
}

#[tauri::command]
pub async fn enqueue_download(state: App<'_>, name: String) -> Result<DownloadTask> {
    let _gate = state.operation_gate.lock().await;
    let name = ollama::download_name(&name)?;
    let endpoint = state.settings.read().await.endpoint.clone();
    state.downloads.enqueue(endpoint, name).await
}

#[tauri::command]
pub async fn cancel_download(state: App<'_>, task_id: String) -> Result<()> {
    let endpoint = state.settings.read().await.endpoint.clone();
    state.downloads.cancel(&task_id, &endpoint).await
}

#[tauri::command]
pub async fn retry_download(state: App<'_>, task_id: String) -> Result<DownloadTask> {
    let _gate = state.operation_gate.lock().await;
    let endpoint = state.settings.read().await.endpoint.clone();
    state.downloads.retry(&task_id, &endpoint).await
}

#[tauri::command]
pub async fn clear_download_history(state: App<'_>) -> Result<()> {
    let endpoint = state.settings.read().await.endpoint.clone();
    state.downloads.clear(&endpoint).await
}

#[tauri::command]
pub async fn shutdown_downloads(state: App<'_>) -> Result<()> {
    state.downloads.shutdown().await
}

#[tauri::command]
pub async fn exit_app(app: tauri::AppHandle, state: App<'_>) -> Result<()> {
    let _gate = state.operation_gate.lock().await;
    state.downloads.shutdown().await?;
    app.exit(0);
    Ok(())
}

#[tauri::command]
pub fn open_official_library() -> Result<()> {
    let windows = std::env::var_os("WINDIR")
        .ok_or_else(|| AppError::new("open_failed", "无法打开默认浏览器。"))?;
    std::process::Command::new(std::path::Path::new(&windows).join("explorer.exe"))
        .arg("https://ollama.com/library")
        .spawn()
        .map_err(|error| AppError::new("open_failed", "无法打开默认浏览器。").detail(error))?;
    Ok(())
}
