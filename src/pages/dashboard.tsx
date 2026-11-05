import { useTranslation } from "@/hooks/use-translation";
import { Activity, ArrowRight, Box, Cpu, Download, HardDrive, MemoryStick, Server } from "lucide-react";
import { useApp } from "@/hooks/use-app";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { currentLayerProgress, formatBytes, isActive, phaseLabel, taskLabels } from "@/lib/format";
import type { Page, TaskState } from "@/lib/types";

export function Dashboard({ onNavigate, onDownload }: { onNavigate: (page: Page) => void; onDownload: () => void }) {
  const { t, locale } = useTranslation();
  const { models, running, tasks, connection, settings, ready, refreshing, updatedAt, listError, runningError, downloadError } = useApp();
  const online = connection.state === "online";
  const loading = !ready || connection.state === "checking" || (refreshing && updatedAt === null);
  const modelsKnown = online && !listError && !loading;
  const runningKnown = online && !runningError && !loading;
  const loadedBytes = running.reduce((sum, model) => sum + model.size, 0);
  const vramBytes = running.every((model) => typeof model.size_vram === "number" && Number.isFinite(model.size_vram) && model.size_vram >= 0)
    ? running.reduce((sum, model) => sum + model.size_vram!, 0) : undefined;
  const fileBytes = models.reduce((sum, model) => sum + model.size, 0);
  const active = tasks.filter((task) => isActive(task.state));
  const taskPriority = (state: TaskState) => state === "running" || state === "cancelling" ? 2 : state === "queued" ? 1 : 0;
  const recentTasks = [...tasks].sort((a, b) => taskPriority(b.state) - taskPriority(a.state) || b.createdAt - a.createdAt).slice(0, 3);
  const metrics = [
    { label: t("本地模型"), value: modelsKnown ? models.length.toLocaleString(locale) : "—", unit: modelsKnown ? t("个") : "", Icon: Box },
    { label: t("运行中"), value: runningKnown ? running.length.toLocaleString(locale) : "—", unit: runningKnown ? t("个") : "", Icon: Activity },
    { label: t("加载占用"), value: runningKnown ? formatBytes(loadedBytes, locale) : "—", unit: "", Icon: MemoryStick },
    { label: t("显存占用"), value: runningKnown ? formatBytes(vramBytes, locale) : "—", unit: "", Icon: Cpu },
  ];

  return <div className="space-y-5">
    {listError && <p role="alert" className="text-xs text-destructive">{t("本地模型读取失败：")}{t(listError)}</p>}
    <dl className="grid grid-cols-4 gap-3" aria-label={t("模型概览")}>
      {metrics.map(({ label, value, unit, Icon }) => <div key={label} className="min-w-0 rounded-lg border bg-card p-4 xl:p-5">
        <dt className="flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>{label}</span><Icon className="size-4 shrink-0" strokeWidth={1.6} aria-hidden="true" /></dt>
        <dd className="mt-4 flex items-baseline gap-1.5 whitespace-nowrap">{loading ? <Skeleton className="h-7 w-20" /> : <><span className="text-2xl font-semibold tabular-nums">{value}</span>{unit && <span className="text-xs text-muted-foreground">{unit}</span>}</>}</dd>
      </div>)}
    </dl>

    <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] items-stretch gap-5">
      <section className="flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card" aria-labelledby="dashboard-running">
        <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-5"><h2 id="dashboard-running" className="text-sm font-semibold">{t("运行模型")}</h2><Button size="sm" variant="ghost" className="h-8 px-0 text-sm text-muted-foreground" onClick={() => onNavigate("running")} aria-label={t("查看全部运行模型")}>{t("查看全部")}<ArrowRight className="size-3.5" /></Button></div>
        {runningError ? <div className="flex min-h-52 flex-col items-center justify-center gap-3 px-5 py-8 text-center"><Activity className="size-6 text-muted-foreground" strokeWidth={1.5} /><p className="text-sm">{t("运行状态不可用")}</p><p role="alert" className="max-w-full break-words text-xs text-muted-foreground">{t(runningError)}</p></div>
          : loading ? <div className="min-h-52 space-y-5 p-5" aria-label={t("正在读取运行模型")}>{[0, 1, 2].map((key) => <Skeleton key={key} className="h-9 w-full" />)}</div>
          : runningKnown && running.length > 0 ? <Table className="table-fixed"><TableHeader><TableRow className="bg-muted/35 hover:bg-muted/35"><TableHead className="h-10 pl-5">{t("模型名称")}</TableHead><TableHead className="w-25 text-right">{t("加载大小")}</TableHead><TableHead className="w-25 pr-5 text-right">{t("显存")}</TableHead></TableRow></TableHeader><TableBody>{running.slice(0, 3).map((model) => <TableRow className="h-14" key={model.name}><TableCell className="pl-5"><p className="truncate font-semibold" title={model.name}>{model.name}</p><span className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground"><i className="state-dot" />{t("已加载")}</span></TableCell><TableCell className="whitespace-nowrap text-right tabular-nums">{formatBytes(model.size, locale)}</TableCell><TableCell className="whitespace-nowrap pr-5 text-right tabular-nums">{formatBytes(model.size_vram, locale)}</TableCell></TableRow>)}</TableBody></Table>
          : <div className="flex min-h-52 flex-1 flex-col items-center justify-center gap-3 px-5 py-8"><Activity className="size-6 text-muted-foreground" strokeWidth={1.5} /><p className="text-sm">{online ? t("暂无运行中的模型") : t("连接后查看运行状态")}</p><Button size="sm" variant="outline" className="mt-1 text-sm" onClick={() => onNavigate(online ? "models" : "settings")}>{online ? t("管理模型") : t("连接设置")}</Button></div>}
      </section>

      <section className="flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card" aria-labelledby="dashboard-downloads">
        <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-5"><div className="flex min-w-0 items-center gap-2"><h2 id="dashboard-downloads" className="whitespace-nowrap text-sm font-semibold">{t("下载任务")}</h2>{ready && !downloadError && active.length > 0 && <Badge variant="secondary" className="text-xs font-normal">{active.length}  {t("进行中")}</Badge>}</div><Button size="sm" variant="ghost" className="h-8 px-0 text-sm text-muted-foreground" onClick={() => onNavigate("downloads")} aria-label={t("查看全部下载任务")}>{t("查看全部")}<ArrowRight className="size-3.5" /></Button></div>
        {downloadError ? <div className="flex min-h-52 flex-1 flex-col items-center justify-center gap-3 px-5 py-8 text-center"><Download className="size-6 text-muted-foreground" strokeWidth={1.5} /><p className="text-sm">{t("下载任务读取失败")}</p><p role="alert" className="max-w-full break-words text-xs text-muted-foreground">{t(downloadError)}</p></div>
          : !ready ? <div className="min-h-52 space-y-5 p-5" aria-label={t("正在读取下载任务")}>{[0, 1, 2].map((key) => <Skeleton key={key} className="h-9 w-full" />)}</div>
          : recentTasks.length > 0 ? <div className="divide-y">{recentTasks.map((task) => {
            const progress = currentLayerProgress(task);
            const downloading = task.state === "running" || task.state === "cancelling";
            return <button key={task.taskId} className="block w-full px-5 py-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring" onClick={() => onNavigate("downloads")} aria-label={t("查看下载任务 {v0}", { v0: task.modelName })}>
              <div className="flex min-w-0 items-center justify-between gap-3"><span className="truncate text-sm font-semibold" title={task.modelName}>{task.modelName}</span><span className="shrink-0 text-xs text-muted-foreground">{t(taskLabels[task.state])}</span></div>
              {downloading && <div className="mt-3"><Progress value={progress} className={progress === null ? "indeterminate h-1" : "h-1"} aria-label={t("{v0} 当前层进度", { v0: task.modelName })} /><div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground"><span className="min-w-0 truncate">{progress === null ? t(phaseLabel(task.phase)) : t("当前层 {v0}%", { v0: progress.toFixed(0) })}</span>{task.state === "running" && task.bytesPerSecond !== null && <span className="shrink-0 tabular-nums">{formatBytes(task.bytesPerSecond, locale)}/s</span>}</div></div>}
            </button>;
          })}</div>
          : <div className="flex min-h-52 flex-1 flex-col items-center justify-center gap-3 px-5 py-8"><Download className="size-6 text-muted-foreground" strokeWidth={1.5} /><p className="text-sm">{t("暂无下载任务")}</p><Button size="sm" variant="outline" className="mt-1 text-sm" disabled={!online} onClick={onDownload}>{t("下载模型")}</Button></div>}
      </section>
    </div>

    <section className="flex items-center gap-5 rounded-lg border bg-card px-5 py-4" aria-label={t("Ollama 服务")}>
      <div className="flex min-w-0 flex-1 items-center gap-3"><div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/30"><Server className="size-4 text-muted-foreground" strokeWidth={1.5} /></div><div className="min-w-0"><div className="flex items-center gap-2 text-sm font-semibold"><span>Ollama</span><span className="inline-flex items-center gap-1.5 text-xs font-normal text-muted-foreground"><i className={`state-dot ${connection.state === "checking" ? "animate-pulse" : ""}`} />{online ? t("已连接") : connection.state === "checking" ? t("连接中") : t("未连接")}</span></div><p className="mono mt-1 truncate text-xs text-muted-foreground" title={settings.endpoint}>{settings.endpoint}</p></div></div>
      <dl className="flex shrink-0 items-center gap-6 text-sm"><div><dt className="text-xs text-muted-foreground">{t("服务版本")}</dt><dd className="mono mt-1">{online && connection.version ? `v${connection.version}` : "—"}</dd></div><div><dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><HardDrive className="size-3" aria-hidden="true" />{t("模型文件合计")}</dt><dd className="mono mt-1">{modelsKnown ? formatBytes(fileBytes, locale) : "—"}</dd></div></dl>
      <Button size="sm" variant="ghost" className="h-8 shrink-0 text-sm text-muted-foreground" onClick={() => onNavigate("settings")} aria-label={t("打开连接设置")}>{t("设置")}<ArrowRight className="size-3.5" /></Button>
    </section>
  </div>;
}
