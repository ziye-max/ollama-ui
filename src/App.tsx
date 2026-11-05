import { useTranslation } from "@/hooks/use-translation";
import { useEffect, useRef, useState } from "react";
import { Activity, ArrowUpRight, BookOpen, Box, CircleHelp, Download, LayoutDashboard, LoaderCircle, Plus, RefreshCw, Settings2, WifiOff } from "lucide-react";
import appIcon from "@/assets/app-icon.png";
import { toast } from "sonner";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AppProvider, useApp } from "@/hooks/use-app";
import { commands, desktopAvailable } from "@/lib/commands";
import { errorMessage, isActive } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { LocalModelControls, LocalModels, type ModelFilters } from "@/pages/local-models";
import { RunningModels } from "@/pages/running-models";
import { DownloadDialog, Downloads } from "@/pages/downloads";
import { Settings } from "@/pages/settings";
import { Dashboard } from "@/pages/dashboard";
import { Library, LibrarySearchControl } from "@/pages/library";
import type { Page } from "@/lib/types";

const pageTitles: Record<Page, string> = {
  dashboard: "仪表盘",
  models: "本地模型",
  library: "模型库",
  running: "运行中",
  downloads: "下载任务",
  settings: "设置",
};

function Shell() {
  const { t, locale } = useTranslation();
  const { models, running, tasks, connection, refreshing, refresh, settings, updatedAt, runningError } = useApp();
  const [page, setPage] = useState<Page>("dashboard");
  const [modelFilters, setModelFilters] = useState<ModelFilters>({ search: "", sort: "name", filter: "all" });
  const [libraryQuery, setLibraryQuery] = useState("");
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const activeCount = tasks.filter((task) => isActive(task.state)).length;
  const titleRef = useRef<HTMLHeadingElement>(null);
  const online = connection.state === "online";

  useEffect(() => {
    if (!desktopAvailable) return;
    let disposed = false;
    let stop: (() => void) | undefined;
    let requestingExit = false;
    void getCurrentWindow().listen("app-exit-requested", () => {
      if (requestingExit) return;
      requestingExit = true;
      void commands.downloads().then(async (currentTasks) => {
        if (currentTasks.some((task) => isActive(task.state))) setCloseOpen(true);
        else await commands.exitApp();
      }).catch((error: unknown) => toast.error(t(errorMessage(error)))).finally(() => { requestingExit = false; });
    }).then((unlisten) => { if (disposed) unlisten(); else stop = unlisten; });
    return () => { disposed = true; stop?.(); };
  }, [t]);

  const navigate = (next: Page) => { setPage(next); requestAnimationFrame(() => titleRef.current?.focus()); };
  const addDownload = () => { setPage("downloads"); setDownloadOpen(true); };
  const exit = async () => {
    setClosing(true);
    try { await commands.exitApp(); }
    catch (error) { toast.error(t(errorMessage(error))); setClosing(false); }
  };

  return <TooltipProvider delayDuration={250}>
    <div className="app-shell">
      <aside className="sidebar flex min-h-0 flex-col border-r px-3 py-6" aria-label={t("主菜单")}>
        <div className="mb-10 flex items-center gap-3 px-3"><img src={appIcon} alt="" className="size-9 shrink-0 rounded-lg bg-neutral-950" /><p className="text-sm font-semibold">{t("ollama ui")}</p></div>
        <p className="section-label mb-3 px-3">{t("工作空间")}</p>
        <nav className="space-y-1">{([{ id: "dashboard", label: t("仪表盘"), Icon: LayoutDashboard, count: null }, { id: "models", label: t("本地模型"), Icon: Box, count: online ? models.length : null }, { id: "library", label: t("模型库"), Icon: BookOpen, count: null }, { id: "running", label: t("运行中"), Icon: Activity, count: online && !runningError ? running.length : null }, { id: "downloads", label: t("下载任务"), Icon: Download, count: activeCount || null }] as const).map(({ id, label, Icon, count }) => <button key={id} onClick={() => navigate(id)} className="nav-item" aria-current={page === id ? "page" : undefined}><Icon className="size-4" strokeWidth={1.7} /><span className="flex-1 text-left">{label}</span>{count !== null && <span className="mono text-xs opacity-70">{count}</span>}</button>)}</nav>
        <div className="mt-auto space-y-1 pt-8"><button className="nav-item" onClick={() => navigate("settings")} aria-current={page === "settings" ? "page" : undefined}><Settings2 className="size-4" strokeWidth={1.7} /><span>{t("设置")}</span></button><button className="nav-item" disabled={!desktopAvailable} onClick={() => void commands.openLibrary().catch((error) => toast.error(t(errorMessage(error))))}><CircleHelp className="size-4" strokeWidth={1.7} /><span className="flex-1 text-left">{t("官方模型库")}</span><ArrowUpRight className="size-3" /></button></div>
        <div className="mx-2 mt-5 border-t pt-5"><div className="flex items-center gap-2 text-sm"><i className={`size-1.5 rounded-full ${online ? "bg-primary" : connection.state === "checking" ? "animate-pulse bg-muted-foreground" : "bg-muted-foreground/60"}`} /><span>{!desktopAvailable ? t("浏览器预览") : online ? t("Ollama 已连接") : connection.state === "checking" ? t("正在连接…") : t("Ollama 未连接")}</span></div><p className="mono mt-2 truncate pl-3.5 text-xs text-muted-foreground" title={settings.endpoint}>{online ? `v${connection.version}` : settings.endpoint.replace("http://", "")}</p></div>
      </aside>
      <div className="flex min-w-0 flex-col overflow-hidden"><header className="flex min-h-18 shrink-0 items-center gap-3 overflow-x-auto border-b px-7 xl:gap-5 xl:px-10"><h1 ref={titleRef} tabIndex={-1} className="shrink-0 whitespace-nowrap text-xl font-semibold outline-none">{t(pageTitles[page])}</h1>
          {page === "models" && <div role="group" aria-label={t("页面操作")} className="flex shrink-0 items-center gap-2"><Button variant="outline" size="sm" className="h-9 text-sm" aria-label={t("刷新列表")} disabled={refreshing || !desktopAvailable} onClick={() => void refresh()}><RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />{t("刷新")}</Button><Button size="sm" className="h-9 text-sm" disabled={!online} onClick={addDownload}><Plus className="size-3.5" />{t("下载模型")}</Button></div>}
          {page === "models" && <LocalModelControls value={modelFilters} onChange={setModelFilters} />}
          {page === "library" && <LibrarySearchControl query={libraryQuery} onChange={setLibraryQuery} />}
        </header>
        <main className="min-h-0 flex-1 overflow-auto px-7 py-7 xl:px-10">
          {connection.state === "offline" && page !== "library" && <div className="mb-6 flex items-start gap-3 rounded-lg border bg-muted/35 px-4 py-3" role="status"><WifiOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{desktopAvailable ? t("无法连接 Ollama") : t("浏览器界面预览")}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{t(connection.error)}</p>{connection.detail && <details className="mt-1 text-xs text-muted-foreground"><summary className="cursor-pointer">{t("详细原因")}</summary><p className="mt-1 break-all">{connection.detail}</p></details>}</div>{desktopAvailable && <Button variant="ghost" size="sm" className="h-7 text-sm" onClick={() => navigate("settings")}>{t("检查设置")}</Button>}</div>}
          {page === "dashboard" && <Dashboard onNavigate={navigate} onDownload={addDownload} />}
          {page === "models" && <LocalModels onDownload={addDownload} filters={modelFilters} />}
          {page === "library" && <Library query={libraryQuery} onNavigate={navigate} />}
          {page === "running" && <RunningModels />}
          {page === "downloads" && <Downloads onAdd={addDownload} />}
          {page === "settings" && <Settings />}
        </main>
        <footer className="flex h-9 shrink-0 items-center justify-end border-t px-7 text-xs text-muted-foreground xl:px-10"><span>{refreshing ? t("正在刷新…") : updatedAt ? t("上次同步 {v0}", { v0: new Date(updatedAt).toLocaleTimeString(locale, { hour12: false }) }) : t("尚未同步")}</span></footer>
      </div>
    </div>
    <DownloadDialog open={downloadOpen} onOpenChange={setDownloadOpen} />
    <AlertDialog open={closeOpen} onOpenChange={setCloseOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t("还有下载任务，确定退出？")}</AlertDialogTitle><AlertDialogDescription>{t("退出将中止本客户端的活动任务。下次打开后可以重新拉取，其他客户端的请求不受此按钮直接控制。")}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={closing}>{t("返回应用")}</AlertDialogCancel><AlertDialogAction disabled={closing} onClick={(event) => { event.preventDefault(); void exit(); }}>{closing && <LoaderCircle className="size-3.5 animate-spin" />}{t("中止任务并退出")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <Toaster theme={settings.theme} position="bottom-right" closeButton />
  </TooltipProvider>;
}

export default function App() {
  return <AppProvider><Shell /></AppProvider>; }
