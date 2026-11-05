import { useTranslation } from "@/hooks/use-translation";
import { useState } from "react";
import { Box, Download, Ellipsis, Info, LoaderCircle, Play, Search, Square, Trash2 } from "lucide-react";
import { useApp } from "@/hooks/use-app";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { ModelDetails } from "@/components/model-details";
import { formatBytes, formatDate, isActive } from "@/lib/format";
import type { LocalModel } from "@/lib/types";

export type ModelFilters = { search: string; sort: string; filter: string };

export function LocalModelControls({ value, onChange }: { value: ModelFilters; onChange: (value: ModelFilters) => void }) {
  const { t } = useTranslation();
  return <div className="ml-auto flex min-w-0 items-center gap-2" role="group" aria-label={t("模型列表工具栏")}>
      <div className="flex shrink-0 gap-1 rounded-lg bg-muted/70 p-1" aria-label={t("模型筛选")}>
        {[['all', t("全部模型")], ['loaded', t("已加载")]].map(([filter, label]) => <button key={filter} aria-pressed={value.filter === filter} onClick={() => onChange({ ...value, filter })} className={`whitespace-nowrap rounded-md px-2 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-ring ${value.filter === filter ? "bg-card text-foreground shadow-xs" : "text-muted-foreground"}`}>{label}</button>)}
      </div>
      <div className="relative min-w-24 max-w-56 flex-1"><Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" /><Input value={value.search} onChange={(event) => onChange({ ...value, search: event.target.value })} aria-label={t("搜索本地模型")} placeholder={t("搜索模型…")} className="h-9 w-full pl-8" /></div>
      <Select value={value.sort} onValueChange={(sort) => onChange({ ...value, sort })}><SelectTrigger className="h-9 w-36 shrink-0" aria-label={t("模型排序")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="name">{t("名称排序")}</SelectItem><SelectItem value="size">{t("文件大小")}</SelectItem><SelectItem value="modified">{t("最近修改")}</SelectItem></SelectContent></Select>
    </div>;
}

export function LocalModels({ onDownload, filters: { search, sort, filter } }: { onDownload: () => void; filters: ModelFilters }) {
  const { t, locale } = useTranslation();
  const { models, running, pending, connection, ready, refreshing, listError, runningError, mutate, tasks } = useApp();
  const [detail, setDetail] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<LocalModel | null>(null);
  const loaded = (name: string) => running.some((model) => model.name === name || model.model === name);
  const online = connection.state === "online";
  const stateKnown = online && !runningError;
  const filtered = models.filter((model) => model.name.toLowerCase().includes(search.toLowerCase()) && (filter !== "loaded" || loaded(model.name))).sort((a, b) => sort === "size" ? b.size - a.size : sort === "modified" ? new Date(b.modified_at).valueOf() - new Date(a.modified_at).valueOf() : a.name.localeCompare(b.name));
  const loading = !ready || (refreshing && models.length === 0 && connection.state === "checking");
  return <>
    {listError && <p role="alert" className="mb-4 text-xs text-destructive">{t("列表刷新失败：")}{t(listError)}{t("；已有内容可能过期。")}</p>}
    {runningError && <p role="alert" className="mb-4 text-xs text-destructive">{t("运行状态不可用：")}{t(runningError)}</p>}
    <div className="table-wrap">
      <Table>
        <TableHeader><TableRow className="bg-muted/35 hover:bg-muted/35"><TableHead className="h-11 pl-5">{t("模型名称")}</TableHead><TableHead>{t("参数 / 量化")}</TableHead><TableHead>{t("文件大小")}</TableHead><TableHead className="secondary-column">{t("修改时间")}</TableHead><TableHead>{t("状态")}</TableHead><TableHead className="pr-5 text-right">{t("操作")}</TableHead></TableRow></TableHeader>
        <TableBody>
          {loading ? Array.from({ length: 4 }, (_, index) => <TableRow key={index}>{Array.from({ length: 6 }, (_, cell) => <TableCell key={cell} className="py-6"><Skeleton className="h-4 w-16" /></TableCell>)}</TableRow>) : filtered.map((model) => {
            const active = loaded(model.name);
            const downloading = tasks.some((task) => task.modelName === model.name && isActive(task.state));
            const busy = pending[model.name];
            return <TableRow key={model.name} className="group h-20">
              <TableCell className="max-w-56 pl-5"><div className="flex items-center gap-3"><div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/30"><Box className="size-4 text-muted-foreground" strokeWidth={1.5} /></div><div className="min-w-0"><button title={model.name} onClick={() => setDetail(model.name)} disabled={!online} className="block max-w-48 truncate text-left text-sm font-semibold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring xl:max-w-64">{model.name}</button><span className="mt-1 block text-xs text-muted-foreground">{model.details?.family || t("Ollama 模型")}</span></div></div></TableCell>
              <TableCell><div>{model.details?.parameter_size || "—"}</div><div className="mono mt-1 text-xs text-muted-foreground">{model.details?.quantization_level || "—"}</div></TableCell>
              <TableCell className="mono whitespace-nowrap">{formatBytes(model.size, locale)}</TableCell>
              <TableCell className="secondary-column whitespace-nowrap text-muted-foreground">{formatDate(model.modified_at, locale)}</TableCell>
              <TableCell><span className="model-state whitespace-nowrap" data-running={stateKnown && active}>{busy ? <LoaderCircle className="size-3 animate-spin" /> : <i className="state-dot" />}{(busy ? t(busy) : null) || (!stateKnown ? t("状态未知") : active ? t("已加载") : t("未加载"))}</span></TableCell>
              <TableCell className="pr-4"><div className="flex justify-end gap-1"><Button variant="ghost" size="sm" className="h-8 px-2 text-sm" disabled={!stateKnown || !!busy || downloading} onClick={() => void mutate(model.name, active ? "unload" : "load")} title={active ? t("卸载将释放资源，可能影响其他应用") : t("加载到内存")}>{active ? <Square className="size-3" /> : <Play className="size-3" />}{active ? t("卸载") : t("加载")}</Button><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-8" aria-label={t("{v0} 更多操作", { v0: model.name })}><Ellipsis className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem disabled={!online} onClick={() => setDetail(model.name)}><Info className="size-4" />{t("模型详情")}</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" disabled={!stateKnown || active || !!busy || downloading} onClick={() => setDeleting(model)}><Trash2 className="size-4" />{t("删除模型")}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div></TableCell>
            </TableRow>;
          })}
        </TableBody>
      </Table>
      {!loading && filtered.length === 0 && <EmptyState icon={search ? Search : Box} title={search ? t("没有找到匹配模型") : filter === "loaded" ? t("暂无已加载模型") : online ? t("还没有本地模型") : t("连接后查看本地模型")} action={!search && filter === "all" && online && <Button size="sm" onClick={onDownload}><Download className="size-3.5" />{t("下载模型")}</Button>} />}
    </div>
      <div className="mt-4 text-xs text-muted-foreground">{online && !listError ? t("共 {v0} 个模型{v1}", { v0: models.length, v1: search || filter !== "all" ? t(" · 显示 {v0} 个", { v0: filtered.length }) : "" }) : models.length > 0 ? t("显示上次读取的模型列表") : t("等待连接 Ollama")}</div>
    <ModelDetails name={detail} onClose={() => setDetail(null)} />
    <AlertDialog open={!!deleting} onOpenChange={(open) => { if (!open) setDeleting(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t("删除这个模型？")}</AlertDialogTitle><AlertDialogDescription className="break-all">{t("将从本机 Ollama 中删除 {name}。需要再次使用时须重新下载。", { name: deleting?.name ?? "" })}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t("取消")}</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { if (deleting) void mutate(deleting.name, "delete"); setDeleting(null); }}>{t("删除模型")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}
