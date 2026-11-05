use crate::error::{AppError, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub endpoint: String,
    pub theme: String,
    pub language: String,
    pub keep_alive_minutes: u32,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            endpoint: "http://127.0.0.1:11434".into(),
            theme: "light".into(),
            language: "zh-CN".into(),
            keep_alive_minutes: 5,
        }
    }
}

pub fn validate_endpoint(value: &str) -> Result<String> {
    let invalid = || {
        AppError::new(
            "invalid_endpoint",
            "仅支持本机 HTTP 地址，例如 http://127.0.0.1:11434。",
        )
    };
    let url = url::Url::parse(value.trim()).map_err(|_| invalid())?;
    let host = url.host_str().ok_or_else(invalid)?;
    if url.scheme() != "http"
        || !["localhost", "127.0.0.1", "[::1]"].contains(&host)
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.path() != "/"
        || url.port() == Some(0)
    {
        return Err(invalid());
    }
    Ok(url.as_str().trim_end_matches('/').into())
}

impl Settings {
    pub fn validate(mut self) -> Result<Self> {
        self.endpoint = validate_endpoint(&self.endpoint)?;
        if !["light", "dark", "system"].contains(&self.theme.as_str())
            || !["zh-CN", "en-US"].contains(&self.language.as_str())
            || ![5, 15, 30].contains(&self.keep_alive_minutes)
        {
            return Err(AppError::new(
                "invalid_settings",
                "语言、主题或驻留时间设置无效。",
            ));
        }
        Ok(self)
    }
}

pub async fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<()> {
    let content = serde_json::to_vec_pretty(value)?;
    let temp = path.with_extension("tmp");
    tokio::fs::write(&temp, content).await?;
    tokio::fs::rename(&temp, path).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn old_settings_default_to_chinese_and_language_persists() {
        let old: Settings = serde_json::from_str(
            r#"{"endpoint":"http://127.0.0.1:11434","theme":"dark","keepAliveMinutes":15}"#,
        )
        .unwrap();
        assert_eq!(old.language, "zh-CN");
        let english = Settings {
            language: "en-US".into(),
            ..old
        }
        .validate()
        .unwrap();
        let saved = serde_json::to_vec(&english).unwrap();
        let restored: Settings = serde_json::from_slice(&saved).unwrap();
        assert_eq!(restored.language, "en-US");
        assert_eq!(restored.theme, "dark");
        assert_eq!(restored.keep_alive_minutes, 15);
        assert!(Settings {
            language: "invalid".into(),
            ..restored
        }
        .validate()
        .is_err());
    }
    #[test]
    fn only_accept_loopback_http_without_extra_url_parts() {
        for endpoint in [
            "http://127.0.0.1:11434",
            "http://localhost:11434/",
            "http://[::1]:11434",
        ] {
            assert!(validate_endpoint(endpoint).is_ok(), "{endpoint}");
        }
        for endpoint in [
            "https://127.0.0.1:11434",
            "http://example.com",
            "http://127.0.0.1/path",
            "http://a:b@localhost:11434",
            "http://localhost:0",
            "http://localhost?x=1",
        ] {
            assert!(validate_endpoint(endpoint).is_err(), "{endpoint}");
        }
    }
}
