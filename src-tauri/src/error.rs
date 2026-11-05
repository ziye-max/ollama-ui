use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub code: String,
    pub message: String,
    pub detail: Option<String>,
    pub retryable: bool,
}

pub type Result<T> = std::result::Result<T, AppError>;

impl std::fmt::Display for AppError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for AppError {}

impl AppError {
    pub fn new(code: &str, message: &str) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            detail: None,
            retryable: false,
        }
    }

    pub fn detail(mut self, detail: impl ToString) -> Self {
        self.detail = Some(detail.to_string());
        self
    }
}

impl From<reqwest::Error> for AppError {
    fn from(error: reqwest::Error) -> Self {
        let (code, message) = if error.is_connect() {
            (
                "connection_refused",
                "无法连接 Ollama，请确认本机服务已启动并检查端口。",
            )
        } else if error.is_timeout() {
            ("timeout", "Ollama 响应超时，请稍后重试。")
        } else {
            ("network_error", "与 Ollama 通信失败，请检查服务状态。")
        };
        Self {
            code: code.into(),
            message: message.into(),
            detail: Some(error.to_string()),
            retryable: true,
        }
    }
}

impl From<std::io::Error> for AppError {
    fn from(error: std::io::Error) -> Self {
        Self::new(
            "storage_error",
            "无法保存本地配置或任务记录，请检查权限与磁盘空间。",
        )
        .detail(error)
    }
}

impl From<serde_json::Error> for AppError {
    fn from(error: serde_json::Error) -> Self {
        Self::new("invalid_response", "数据格式不兼容，请检查 Ollama 版本。").detail(error)
    }
}
