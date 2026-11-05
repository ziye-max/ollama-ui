export type Page = "dashboard" | "models" | "library" | "running" | "downloads" | "settings";
export type Theme = "light" | "dark" | "system";
export type Language = "zh-CN" | "en-US";

export interface Settings {
  endpoint: string;
  theme: Theme;
  language: Language;
  keepAliveMinutes: number;
}

export interface ModelDetails {
  family?: string;
  families?: string[];
  parameter_size?: string;
  quantization_level?: string;
  format?: string;
}

export interface LocalModel {
  name: string;
  model?: string;
  digest: string;
  size: number;
  modified_at: string;
  details?: ModelDetails;
}

export interface RunningModel extends LocalModel {
  size_vram?: number;
  expires_at?: string;
  context_length?: number;
}

export interface ModelInfo {
  details?: ModelDetails;
  capabilities?: string[];
  model_info?: Record<string, unknown>;
  parameters?: string;
  license?: string;
}

export interface LibraryModelSummary {
  name: string;
  description: string;
  downloads: string | null;
  tagCount: number | null;
  categories: string[];
  parameterSizes: string[];
}

export interface LibrarySearch {
  models: LibraryModelSummary[];
  page: number;
  hasMore: boolean;
  total: number | null;
}

export interface LibraryTag {
  name: string;
  size: string | null;
  contextLength: string | null;
  capabilities: string | null;
  digest: string | null;
  isDefault: boolean;
}

export interface LibraryModel {
  name: string;
  description: string;
  downloads: string | null;
  updatedAt: string | null;
  categories: string[];
  readme: string;
  tags: LibraryTag[];
}

export type TaskState = "queued" | "running" | "cancelling" | "completed" | "failed" | "cancelled" | "interrupted";

export interface DownloadLayer {
  digest: string;
  total: number;
  completed: number;
}

export interface DownloadTask {
  taskId: string;
  attemptId: string;
  endpoint: string;
  modelName: string;
  state: TaskState;
  phase: string;
  layers: DownloadLayer[];
  currentDigest: string | null;
  bytesPerSecond: number | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
  sequence: number;
}

export interface AppError {
  code: string;
  message: string;
  detail?: string;
  retryable?: boolean;
}

export interface Connection {
  state: "checking" | "online" | "offline";
  version?: string;
  error?: string;
  detail?: string;
}
