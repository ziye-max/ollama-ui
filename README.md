<div align="center">
  <img src="docs/images/logo.png" width="88" alt="ollama ui logo" />
  <h1>ollama ui</h1>
  <p>简洁的 Windows Ollama 模型管理客户端</p>
  <p>Tauri 2 · React · TypeScript · shadcn/ui · MIT</p>
</div>

管理本机 Ollama 的模型、运行状态和下载任务。采用左侧菜单、右侧列表的黑白灰界面，支持中文和英文、浅色和深色主题。

这是独立社区项目，与 Ollama 官方无隶属关系。当前仅支持 Windows x64，项目处于早期版本。

## 功能

| 页面 | 功能 |
| --- | --- |
| 仪表盘 | 本地模型数、已加载模型数、加载与显存占用、最近下载、服务状态 |
| 本地模型 | 搜索、筛选、排序、详情、加载、卸载、删除、手动下载 |
| 模型库 | 读取 Ollama 官方模型库，搜索、分页、查看详情与标签并直接下载 |
| 运行中 | 查看已加载模型的大小、显存、上下文长度和驻留时间，支持卸载 |
| 下载任务 | 串行队列、当前层进度和速度、中止、重试、清除记录 |
| 设置 | 本机服务地址、驻留时间、语言、主题 |

关闭或最小化窗口会收起到系统托盘，下载继续；单击托盘图标恢复，彻底退出请使用托盘右键菜单。

目前不包含聊天、RAG、训练、远程连接，以及 Ollama 的自动安装或启动。

## 使用

1. 安装并启动 [Ollama](https://ollama.com/download/windows)。
2. 运行 `ollama ui`，确认左下角显示已连接。默认服务地址为 `http://127.0.0.1:11434`。
3. 在“模型库”选择模型标签下载，或在“本地模型 → 下载模型”输入名称，例如 `smollm2:135m`。
4. 下载完成后，在“本地模型”加载模型；在“运行中”查看实际状态。

系统要求：Windows 10 22H2 / Windows 11 x64、Microsoft Edge WebView2 Runtime、可运行的本机 Ollama。安装包会按需引导安装 WebView2；模型的硬件要求由 Ollama 和模型本身决定。

### 操作说明

- **加载**：请求 Ollama 将模型驻留在内存中，默认 5 分钟，可改为 15 / 30 分钟。
- **卸载**：释放运行资源，不删除模型文件；可能影响其他正在使用该模型的客户端。
- **删除**：删除模型文件，需要确认；已加载模型需先卸载。
- **下载进度**：显示当前层进度，最终成功以 Ollama 响应为准。中止只关闭本客户端的拉取请求。
- **运行中**：表示模型已加载，不表示模型正在生成内容。

在设置中选择简体中文或 English，保存后生效；官方模型说明和上游原始信息保留原文。

## 从源码运行

先准备：

- [Node.js](https://nodejs.org/) 22.12+，推荐 Node.js 24 LTS，包含 npm。
- [Rust stable](https://rustup.rs/)，使用 `x86_64-pc-windows-msvc` 工具链。
- Visual Studio 2022 Build Tools，勾选“使用 C++ 的桌面开发”和 Windows SDK。
- [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)。

完整环境要求见 [Tauri Windows 开发前置要求](https://v2.tauri.app/start/prerequisites/#windows)。

在项目根目录打开 PowerShell：

```powershell
npm ci
npm run desktop:dev
```

脚本默认使用系统 Rust / MSVC；本地存在 `.tools` 便携环境时自动识别，也可用 `npm run desktop:dev -- -SystemToolchain` 强制使用系统环境。仓库不附带开发工具链。

仅预览前端：

```powershell
npm run dev
```

浏览器访问 `http://127.0.0.1:1420`。浏览器模式仅供界面预览，不能调用模型管理功能，也不展示模拟模型。

## 检查与打包

```powershell
npm run typecheck
npm test
npm run build
npm run desktop:fmt:check
npm run desktop:check
npm run desktop:test
npm run desktop:build
```

Windows x64 安装包输出到 `src-tauri/target/release/bundle/nsis/`，例如 `ollama ui_0.1.0_x64-setup.exe`。当前未配置代码签名。发布步骤见 [发布指南](docs/发布指南.md)。

## 数据与网络

- 开发脚本默认将客户端设置与任务记录放在 `.cache/app-data/`；发布版默认使用 `%APPDATA%/com.localollama.desktop/`。
- 设置环境变量 `LOCAL_OLLAMA_DATA_DIR` 可指定客户端数据目录，详见 [开发文档](docs/开发文档.md)。
- 模型文件由 Ollama 管理。调整 `OLLAMA_MODELS` 时需按 Ollama 说明操作并重启服务；客户端不移动模型文件。
- 客户端只允许连接本机 HTTP 回环地址。官方模型库元数据通过 HTTPS 请求 `ollama.com`；模型文件由本机 Ollama 下载。
- 官方模型库使用网页解析，网站结构变化可能导致加载失败，需要更新解析器。

## 工程结构

```text
.github/             GitHub 自动检查、Issue 和 PR 模板
assets/brand/        品牌图标源文件
docs/                开发、验证、发布和第三方说明
public/              浏览器 favicon
scripts/             Windows 环境与开发命令
src/
  assets/            界面 Logo
  components/        共用组件与 shadcn/ui
  hooks/             应用状态、语言
  lib/               类型、Tauri 调用、格式化、翻译和测试
  pages/             六个功能页面
src-tauri/
  capabilities/      Tauri 权限
  icons/             Windows 图标
  src/               Rust 服务、下载队列、模型库、设置和托盘
```

`node_modules/`、`.tools/`、`.cache/`、`dist/`、`src-tauri/target/` 和本地数据不会提交到 Git。

## 参与与许可

- [贡献指南](CONTRIBUTING.md)
- [开发文档](docs/开发文档.md)
- [验证记录](docs/验证记录.md)
- [发布指南](docs/发布指南.md)
- [更新日志](CHANGELOG.md)
- [第三方说明](THIRD_PARTY_NOTICES.md)

本项目采用 [MIT License](LICENSE)。Ollama、依赖库、模型及其商标遵循各自的许可证与使用条件，项目许可证不授予第三方商标权。
