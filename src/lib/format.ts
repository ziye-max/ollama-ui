import type { DownloadTask, Language, TaskState } from "./types";

export function formatBytes(value?: number | null, locale: Language = "zh-CN"): string {
  if (value == null || !Number.isFinite(value) || value < 0) return "—";
  if (value === 0) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: index > 1 ? 2 : 0 }).format(value / 1024 ** index)} ${units[index]}`;
}

export function formatDate(value: string | number, locale: Language = "zh-CN"): string {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) return "—";
  return new Intl.DateTimeFormat(locale, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

export function canonicalModelName(value: string): string {
  const name = value.trim();
  if (!name) throw new Error("请输入模型名称。");
  if (name.length > 200 || /\s/.test(name) || !/^[a-z0-9][a-z0-9._/-]*(?::[a-zA-Z0-9_][a-zA-Z0-9_.-]*)?$/.test(name)) {
    throw new Error("模型名称格式不正确，请使用模型名:标签，不要包含空格或网址。");
  }
  if (name.includes("..") || name.includes("//") || name.endsWith("/")) throw new Error("模型名称不能包含空路径或相对路径。");
  const canonical = name.includes(":") ? name : `${name}:latest`;
  if (canonical.split(":")[1].toLowerCase().endsWith("cloud")) throw new Error("第一版仅支持下载到本机的模型，请选择本地模型标签。");
  return canonical;
}

export function validateEndpoint(value: string): string {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== "/" || url.port === "0") throw new Error();
    return url.origin;
  } catch {
    throw new Error("请输入本机 HTTP 地址，例如 http://127.0.0.1:11434。");
  }
}

export function isActive(state: TaskState): boolean {
  return state === "queued" || state === "running" || state === "cancelling";
}

export const taskLabels: Record<TaskState, string> = {
  queued: "排队中", running: "下载中", cancelling: "正在中止", completed: "已完成", failed: "下载失败", cancelled: "已中止", interrupted: "已中断",
};

export function phaseLabel(phase: string): string {
  if (phase.startsWith("pulling ") && phase !== "pulling manifest") return "正在传输模型层";
  const phases: Record<string, string> = { "pulling manifest": "获取模型清单", "verifying sha256 digest": "校验文件", "writing manifest": "写入模型清单", "removing any unused layers": "清理模型层", success: "下载完成", queued: "等待下载", interrupted: "应用上次退出时任务未完成" };
  return phases[phase] ?? phase;
}

export function currentLayerProgress(task: DownloadTask): number | null {
  const layer = task.layers.find((item) => item.digest === task.currentDigest);
  if (!layer || layer.total <= 0) return null;
  return Math.min(100, Math.max(0, layer.completed / layer.total * 100));
}

export function mergeTask(tasks: DownloadTask[], incoming: DownloadTask): DownloadTask[] {
  const old = tasks.find((item) => item.taskId === incoming.taskId);
  if (old && old.sequence >= incoming.sequence) return tasks;
  return [incoming, ...tasks.filter((item) => item.taskId !== incoming.taskId)].sort((a, b) => b.createdAt - a.createdAt);
}

export function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return "操作未完成，请重试。";
}

export function errorDetail(error: unknown): string | undefined {
  return error && typeof error === "object" && "detail" in error && error.detail ? String(error.detail) : undefined;
}
