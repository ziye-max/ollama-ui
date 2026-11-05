import { useTranslation } from "@/hooks/use-translation";
import { useEffect, useState } from "react";
import { CheckCircle2, LoaderCircle, Monitor, Moon, Sun } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/hooks/use-app";
import { commands, desktopAvailable } from "@/lib/commands";
import { errorMessage, isActive, validateEndpoint } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Settings as SettingsType, Theme } from "@/lib/types";
import { translate } from "@/lib/i18n";

export function Settings() {
  const { t } = useTranslation();
  const { settings, saveSettings, tasks } = useApp();
  const [draft, setDraft] = useState<SettingsType>(settings);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  useEffect(() => { setDraft(settings); }, [settings]);
  const active = tasks.some((task) => isActive(task.state));
  const test = async () => {
    setError(null); setTestResult(null); setTesting(true);
    try { const endpoint = validateEndpoint(draft.endpoint); const result = await commands.connection(endpoint); setTestResult(result.version); }
    catch (error) { setError(errorMessage(error)); }
    finally { setTesting(false); }
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(null); setSaving(true);
    try { await saveSettings({ ...draft, endpoint: validateEndpoint(draft.endpoint) }); setTestResult(null); toast.success(translate(draft.language, desktopAvailable ? "设置已保存" : "已更新预览主题，未写入磁盘")); }
    catch (error) { setError(errorMessage(error)); }
    finally { setSaving(false); }
  };
  return <form onSubmit={submit} className="max-w-2xl">
    <section className="border-b pb-8"><h2 className="text-sm font-semibold">{t("语言")}</h2><div className="mt-5 max-w-52"><Label htmlFor="language" className="mb-2 block text-xs">{t("界面语言")}</Label><Select value={draft.language} onValueChange={(language) => setDraft({ ...draft, language: language as SettingsType["language"] })}><SelectTrigger id="language" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="zh-CN"><span lang="zh-CN">简体中文</span></SelectItem><SelectItem value="en-US"><span lang="en-US">English</span></SelectItem></SelectContent></Select></div></section>
    <section className="border-b py-8"><h2 className="text-sm font-semibold">{t("服务连接")}</h2><div className="mt-5 space-y-2"><Label htmlFor="endpoint" className="text-sm">{t("服务地址")}</Label><div className="flex gap-2"><Input id="endpoint" className="mono h-10 flex-1" value={draft.endpoint} disabled={active} onChange={(event) => { setDraft({ ...draft, endpoint: event.target.value }); setError(null); setTestResult(null); }} autoComplete="off" spellCheck={false} /><Button type="button" variant="outline" disabled={testing || !desktopAvailable} onClick={() => void test()}>{testing && <LoaderCircle className="size-3.5 animate-spin" />}{t("测试连接")}</Button></div>{active && <p className="text-xs leading-5 text-muted-foreground">{t("有活动下载任务，暂时不能更改服务地址。")}</p>}{testResult && <p role="status" className="flex items-center gap-2 text-sm text-primary"><CheckCircle2 className="size-3.5" />{t("连接成功 · Ollama {v0}", { v0: testResult })}</p>}</div></section>
    <section className="border-b py-8"><h2 className="text-sm font-semibold">{t("外观")}</h2><div className="mt-5 grid max-w-md grid-cols-3 gap-3">{([{ value: "light", label: t("浅色"), Icon: Sun }, { value: "dark", label: t("深色"), Icon: Moon }, { value: "system", label: t("跟随系统"), Icon: Monitor }] as { value: Theme; label: string; Icon: typeof Sun }[]).map(({ value, label, Icon }) => <button type="button" key={value} aria-pressed={draft.theme === value} onClick={() => setDraft({ ...draft, theme: value })} className={`flex flex-col items-center gap-3 rounded-lg border px-3 py-5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-ring ${draft.theme === value ? "border-primary bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted/50"}`}><Icon className="size-5" strokeWidth={1.5} />{label}</button>)}</div></section>
    <section className="border-b py-8"><h2 className="text-sm font-semibold">{t("模型驻留")}</h2><div className="mt-5 max-w-52"><Label htmlFor="keep-alive" className="mb-2 block text-xs">{t("默认驻留时间")}</Label><Select value={String(draft.keepAliveMinutes)} onValueChange={(value) => setDraft({ ...draft, keepAliveMinutes: Number(value) })}><SelectTrigger id="keep-alive" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="5">{t("5 分钟")}</SelectItem><SelectItem value="15">{t("15 分钟")}</SelectItem><SelectItem value="30">{t("30 分钟")}</SelectItem></SelectContent></Select></div></section>
    {error && <p role="alert" className="mt-5 text-xs leading-6 text-destructive">{t(error)}</p>}
    <div className="flex items-center justify-between py-6"><span className="text-xs text-muted-foreground">{t("ollama ui · v0.1.0")}</span><Button type="submit" disabled={saving || JSON.stringify(draft) === JSON.stringify(settings)}>{saving && <LoaderCircle className="size-3.5 animate-spin" />}{t("保存设置")}</Button></div>
  </form>;
}
