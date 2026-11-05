import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { commands, desktopAvailable } from "@/lib/commands";
import { errorDetail, errorMessage, mergeTask } from "@/lib/format";
import { translate } from "@/lib/i18n";
import type { Connection, DownloadTask, LocalModel, RunningModel, Settings } from "@/lib/types";

const defaults: Settings = { endpoint: "http://127.0.0.1:11434", theme: "light", language: "zh-CN", keepAliveMinutes: 5 };

function useAppState() {
  const [settings, setSettings] = useState<Settings>(defaults);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [ready, setReady] = useState(!desktopAvailable);
  const [connection, setConnection] = useState<Connection>({ state: desktopAvailable ? "checking" : "offline", error: desktopAvailable ? undefined : "浏览器预览无法连接本机服务，请使用桌面应用。" });
  const [models, setModels] = useState<LocalModel[]>([]);
  const [running, setRunning] = useState<RunningModel[]>([]);
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [runningError, setRunningError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [pending, setPending] = useState<Record<string, string>>({});
  const refreshLock = useRef(false);
  const runningLock = useRef(false);
  const connectionRef = useRef(connection);
  connectionRef.current = connection;

  const refresh = useCallback(async () => {
    if (!desktopAvailable || refreshLock.current) return;
    refreshLock.current = true;
    setRefreshing(true);
    const endpoint = settingsRef.current.endpoint;
    try {
      const version = await commands.connection(endpoint);
      if (endpoint !== settingsRef.current.endpoint) return;
      setConnection({ state: "online", version: version.version });
      const [local, active] = await Promise.allSettled([commands.models(), commands.running()]);
      if (endpoint !== settingsRef.current.endpoint) return;
      if (local.status === "fulfilled") { setModels(local.value); setListError(null); } else setListError(errorMessage(local.reason));
      if (active.status === "fulfilled") { setRunning(active.value); setRunningError(null); } else setRunningError(errorMessage(active.reason));
      if (local.status === "fulfilled" && active.status === "fulfilled") setUpdatedAt(Date.now());
    } catch (error) {
      if (endpoint === settingsRef.current.endpoint) setConnection({ state: "offline", error: errorMessage(error), detail: errorDetail(error) });
    } finally {
      refreshLock.current = false;
      setRefreshing(false);
    }
  }, []);

  const refreshRunning = useCallback(async () => {
    if (!desktopAvailable || runningLock.current || refreshLock.current) return;
    if (connectionRef.current.state !== "online") { await refresh(); return; }
    runningLock.current = true;
    try { setRunning(await commands.running()); setRunningError(null); }
    catch (error) { setRunningError(errorMessage(error)); await refresh(); }
    finally { runningLock.current = false; }
  }, [refresh]);

  const refreshTasks = useCallback(async () => {
    if (!desktopAvailable) return;
    const endpoint = settingsRef.current.endpoint;
    const startedAt = Date.now();
    try {
      const incoming = await commands.downloads();
      if (endpoint !== settingsRef.current.endpoint) return;
      setTasks((old) => {
        const recent = old.filter((task) => task.endpoint === endpoint && task.updatedAt >= startedAt && !incoming.some((item) => item.taskId === task.taskId));
        return incoming.reduce((result, task) => {
          const previous = old.find((item) => item.taskId === task.taskId);
          return mergeTask(result, previous && previous.sequence > task.sequence ? previous : task);
        }, recent);
      });
      setDownloadError(null);
    }
    catch (error) { setDownloadError(errorMessage(error)); }
  }, []);

  useEffect(() => {
    if (!desktopAvailable) return;
    let disposed = false;
    let channel: Awaited<ReturnType<typeof commands.subscribe>> | undefined;
    void (async () => {
      try {
        const initial = { ...defaults, ...await commands.settings() };
        if (disposed) return;
        settingsRef.current = initial;
        setSettings(initial);
        channel = await commands.subscribe((task) => {
          if (disposed || task.endpoint !== settingsRef.current.endpoint) return;
          setTasks((previous) => mergeTask(previous, task));
          if (task.state === "completed") { toast.success(translate(settingsRef.current.language, "{name} 下载完成", { name: task.modelName })); void refresh(); }
        });
        await refreshTasks();
      } catch (error) { if (!disposed) toast.error(translate(settingsRef.current.language, errorMessage(error))); }
      finally { if (!disposed) { setReady(true); void refresh(); } }
    })();
    return () => { disposed = true; if (channel) channel.onmessage = () => {}; };
  }, [refresh, refreshTasks]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => document.documentElement.classList.toggle("dark", settings.theme === "dark" || (settings.theme === "system" && query.matches));
    apply(); query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [settings.theme]);

  useEffect(() => {
    document.documentElement.lang = settings.language;
    document.title = translate(settings.language, "ollama ui");
  }, [settings.language]);

  useEffect(() => {
    if (!ready || !desktopAvailable) return;
    let timer: ReturnType<typeof setTimeout>;
    let disposed = false;
    const poll = async () => {
      if (document.visibilityState === "visible" && document.hasFocus()) { await refreshRunning(); await refreshTasks(); }
      if (!disposed) timer = setTimeout(poll, connectionRef.current.state === "online" ? 3000 : 10000);
    };
    const wake = () => { if (document.visibilityState === "visible") { void refresh(); void refreshTasks(); } };
    timer = setTimeout(poll, 3000);
    window.addEventListener("focus", wake); document.addEventListener("visibilitychange", wake);
    return () => { disposed = true; clearTimeout(timer); window.removeEventListener("focus", wake); document.removeEventListener("visibilitychange", wake); };
  }, [ready, refresh, refreshRunning, refreshTasks]);

  const mutate = async (name: string, action: "load" | "unload" | "delete") => {
    if (pending[name]) return;
    const labels = { load: "加载中", unload: "卸载中", delete: "删除中" };
    setPending((old) => ({ ...old, [name]: labels[action] }));
    try {
      await commands[action](name);
      await refresh();
      if (action !== "delete") {
        const actual = await commands.running();
        setRunning(actual);
        const found = actual.some((model) => model.name === name || model.model === name);
        if ((action === "load" && !found) || (action === "unload" && found)) throw new Error("请求已发送，但模型状态尚未确认，请刷新列表检查。");
      }
      const result = { load: "{name} 已加载", unload: "{name} 已卸载", delete: "{name} 已删除" };
      toast.success(translate(settingsRef.current.language, result[action], { name }));
    } catch (error) { toast.error(translate(settingsRef.current.language, errorMessage(error)), { description: errorDetail(error) }); }
    finally { setPending((old) => { const next = { ...old }; delete next[name]; return next; }); }
  };

  const saveSettings = async (next: Settings) => {
    if (desktopAvailable) {
      const saved = await commands.saveSettings(next);
      if (saved.endpoint !== settings.endpoint) { setModels([]); setRunning([]); setTasks([]); setUpdatedAt(null); setConnection({ state: "checking" }); }
      settingsRef.current = saved;
      setSettings(saved);
      await refreshTasks();
      await refresh();
    } else { setSettings(next); }
  };

  return { settings, ready, connection, models, running, tasks, refreshing, listError, runningError, downloadError, updatedAt, pending, refresh, refreshTasks, mutate, saveSettings };
}

type AppContextValue = ReturnType<typeof useAppState>;
const AppContext = createContext<AppContextValue | null>(null);
export function AppProvider({ children }: { children: ReactNode }) { const state = useAppState(); return <AppContext.Provider value={state}>{children}</AppContext.Provider>; }
export function useApp() { const state = useContext(AppContext); if (!state) throw new Error("AppProvider is missing"); return state; }
