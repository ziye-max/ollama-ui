import { Channel, invoke, isTauri } from "@tauri-apps/api/core";
import type { DownloadTask, LibraryModel, LibrarySearch, LocalModel, ModelInfo, RunningModel, Settings } from "./types";

export const desktopAvailable = isTauri();

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!desktopAvailable) throw new Error("浏览器预览无法连接本机服务，请运行桌面应用。");
  return invoke<T>(command, args);
}

export const commands = {
  settings: () => call<Settings>("get_settings"),
  saveSettings: (settings: Settings) => call<Settings>("save_settings", { settings }),
  connection: (endpoint?: string) => call<{ version: string }>("get_connection_status", { endpoint: endpoint ?? null }),
  models: () => call<LocalModel[]>("list_models"),
  running: () => call<RunningModel[]>("list_running_models"),
  details: (name: string) => call<ModelInfo>("get_model_details", { name }),
  searchLibrary: (query: string, page = 1) => call<LibrarySearch>("search_library", { query, page }),
  libraryModel: (name: string) => call<LibraryModel>("get_library_model", { name }),
  load: (name: string) => call<void>("load_model", { name }),
  unload: (name: string) => call<void>("unload_model", { name }),
  delete: (name: string) => call<void>("delete_model", { name }),
  downloads: () => call<DownloadTask[]>("list_download_tasks"),
  enqueue: (name: string) => call<DownloadTask>("enqueue_download", { name }),
  cancel: (taskId: string) => call<void>("cancel_download", { taskId }),
  retry: (taskId: string) => call<DownloadTask>("retry_download", { taskId }),
  clear: () => call<void>("clear_download_history"),
  shutdown: () => call<void>("shutdown_downloads"),
  exitApp: () => call<void>("exit_app"),
  openLibrary: () => call<void>("open_official_library"),
  subscribe: async (onTask: (task: DownloadTask) => void) => {
    const channel = new Channel<DownloadTask>();
    channel.onmessage = onTask;
    await call<void>("subscribe_downloads", { channel });
    return channel;
  },
};
