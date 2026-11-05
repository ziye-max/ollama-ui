import { useTranslation } from "@/hooks/use-translation";
import { useState } from "react";
import { Download, ExternalLink, LoaderCircle, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/hooks/use-app";
import { commands, desktopAvailable } from "@/lib/commands";
import { canonicalModelName, currentLayerProgress, errorMessage, formatBytes, formatDate, isActive, phaseLabel, taskLabels } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/empty-state";

export function DownloadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const { connection, models, tasks, refreshTasks } = useApp();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  let canonical: string | null = null;
  try { canonical = canonicalModelName(name); } catch { /* Field feedback is shown on submit. */ }
  const installed = models.some((model) => model.name === canonical);
  const duplicate = tasks.some((task) => task.modelName === canonical && isActive(task.state));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(null);
    let modelName: string;
    try { modelName = canonicalModelName(name); } catch (error) { setError(errorMessage(error)); return; }
    setSubmitting(true);
    try { await commands.enqueue(modelName); await refreshTasks(); toast.success(t("{v0} 已加入下载队列", { v0: modelName })); setName(""); onOpenChange(false); }
    catch (error) { setError(errorMessage(error)); }
    finally { setSubmitting(false); }
  };
  return <Dialog open={open} onOpenChange={(value) => { if (!submitting) { onOpenChange(value); setError(null); } }}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>{t("下载模型")}</DialogTitle><DialogDescription>{t("输入 Ollama 模型名称及标签，下载到本机。")}</DialogDescription></DialogHeader><form onSubmit={submit}><div className="space-y-4 py-4"><div className="space-y-2"><Label htmlFor="model-name">{t("模型名称")}</Label><Input id="model-name" value={name} onChange={(event) => { setName(event.target.value); setError(null); }} placeholder={t("例如 qwen3:0.6b")} autoComplete="off" spellCheck={false} aria-invalid={!!error} aria-describedby="model-name-help" autoFocus /><p id="model-name-help" className="text-xs leading-5 text-muted-foreground">{canonical ? <>{t("将下载")} <span className="mono text-foreground">{canonical}</span></> : t("未填写标签时将使用 latest。")}</p></div>{installed && <p className="rounded-md bg-muted px-3 py-2 text-xs leading-5">{t("本机已有此标签，将重新拉取并检查更新。")}</p>}{duplicate && <p role="alert" className="text-xs text-destructive">{t("此模型已在下载队列中。")}</p>}{error && <p role="alert" className="text-xs leading-5 text-destructive">{t(error)}</p>}<Button type="button" variant="link" size="sm" className="h-auto p-0 text-sm text-muted-foreground" disabled={!desktopAvailable} onClick={() => void commands.openLibrary().catch((error) => toast.error(t(errorMessage(error))))}><ExternalLink className="size-3" />{t("在浏览器查看官方模型库")}</Button></div><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>{t("取消")}</Button><Button type="submit" disabled={submitting || duplicate || !name.trim() || connection.state !== "online"}>{submitting ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}{installed ? t("重新拉取") : t("加入下载")}</Button></DialogFooter></form></DialogContent></Dialog>;
}

export function Downloads({ onAdd }: { onAdd: () => void }) {
  const { t, locale } = useTranslation();
  const { tasks, connection, downloadError, refreshTasks } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const active = tasks.filter((task) => isActive(task.state));
  const handle = async (id: string, action: "cancel" | "retry") => {
    setBusy(id);
    try { await commands[action](id); await refreshTasks(); }
    catch (error) { toast.error(t(errorMessage(error))); }
    finally { setBusy(null); }
  };
  const clear = async () => { setBusy("clear"); try { await commands.clear(); await refreshTasks(); } catch (error) { toast.error(t(errorMessage(error))); } finally { setBusy(null); } };
  return <>
    <div className="mb-6 flex items-center justify-between"><span className="text-xs text-muted-foreground">{active.length > 0 && t("{v0} 个活动任务", { v0: active.length })}</span><Button size="sm" variant="ghost" className="text-sm text-muted-foreground" disabled={!desktopAvailable || !!busy || !tasks.some((task) => !isActive(task.state))} onClick={() => void clear()}><Trash2 className="size-3.5" />{t("清除已结束记录")}</Button></div>
    {downloadError && <p role="alert" className="mb-4 text-xs text-destructive">{t("任务读取失败：")}{t(downloadError)}</p>}
    <div className="table-wrap">
      {tasks.length === 0 ? <EmptyState icon={Download} title={t("暂无下载任务")} action={<Button size="sm" disabled={connection.state !== "online"} onClick={onAdd}><Plus className="size-3.5" />{t("添加下载")}</Button>} /> : <div className="divide-y">{tasks.map((task) => {
        const layer = task.layers.find((item) => item.digest === task.currentDigest);
        const progress = currentLayerProgress(task);
        return <div key={task.taskId} className="px-5 py-5"><div className="flex items-start justify-between gap-5"><div className="flex min-w-0 items-center gap-3"><div className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${task.state === "completed" ? "status-success" : "border bg-muted/30"}`}><Download className="size-4" strokeWidth={1.5} /></div><div className="min-w-0"><h2 className="truncate text-sm font-semibold" title={task.modelName}>{task.modelName}</h2><p className="mt-1 text-xs text-muted-foreground">{formatDate(task.createdAt, locale)}</p></div></div><div className="flex shrink-0 items-center gap-3"><Badge variant={task.state === "failed" ? "destructive" : "secondary"} className={`text-xs font-normal ${task.state === "completed" ? "status-success" : ""}`}>{t(taskLabels[task.state])}</Badge>{isActive(task.state) ? <Button variant="ghost" size="icon" className="size-8" disabled={busy === task.taskId || task.state === "cancelling"} aria-label={t("中止 {v0}", { v0: task.modelName })} title={t("中止本客户端任务")} onClick={() => void handle(task.taskId, "cancel")}>{busy === task.taskId ? <LoaderCircle className="size-4 animate-spin" /> : <X className="size-4" />}</Button> : ["failed", "interrupted", "cancelled"].includes(task.state) && <Button size="sm" variant="outline" className="h-8 text-sm" disabled={!!busy || connection.state !== "online"} onClick={() => void handle(task.taskId, "retry")}><RotateCcw className="size-3" />{t("重试")}</Button>}</div></div>
          {(task.state === "running" || task.state === "cancelling") && <div className="mt-4 pl-12"><Progress value={progress ?? 0} className={progress === null ? "indeterminate h-1.5" : "h-1.5"} aria-label={t("{v0} 当前层进度", { v0: task.modelName })} /><div className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>{t(phaseLabel(task.phase))}{progress !== null && t(" · 当前层 {v0}%", { v0: progress.toFixed(0) })}</span><span className="mono whitespace-nowrap">{layer && `${formatBytes(layer.completed, locale)} / ${formatBytes(layer.total, locale)}`}{!!task.bytesPerSecond && ` · ${formatBytes(task.bytesPerSecond, locale)}/s`}</span></div></div>}
          {task.state === "queued" && <p className="mt-3 pl-12 text-xs text-muted-foreground">{t("等待前面的下载任务结束")}</p>}
          {task.state === "interrupted" && <p className="mt-3 pl-12 text-xs text-muted-foreground">{t("应用上次退出时任务未完成，点击重试重新拉取。")}</p>}
          {task.error && <p role="alert" className="mt-3 break-all pl-12 text-xs leading-6 text-destructive">{t(task.error)}</p>}
        </div>;
      })}</div>}
    </div>
  </>;
}
