use crate::{
    error::{AppError, Result},
    ollama,
    settings::write_json,
};
use futures_util::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex as StdMutex},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::ipc::Channel;
use tokio::sync::{Mutex, Notify};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Layer {
    pub digest: String,
    pub total: u64,
    pub completed: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadTask {
    pub task_id: String,
    pub attempt_id: String,
    pub endpoint: String,
    pub model_name: String,
    pub state: String,
    pub phase: String,
    pub layers: Vec<Layer>,
    pub current_digest: Option<String>,
    pub bytes_per_second: Option<f64>,
    pub error: Option<String>,
    pub created_at: u64,
    pub updated_at: u64,
    pub sequence: u64,
}

impl DownloadTask {
    pub fn active(&self) -> bool {
        matches!(self.state.as_str(), "queued" | "running" | "cancelling")
    }
    fn bump(&mut self) {
        self.updated_at = now();
        self.sequence += 1;
    }
}

struct Inner {
    tasks: Vec<DownloadTask>,
    active: Option<(String, CancellationToken)>,
}

pub struct DownloadManager {
    inner: Mutex<Inner>,
    persistence: Mutex<()>,
    channel: StdMutex<Option<Channel<DownloadTask>>>,
    notify: Notify,
    path: PathBuf,
    client: Client,
}

impl DownloadManager {
    pub fn new(path: PathBuf, client: Client) -> Result<Arc<Self>> {
        let mut tasks: Vec<DownloadTask> = match std::fs::read(&path) {
            Ok(data) => serde_json::from_slice(&data)?,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Vec::new(),
            Err(error) => return Err(error.into()),
        };
        for task in &mut tasks {
            if task.active() {
                task.state = "interrupted".into();
                task.phase = "interrupted".into();
                task.bytes_per_second = None;
                task.bump();
            }
        }
        Ok(Arc::new(Self {
            inner: Mutex::new(Inner {
                tasks,
                active: None,
            }),
            persistence: Mutex::new(()),
            channel: StdMutex::new(None),
            notify: Notify::new(),
            path,
            client,
        }))
    }

    pub fn subscribe(&self, channel: Channel<DownloadTask>) {
        if let Ok(mut current) = self.channel.lock() {
            *current = Some(channel);
        }
    }

    fn publish(&self, task: DownloadTask) {
        if let Ok(channel) = self.channel.lock() {
            if let Some(channel) = channel.as_ref() {
                let _ = channel.send(task);
            }
        }
    }

    async fn persist(&self) -> Result<()> {
        let _gate = self.persistence.lock().await;
        let tasks = self.inner.lock().await.tasks.clone();
        write_json(&self.path, &tasks).await
    }

    pub async fn list(&self, endpoint: &str) -> Vec<DownloadTask> {
        let mut tasks: Vec<_> = self
            .inner
            .lock()
            .await
            .tasks
            .iter()
            .filter(|task| task.endpoint == endpoint)
            .cloned()
            .collect();
        tasks.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        tasks
    }

    pub async fn has_active(&self) -> bool {
        self.inner
            .lock()
            .await
            .tasks
            .iter()
            .any(DownloadTask::active)
    }

    pub async fn model_busy(&self, endpoint: &str, name: &str) -> bool {
        self.inner
            .lock()
            .await
            .tasks
            .iter()
            .any(|task| task.endpoint == endpoint && task.model_name == name && task.active())
    }

    pub async fn enqueue(&self, endpoint: String, model_name: String) -> Result<DownloadTask> {
        let mut inner = self.inner.lock().await;
        if inner
            .tasks
            .iter()
            .any(|task| task.endpoint == endpoint && task.model_name == model_name && task.active())
        {
            return Err(AppError::new("duplicate_task", "该模型已在下载队列中。"));
        }
        let timestamp = now();
        let task = DownloadTask {
            task_id: Uuid::new_v4().to_string(),
            attempt_id: Uuid::new_v4().to_string(),
            endpoint,
            model_name,
            state: "queued".into(),
            phase: "queued".into(),
            layers: Vec::new(),
            current_digest: None,
            bytes_per_second: None,
            error: None,
            created_at: timestamp,
            updated_at: timestamp,
            sequence: 1,
        };
        inner.tasks.push(task.clone());
        drop(inner);
        if let Err(error) = self.persist().await {
            self.inner
                .lock()
                .await
                .tasks
                .retain(|item| item.task_id != task.task_id);
            return Err(error);
        }
        self.publish(task.clone());
        self.notify.notify_one();
        Ok(task)
    }

    pub async fn cancel(&self, id: &str, endpoint: &str) -> Result<()> {
        let mut inner = self.inner.lock().await;
        let task = inner
            .tasks
            .iter_mut()
            .find(|task| task.task_id == id && task.endpoint == endpoint)
            .ok_or_else(|| AppError::new("task_not_found", "下载任务不存在。"))?;
        if !task.active() {
            return Ok(());
        }
        task.state = if task.state == "queued" {
            "cancelled"
        } else {
            "cancelling"
        }
        .into();
        task.bytes_per_second = None;
        task.bump();
        let changed = task.clone();
        if let Some((active_id, token)) = &inner.active {
            if active_id == id {
                token.cancel();
            }
        }
        drop(inner);
        self.publish(changed);
        self.persist().await
    }

    pub async fn retry(&self, id: &str, endpoint: &str) -> Result<DownloadTask> {
        let mut inner = self.inner.lock().await;
        let original = inner
            .tasks
            .iter()
            .find(|task| task.task_id == id && task.endpoint == endpoint)
            .cloned()
            .ok_or_else(|| AppError::new("task_not_found", "下载任务不存在。"))?;
        if original.active() {
            return Err(AppError::new("task_active", "任务仍在执行，请等待结束。"));
        }
        if inner.tasks.iter().any(|task| {
            task.endpoint == endpoint && task.model_name == original.model_name && task.active()
        }) {
            return Err(AppError::new("duplicate_task", "该模型已在下载队列中。"));
        }
        let task = inner
            .tasks
            .iter_mut()
            .find(|task| task.task_id == id)
            .unwrap();
        task.attempt_id = Uuid::new_v4().to_string();
        task.state = "queued".into();
        task.phase = "queued".into();
        task.layers.clear();
        task.current_digest = None;
        task.bytes_per_second = None;
        task.error = None;
        task.bump();
        let changed = task.clone();
        drop(inner);
        if let Err(error) = self.persist().await {
            let mut inner = self.inner.lock().await;
            if let Some(task) = inner.tasks.iter_mut().find(|task| task.task_id == id) {
                *task = original;
            }
            return Err(error);
        }
        self.publish(changed.clone());
        self.notify.notify_one();
        Ok(changed)
    }

    pub async fn clear(&self, endpoint: &str) -> Result<()> {
        self.inner
            .lock()
            .await
            .tasks
            .retain(|task| task.endpoint != endpoint || task.active());
        self.persist().await
    }

    pub async fn shutdown(&self) -> Result<()> {
        let mut inner = self.inner.lock().await;
        for task in &mut inner.tasks {
            if task.active() {
                task.state = "cancelled".into();
                task.bytes_per_second = None;
                task.bump();
            }
        }
        if let Some((_, token)) = &inner.active {
            token.cancel();
        }
        let changed: Vec<_> = inner.tasks.clone();
        drop(inner);
        for task in changed {
            self.publish(task);
        }
        self.persist().await
    }

    pub async fn run(self: Arc<Self>) {
        if let Err(error) = self.persist().await {
            eprintln!("task storage: {}", error.message);
        }
        loop {
            let next = {
                let mut inner = self.inner.lock().await;
                if let Some(task) = inner.tasks.iter_mut().find(|task| task.state == "queued") {
                    task.state = "running".into();
                    task.phase = "pulling manifest".into();
                    task.bump();
                    let selected = task.clone();
                    let token = CancellationToken::new();
                    inner.active = Some((selected.task_id.clone(), token.clone()));
                    Some((selected, token))
                } else {
                    None
                }
            };
            let Some((task, token)) = next else {
                self.notify.notified().await;
                continue;
            };
            self.publish(task.clone());
            let storage = self.persist().await;
            let result = match storage {
                Ok(()) => self.pull(&task, &token).await,
                Err(error) => Err(error),
            };
            let mut inner = self.inner.lock().await;
            let current = inner
                .tasks
                .iter_mut()
                .find(|item| item.task_id == task.task_id && item.attempt_id == task.attempt_id);
            if let Some(current) = current {
                current.bytes_per_second = None;
                if token.is_cancelled() {
                    current.state = "cancelled".into();
                    current.error = None;
                } else if let Err(error) = result {
                    current.state = "failed".into();
                    current.error = Some(error.detail.unwrap_or(error.message));
                } else {
                    current.state = "completed".into();
                    current.phase = "success".into();
                    current.error = None;
                }
                current.bump();
                self.publish(current.clone());
            }
            inner.active = None;
            drop(inner);
            if let Err(error) = self.persist().await {
                eprintln!("task storage: {}", error.message);
            }
        }
    }

    async fn pull(&self, task: &DownloadTask, token: &CancellationToken) -> Result<()> {
        let request = self
            .client
            .post(format!("{}/api/pull", task.endpoint))
            .json(&json!({ "model": task.model_name, "stream": true }))
            .send();
        let response = tokio::select! {
            _ = token.cancelled() => return Err(AppError::new("cancelled", "已中止本客户端请求。")),
            response = tokio::time::timeout(Duration::from_secs(30), request) => response.map_err(|_| AppError::new("timeout", "连接下载服务超时。"))??,
        };
        let response = ollama::check_response(response).await?;
        let mut stream = response.bytes_stream();
        let mut decoder = NdjsonDecoder::default();
        let mut success = false;
        let mut last_emit = Instant::now() - Duration::from_secs(1);
        let mut last_save = Instant::now();
        let mut sample = (String::new(), 0_u64, Instant::now());
        loop {
            let chunk = tokio::select! {
                _ = token.cancelled() => return Err(AppError::new("cancelled", "已中止本客户端请求。")),
                chunk = tokio::time::timeout(Duration::from_secs(300), stream.next()) => chunk.map_err(|_| AppError::new("download_idle", "下载长时间没有响应，可以重试。"))?,
            };
            let Some(chunk) = chunk else {
                break;
            };
            for value in decoder.push(&chunk?)? {
                success |= self
                    .apply_progress(task, value, &mut sample, &mut last_emit)
                    .await?;
            }
            if success {
                break;
            }
            if last_save.elapsed() >= Duration::from_secs(2) {
                self.persist().await?;
                last_save = Instant::now();
            }
        }
        if !success {
            for value in decoder.finish()? {
                success |= self
                    .apply_progress(task, value, &mut sample, &mut last_emit)
                    .await?;
            }
        }
        if !success {
            return Err(AppError::new(
                "incomplete_stream",
                "下载连接已结束，但未收到完成确认，请重试。",
            ));
        }
        Ok(())
    }

    async fn apply_progress(
        &self,
        original: &DownloadTask,
        value: Value,
        sample: &mut (String, u64, Instant),
        last_emit: &mut Instant,
    ) -> Result<bool> {
        if let Some(error) = value["error"].as_str() {
            return Err(AppError::new("pull_failed", "模型下载失败。").detail(error));
        }
        let phase = value["status"]
            .as_str()
            .ok_or_else(|| AppError::new("invalid_progress", "下载进度格式不兼容。"))?;
        let mut inner = self.inner.lock().await;
        let task = inner
            .tasks
            .iter_mut()
            .find(|task| task.task_id == original.task_id && task.attempt_id == original.attempt_id)
            .ok_or_else(|| AppError::new("task_obsolete", "下载批次已失效。"))?;
        if task.state != "running" {
            return Err(AppError::new("cancelled", "下载请求已中止。"));
        }
        let phase_changed = task.phase != phase;
        task.phase = phase.into();
        if let Some(digest) = value["digest"].as_str() {
            let total = value["total"].as_u64().unwrap_or(0);
            let completed = value["completed"].as_u64().unwrap_or(0);
            if let Some(layer) = task.layers.iter_mut().find(|layer| layer.digest == digest) {
                if total > 0 {
                    layer.total = total;
                }
                layer.completed = completed;
            } else {
                task.layers.push(Layer {
                    digest: digest.into(),
                    total,
                    completed,
                });
            }
            task.current_digest = Some(digest.into());
            if sample.0 != digest || completed < sample.1 {
                *sample = (digest.into(), completed, Instant::now());
                task.bytes_per_second = None;
            } else if sample.2.elapsed().as_secs_f64() >= 0.75 {
                task.bytes_per_second =
                    Some((completed - sample.1) as f64 / sample.2.elapsed().as_secs_f64());
                *sample = (digest.into(), completed, Instant::now());
            }
        } else {
            task.current_digest = None;
            task.bytes_per_second = None;
        }
        task.bump();
        if phase_changed || last_emit.elapsed() >= Duration::from_millis(150) {
            self.publish(task.clone());
            *last_emit = Instant::now();
        }
        Ok(phase == "success")
    }
}

#[derive(Default)]
pub struct NdjsonDecoder {
    buffer: Vec<u8>,
}

impl NdjsonDecoder {
    pub fn push(&mut self, chunk: &[u8]) -> Result<Vec<Value>> {
        self.buffer.extend_from_slice(chunk);
        if self.buffer.len() > 4 * 1024 * 1024 {
            return Err(AppError::new(
                "invalid_stream",
                "下载响应行过长，已停止解析。",
            ));
        }
        let mut values = Vec::new();
        while let Some(end) = self.buffer.iter().position(|byte| *byte == b'\n') {
            let line: Vec<_> = self.buffer.drain(..=end).collect();
            if !line.iter().all(u8::is_ascii_whitespace) {
                values.push(serde_json::from_slice(&line)?);
            }
        }
        Ok(values)
    }
    pub fn finish(&mut self) -> Result<Vec<Value>> {
        if self.buffer.iter().all(u8::is_ascii_whitespace) {
            self.buffer.clear();
            return Ok(Vec::new());
        }
        let value = serde_json::from_slice(&self.buffer)?;
        self.buffer.clear();
        Ok(vec![value])
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn handles_split_unicode_multiple_lines_and_final_line() {
        let raw = "{\"status\":\"校验\"}\n{\"status\":\"success\"}".as_bytes();
        let mut decoder = NdjsonDecoder::default();
        assert!(decoder.push(&raw[..13]).unwrap().is_empty());
        let values = decoder.push(&raw[13..]).unwrap();
        assert_eq!(values[0]["status"], "校验");
        assert_eq!(decoder.finish().unwrap()[0]["status"], "success");
        let values = decoder
            .push(b"\n{\"status\":\"a\"}\r\n{\"error\":\"failed\"}\n")
            .unwrap();
        assert_eq!(values.len(), 2);
    }
    #[test]
    fn rejects_bad_json_and_incomplete_tail() {
        let mut decoder = NdjsonDecoder::default();
        assert!(decoder.push(b"not-json\n").is_err());
        let mut decoder = NdjsonDecoder::default();
        decoder.push(b"{\"status\":").unwrap();
        assert!(decoder.finish().is_err());
    }

    fn test_directory() -> PathBuf {
        let root = std::env::temp_dir();
        let path = root.join(format!("local-ollama-test-{}", Uuid::new_v4()));
        assert!(path.starts_with(&root));
        std::fs::create_dir_all(&path).unwrap();
        path
    }

    async fn wait_for_state(
        manager: &DownloadManager,
        endpoint: &str,
        id: &str,
        expected: &str,
    ) -> DownloadTask {
        tokio::time::timeout(Duration::from_secs(5), async {
            loop {
                if let Some(task) = manager
                    .list(endpoint)
                    .await
                    .into_iter()
                    .find(|task| task.task_id == id && task.state == expected)
                {
                    return task;
                }
                tokio::time::sleep(Duration::from_millis(20)).await;
            }
        })
        .await
        .expect("task did not reach the expected state")
    }

    #[tokio::test]
    async fn queue_deduplicates_retries_monotonically_and_recovers_interrupted_tasks() {
        let directory = test_directory();
        let path = directory.join("downloads.json");
        let endpoint = "http://127.0.0.1:11434";
        let manager = DownloadManager::new(path.clone(), ollama::client().unwrap()).unwrap();
        let task = manager
            .enqueue(endpoint.into(), "test:latest".into())
            .await
            .unwrap();
        assert!(manager
            .enqueue(endpoint.into(), "test:latest".into())
            .await
            .is_err());
        manager.cancel(&task.task_id, endpoint).await.unwrap();
        let cancelled = manager.list(endpoint).await.remove(0);
        assert_eq!(cancelled.state, "cancelled");
        let retry = manager.retry(&task.task_id, endpoint).await.unwrap();
        assert_ne!(retry.attempt_id, task.attempt_id);
        assert!(retry.sequence > cancelled.sequence);
        let reopened = DownloadManager::new(path, ollama::client().unwrap()).unwrap();
        assert_eq!(reopened.list(endpoint).await[0].state, "interrupted");
        assert!(reopened.list("http://127.0.0.1:9999").await.is_empty());
        drop(reopened);
        drop(manager);
        std::fs::remove_dir_all(directory).unwrap();
    }

    async fn stream_server(body: &'static [u8]) -> (String, tokio::task::JoinHandle<()>) {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let endpoint = format!("http://{}", listener.local_addr().unwrap());
        let server = tokio::spawn(async move {
            let (mut connection, _) = listener.accept().await.unwrap();
            let mut request = vec![0_u8; 8192];
            let count = connection.read(&mut request).await.unwrap();
            assert!(String::from_utf8_lossy(&request[..count]).starts_with("POST /api/pull"));
            connection.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: application/x-ndjson\r\nConnection: close\r\n\r\n").await.unwrap();
            for chunk in body.chunks(11) {
                if connection.write_all(chunk).await.is_err() {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(2)).await;
            }
        });
        (endpoint, server)
    }

    #[tokio::test]
    async fn worker_consumes_a_real_chunked_http_stream_and_requires_final_success() {
        for (body, expected) in [
            (&b"{\"status\":\"pulling layer\",\"digest\":\"a\",\"total\":100,\"completed\":100}\n{\"status\":\"success\"}"[..], "completed"),
            (&b"{\"status\":\"pulling layer\",\"digest\":\"a\",\"total\":100,\"completed\":100}\n"[..], "failed"),
            (&b"{\"error\":\"model not found\"}\n"[..], "failed"),
        ] {
            let directory = test_directory();
            let (endpoint, server) = stream_server(body).await;
            let manager = DownloadManager::new(directory.join("downloads.json"), ollama::client().unwrap()).unwrap();
            let task = manager.enqueue(endpoint.clone(), "test:latest".into()).await.unwrap();
            let worker = tokio::spawn(manager.clone().run());
            let completed = wait_for_state(&manager, &endpoint, &task.task_id, expected).await;
            if expected == "completed" { assert_eq!(completed.layers[0].completed, 100); }
            else { assert!(completed.error.is_some()); }
            worker.abort(); let _ = worker.await; server.await.unwrap();
            drop(manager); std::fs::remove_dir_all(directory).unwrap();
        }
    }
}
