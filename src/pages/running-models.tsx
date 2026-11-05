import { useTranslation } from "@/hooks/use-translation";
import { Activity, Box, LoaderCircle, Square } from "lucide-react";
import { useApp } from "@/hooks/use-app";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { formatBytes, formatDate } from "@/lib/format";

export function RunningModels() {
  const { t, locale } = useTranslation();
  const { running, connection, runningError, pending, mutate } = useApp();
  const online = connection.state === "online" && !runningError;
  return <>
    {runningError && <p role="alert" className="mb-4 text-xs text-destructive">{t("运行状态刷新失败：")}{t(runningError)}</p>}
    <div className="table-wrap"><Table><TableHeader><TableRow className="bg-muted/35 hover:bg-muted/35"><TableHead className="h-11 pl-5">{t("模型名称")}</TableHead><TableHead>{t("加载大小")}</TableHead><TableHead>{t("显存占用")}</TableHead><TableHead className="secondary-column">{t("上下文长度")}</TableHead><TableHead>{t("预计驻留至")}</TableHead><TableHead className="pr-5 text-right">{t("操作")}</TableHead></TableRow></TableHeader><TableBody>{running.map((model) => <TableRow className="h-20" key={model.name}><TableCell className="max-w-60 pl-5"><div className="flex items-center gap-3"><div className="status-success flex size-9 shrink-0 items-center justify-center rounded-lg"><Box className="size-4" strokeWidth={1.5} /></div><div className="min-w-0"><p className="truncate text-sm font-semibold" title={model.name}>{model.name}</p><span className="model-state mt-1" data-running={online}><i className="state-dot" />{online ? t("已加载") : t("状态未知")}</span></div></div></TableCell><TableCell className="mono whitespace-nowrap">{formatBytes(model.size, locale)}</TableCell><TableCell className="mono whitespace-nowrap">{formatBytes(model.size_vram, locale)}</TableCell><TableCell className="secondary-column mono">{model.context_length?.toLocaleString(locale) ?? "—"}</TableCell><TableCell className="whitespace-nowrap text-muted-foreground">{model.expires_at ? formatDate(model.expires_at, locale) : "—"}</TableCell><TableCell className="pr-4 text-right"><Button variant="outline" size="sm" disabled={!online || !!pending[model.name]} title={t("卸载将释放资源，可能影响其他应用")} onClick={() => void mutate(model.name, "unload")}>{pending[model.name] ? <LoaderCircle className="size-3 animate-spin" /> : <Square className="size-3" />}{(pending[model.name] ? t(pending[model.name]) : null) || t("卸载")}</Button></TableCell></TableRow>)}</TableBody></Table>{running.length === 0 && <EmptyState icon={Activity} title={online ? t("暂无运行中的模型") : t("连接后查看运行状态")} />}</div>
  </>;
}
