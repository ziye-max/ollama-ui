import { useTranslation } from "@/hooks/use-translation";
import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, LoaderCircle, Search, Tags } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/hooks/use-app";
import { commands, desktopAvailable } from "@/lib/commands";
import { errorMessage } from "@/lib/format";
import type { LibraryModel, LibraryModelSummary, LibrarySearch } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";

export function LibrarySearchControl({ query, onChange }: { query: string; onChange: (value: string) => void }) {
  const { t } = useTranslation();
  return <div className="relative ml-auto min-w-36 max-w-72 flex-1">
    <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
    <Input value={query} maxLength={100} onChange={(event) => onChange(event.target.value)} aria-label={t("搜索官方模型库")} placeholder={t("搜索模型…")} className="h-9 pl-8" />
  </div>;
}

export function Library({ query, onNavigate }: { query: string; onNavigate: (page: "downloads") => void }) {
  const { t } = useTranslation();
  const { connection, models, tasks, refreshTasks } = useApp();
  const [result, setResult] = useState<LibrarySearch | null>(null);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<LibraryModelSummary | null>(null);
  const [detail, setDetail] = useState<LibraryModel | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const requestId = useRef(0);
  const detailRequestId = useRef(0);
  const submitting = useRef(false);

  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    setMoreLoading(false);
    const timer = window.setTimeout(() => {
      void commands.searchLibrary(query, 1).then((next) => {
        if (requestId.current === id) setResult(next);
      }).catch((reason: unknown) => {
        if (requestId.current === id) setError(errorMessage(reason));
      }).finally(() => {
        if (requestId.current === id) setLoading(false);
      });
    }, query.trim() ? 250 : 0);
    return () => { window.clearTimeout(timer); requestId.current++; };
  }, [query, retryCount]);

  useEffect(() => {
    if (!selected) return;
    const id = ++detailRequestId.current;
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    void commands.libraryModel(selected.name).then((model) => {
      if (detailRequestId.current === id) setDetail(model);
    }).catch((reason: unknown) => {
      if (detailRequestId.current === id) setDetailError(errorMessage(reason));
    }).finally(() => {
      if (detailRequestId.current === id) setDetailLoading(false);
    });
    return () => { detailRequestId.current++; };
  }, [selected]);

  const loadMore = async () => {
    if (!result || moreLoading) return;
    const id = requestId.current;
    setMoreLoading(true);
    try {
      const next = await commands.searchLibrary(query, result.page + 1);
      if (requestId.current === id) setResult((current) => current ? { ...next, models: [...new Map([...current.models, ...next.models].map((model) => [model.name, model])).values()] } : next);
    } catch (reason) { if (requestId.current === id) toast.error(t(errorMessage(reason))); }
    finally { if (requestId.current === id) setMoreLoading(false); }
  };

  const enqueue = async (name: string) => {
    if (submitting.current) return;
    submitting.current = true;
    setDownloading(name);
    try {
      await commands.enqueue(name);
      await refreshTasks();
      toast.success(t("{v0} 已加入下载队列", { v0: name }));
      setSelected(null);
      onNavigate("downloads");
    } catch (reason) { toast.error(t(errorMessage(reason))); }
    finally { submitting.current = false; setDownloading(null); }
  };

  const activeTask = (name: string) => tasks.some((task) => task.modelName === name && ["queued", "running", "cancelling"].includes(task.state));
  const installed = (name: string) => models.some((model) => model.name === name);

  return <>
    {!desktopAvailable && <p role="status" className="mb-4 text-xs text-muted-foreground">{t("浏览器预览无法访问本机模型库。")}</p>}
    {!desktopAvailable && <div className="table-wrap"><EmptyState icon={Tags} title={t("请在桌面应用中浏览模型库")} /></div>}
    {desktopAvailable && error && <div className="mb-4 flex items-center justify-between gap-3 border-y py-3"><p role="alert" className="text-xs text-destructive">{t(error)}</p><Button size="sm" variant="outline" onClick={() => setRetryCount((value) => value + 1)}>{t("重试")}</Button></div>}
    {desktopAvailable && !error && <>
      <div className="table-wrap">
        <Table>
          <TableHeader><TableRow className="bg-muted/35 hover:bg-muted/35"><TableHead className="h-11 pl-5">{t("模型")}</TableHead><TableHead>{t("规格")}</TableHead><TableHead>{t("标签")}</TableHead><TableHead>{t("下载量")}</TableHead><TableHead className="secondary-column">{t("类别")}</TableHead><TableHead className="pr-5 text-right">{t("操作")}</TableHead></TableRow></TableHeader>
          <TableBody>
            {loading ? Array.from({ length: 6 }, (_, row) => <TableRow key={row}>{Array.from({ length: 6 }, (_, cell) => <TableCell key={cell} className="py-5"><Skeleton className="h-4 w-20" /></TableCell>)}</TableRow>) : result?.models.map((model) => <TableRow key={model.name} className="h-16">
              <TableCell className="max-w-[360px] pl-5"><button title={model.name} className="block max-w-full truncate text-left text-sm font-semibold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring" onClick={() => setSelected(model)}>{model.name}</button>{model.description && <p className="mt-1 max-w-[360px] truncate text-xs text-muted-foreground" title={model.description}>{model.description}</p>}</TableCell>
              <TableCell><div className="flex max-w-36 flex-wrap gap-1">{model.parameterSizes.slice(0, 3).map((size) => <Badge key={size} variant="secondary" className="rounded-sm px-1.5 py-0 text-xs font-normal">{size}</Badge>)}</div></TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">{model.tagCount ?? "—"}</TableCell>
              <TableCell className="mono whitespace-nowrap text-muted-foreground">{model.downloads ?? "—"}</TableCell>
              <TableCell className="secondary-column"><div className="flex max-w-60 flex-wrap gap-1">{model.categories.slice(0, 3).map((category) => <Badge key={category} variant="outline" className="rounded-sm px-1.5 py-0 text-xs font-normal">{category}</Badge>)}</div></TableCell>
              <TableCell className="pr-4 text-right"><Button size="sm" variant="outline" className="h-8 text-sm" onClick={() => setSelected(model)}><Tags className="size-3.5" />{t("查看标签")}</Button></TableCell>
            </TableRow>)}
          </TableBody>
        </Table>
        {!loading && result?.models.length === 0 && <EmptyState icon={Search} title={query.trim() ? t("没有找到匹配模型") : t("官方模型库暂无结果")} />}
      </div>
      {!loading && result && <div className="flex items-center justify-between py-4 text-xs text-muted-foreground"><span>{t("已加载 {count} 个模型", { count: result.models.length })}</span>{result.hasMore && <Button size="sm" variant="outline" className="h-8 text-sm" disabled={moreLoading} onClick={() => void loadMore()}>{moreLoading && <LoaderCircle className="size-3.5 animate-spin" />}{t("加载更多")}</Button>}</div>}
    </>}

    <Sheet open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl" aria-describedby={undefined}>
        <SheetHeader className="border-b px-6 py-5 pr-14"><SheetTitle className="break-all text-left">{detail?.name ?? selected?.name ?? t("模型详情")}</SheetTitle></SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {detailLoading && <div className="space-y-4"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" />{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-12 w-full" />)}</div>}
          {detailError && <div className="flex items-center justify-between gap-3"><p role="alert" className="text-xs text-destructive">{t(detailError)}</p><Button size="sm" variant="outline" onClick={() => setSelected({ ...selected! })}>{t("重试")}</Button></div>}
          {detail && <>
            {detail.description && <p className="mb-5 text-sm leading-6 text-muted-foreground">{detail.description}</p>}
            <div className="mb-5 flex flex-wrap gap-1.5">{detail.categories.map((category) => <Badge key={category} variant="outline" className="rounded-sm font-normal">{category}</Badge>)}</div>
            <div className="mb-5 grid grid-cols-2 gap-4 border-y py-4 text-sm"><div><span className="text-xs text-muted-foreground">{t("下载量")}</span><p className="mono mt-1 font-semibold">{detail.downloads ?? "—"}</p></div><div><span className="text-xs text-muted-foreground">{t("标签数量")}</span><p className="mono mt-1 font-semibold">{detail.tags.length}</p></div>{detail.updatedAt && <div className="col-span-2"><span className="text-xs text-muted-foreground">{t("最近更新")}</span><p className="mt-1">{detail.updatedAt}</p></div>}</div>
            <div className="space-y-2">{detail.tags.map((tag) => {
              const busy = activeTask(tag.name);
              const hasModel = installed(tag.name);
              return <div key={tag.name} className="flex items-center justify-between gap-4 border-b py-3 last:border-0"><div className="min-w-0"><div className="flex min-w-0 items-center gap-2"><code className="truncate text-sm font-semibold">{tag.name}</code>{tag.isDefault && <Badge variant="secondary" className="rounded-sm text-xs">{t("默认")}</Badge>}</div><div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"><span>{tag.size ?? t("大小未知")}</span>{tag.contextLength && <span>{tag.contextLength}  {t("上下文")}</span>}{tag.capabilities && <span>{tag.capabilities}</span>}</div>{tag.digest && <p className="mono mt-1 truncate text-xs text-muted-foreground" title={tag.digest}>{tag.digest}</p>}</div><Button size="sm" className="h-8 shrink-0 text-sm" disabled={connection.state !== "online" || busy || downloading === tag.name} onClick={() => void enqueue(tag.name)}>{downloading === tag.name ? <LoaderCircle className="size-3.5 animate-spin" /> : <ArrowDownToLine className="size-3.5" />}{busy ? t("已排队") : hasModel ? t("重新下载") : t("下载")}</Button></div>;
            })}</div>
            {detail.readme && <details className="mt-5 border-t pt-4"><summary className="cursor-pointer text-xs font-normal">{t("官方模型说明")}</summary><p className="mt-3 whitespace-pre-wrap break-words text-xs leading-6 text-muted-foreground">{detail.readme}</p></details>}
          </>}
        </div>
      </SheetContent>
    </Sheet>
  </>;
}
