use crate::error::{AppError, Result};
use reqwest::{Client, Response};
use serde_json::{json, Value};
use std::time::Duration;

pub fn client() -> Result<Client> {
    Client::builder()
        .connect_timeout(Duration::from_secs(3))
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(Into::into)
}

pub async fn check_response(response: Response) -> Result<Response> {
    if response.status().is_success() {
        return Ok(response);
    }
    let status = response.status();
    let text = response.text().await.unwrap_or_default();
    let detail = serde_json::from_str::<Value>(&text)
        .ok()
        .and_then(|v| v["error"].as_str().map(str::to_owned))
        .unwrap_or(text);
    let message = if status.as_u16() == 404 {
        "模型或接口不存在，请检查模型名、标签和 Ollama 版本。"
    } else if status.as_u16() == 507 {
        "磁盘空间不足，无法完成模型操作。"
    } else {
        "Ollama 未能完成请求，请查看详细原因。"
    };
    Err(AppError {
        code: format!("ollama_{}", status.as_u16()),
        message: message.into(),
        detail: Some(detail.chars().take(2000).collect()),
        retryable: status.is_server_error(),
    })
}

pub async fn get(client: &Client, endpoint: &str, path: &str) -> Result<Value> {
    let response = client
        .get(format!("{endpoint}{path}"))
        .timeout(Duration::from_secs(10))
        .send()
        .await?;
    let value: Value = check_response(response).await?.json().await?;
    if let Some(error) = value["error"].as_str() {
        return Err(AppError::new("ollama_error", "Ollama 返回错误。").detail(error));
    }
    Ok(value)
}

pub async fn post(
    client: &Client,
    endpoint: &str,
    path: &str,
    body: Value,
    timeout: Duration,
) -> Result<Value> {
    let response = client
        .post(format!("{endpoint}{path}"))
        .timeout(timeout)
        .json(&body)
        .send()
        .await?;
    let value: Value = check_response(response).await?.json().await?;
    if let Some(error) = value["error"].as_str() {
        return Err(AppError::new("ollama_error", "Ollama 未能完成操作。").detail(error));
    }
    Ok(value)
}

pub fn canonical_name(value: &str) -> Result<String> {
    let name = value.trim();
    let invalid = || {
        AppError::new(
            "invalid_model_name",
            "模型名称格式不正确，请使用模型名:标签，不要包含空格或网址。",
        )
    };
    if name.is_empty()
        || name.len() > 200
        || name.chars().any(char::is_whitespace)
        || name.contains("..")
        || name.contains("//")
    {
        return Err(invalid());
    }
    let parts: Vec<_> = name.split(':').collect();
    if parts.len() > 2 {
        return Err(invalid());
    }
    let base = parts[0];
    if !base
        .as_bytes()
        .first()
        .is_some_and(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
        || base.ends_with('/')
        || !base
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || b"._/-".contains(&c))
    {
        return Err(invalid());
    }
    let tag = parts.get(1).copied().unwrap_or("latest");
    if tag.is_empty()
        || !tag.as_bytes()[0].is_ascii_alphanumeric() && tag.as_bytes()[0] != b'_'
        || !tag
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"_.-".contains(&c))
    {
        return Err(invalid());
    }
    Ok(format!("{base}:{tag}"))
}

pub fn download_name(value: &str) -> Result<String> {
    let name = canonical_name(value)?;
    if name
        .rsplit(':')
        .next()
        .unwrap_or_default()
        .to_lowercase()
        .ends_with("cloud")
    {
        return Err(AppError::new(
            "cloud_not_supported",
            "第一版仅支持下载到本机的模型，请选择本地模型标签。",
        ));
    }
    Ok(name)
}

pub async fn change_residency(
    client: &Client,
    endpoint: &str,
    name: &str,
    keep_alive: u32,
) -> Result<()> {
    let body = json!({ "model": name, "prompt": "", "stream": false, "keep_alive": keep_alive });
    post(
        client,
        endpoint,
        "/api/generate",
        body.clone(),
        Duration::from_secs(600),
    )
    .await?;
    let response = get(client, endpoint, "/api/ps").await?;
    let models = response["models"]
        .as_array()
        .ok_or_else(|| AppError::new("invalid_response", "Ollama 的运行列表响应格式不兼容。"))?;
    let loaded = models
        .iter()
        .any(|model| model["name"].as_str() == Some(name) || model["model"].as_str() == Some(name));
    if (keep_alive > 0) != loaded {
        return Err(AppError::new(
            "unconfirmed_state",
            "请求已发送，但模型状态尚未确认，请刷新列表检查。",
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn model_names_are_normalized_and_unsafe_inputs_rejected() {
        assert_eq!(canonical_name(" qwen3:0.6b ").unwrap(), "qwen3:0.6b");
        assert_eq!(canonical_name("org/model").unwrap(), "org/model:latest");
        for name in [
            "",
            "../model",
            "https://ollama.com/model",
            "model:tag:tag",
            "a b",
            "a/",
            "a:",
            "a//b",
        ] {
            assert!(canonical_name(name).is_err(), "{name}");
        }
        assert!(download_name("model:cloud").is_err());
    }
}
