# 第三方说明

项目自身代码采用 [MIT License](LICENSE)。第三方依赖仍保留原有版权与许可证，不能以项目许可证替代。

## 主要组件

| 组件 | 用途 | 许可证 |
| --- | --- | --- |
| [Tauri](https://github.com/tauri-apps/tauri) | 原生桌面框架 | MIT / Apache-2.0 |
| [React](https://github.com/facebook/react) | 界面 | MIT |
| [shadcn/ui](https://github.com/shadcn-ui/ui) | `src/components/ui/` 组件来源，后续有本地修改 | MIT |
| [Radix UI](https://github.com/radix-ui/primitives) | 无障碍交互组件 | MIT |
| [Lucide](https://github.com/lucide-icons/lucide) | 界面图标 | ISC，含 Feather MIT 部分 |
| [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) | 样式 | MIT |
| [Vite](https://github.com/vitejs/vite) | 前端构建 | MIT |

完整版本与依赖关系见 `package-lock.json` 和 `src-tauri/Cargo.lock`。上述表格不是所有传递依赖的完整清单；分发依赖及二进制时仍需遵守各自许可证。

shadcn/ui 和 Lucide 的许可证声明保存在 [第三方许可证目录](docs/licenses/README.md)。其他依赖的许可证见对应包或源码仓库。

## 品牌与模型

`assets/brand/app.ico` 为维护者提供的品牌源图，派生资源用于前端、favicon、窗口、托盘和安装包。更换或分发素材时应确认其来源和授权。

Ollama 名称与相关商标归各自权利人所有。本项目是独立社区客户端，与官方无隶属关系；MIT 不授予第三方商标权。

模型、模型权重、官方模型说明和元数据遵循各自许可证与使用条件，不随本项目 MIT 许可证重新授权。项目仓库不包含 Ollama 引擎、模型文件或开发工具链二进制。
