import { useTranslation } from "@/hooks/use-translation";
import { useEffect, useState } from "react";
import { Box, LoaderCircle } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { commands } from "@/lib/commands";
import { errorMessage } from "@/lib/format";
import type { ModelInfo } from "@/lib/types";

export function ModelDetails({ name, onClose }: { name: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [info, setInfo] = useState<ModelInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!name) return;
    let stale = false;
    setInfo(null); setError(null);
    void commands.details(name).then((value) => { if (!stale) setInfo(value); }, (err) => { if (!stale) setError(errorMessage(err)); });
    return () => { stale = true; };
  }, [name]);
  const fields = info ? [
    [t("模型家族"), info.details?.families?.join(", ") || info.details?.family],
    [t("参数规模"), info.details?.parameter_size], [t("量化方式"), info.details?.quantization_level], [t("文件格式"), info.details?.format],
  ] : [];
  return <Sheet open={!!name} onOpenChange={(open) => { if (!open) onClose(); }}>
    <SheetContent className="overflow-y-auto sm:max-w-lg">
      <SheetHeader className="border-b p-6">
        <Box className="mb-3 size-6 text-primary" strokeWidth={1.5} />
        <SheetTitle className="break-all pr-4">{name}</SheetTitle>
        <SheetDescription>{t("模型详情")}</SheetDescription>
      </SheetHeader>
      <div className="space-y-6 p-6">
        {error ? <p role="alert" className="text-xs leading-6 text-destructive">{t(error)}</p> : !info ? <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />{t("正在读取模型信息…")}</div> : <>
          <dl className="space-y-5">{fields.map(([label, value]) => <div key={label} className="flex justify-between gap-6 text-sm"><dt className="shrink-0 text-muted-foreground">{label}</dt><dd className="break-all text-right">{value || "—"}</dd></div>)}</dl>
          {!!info.capabilities?.length && <div className="border-t pt-5"><p className="mb-3 text-xs font-semibold text-muted-foreground">{t("模型能力")}</p><div className="flex flex-wrap gap-2">{info.capabilities.map((item) => <Badge variant="secondary" key={item}>{item}</Badge>)}</div></div>}
          {info.parameters && <div className="border-t pt-5"><p className="mb-3 text-xs text-muted-foreground">{t("模型参数")}</p><pre className="mono whitespace-pre-wrap break-all rounded-lg bg-muted p-3 text-xs leading-6">{info.parameters}</pre></div>}
          {info.model_info && <details className="border-t pt-5"><summary className="cursor-pointer text-sm">{t("完整元数据")}</summary><pre className="mono mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-3 text-xs leading-6">{JSON.stringify(info.model_info, null, 2)}</pre></details>}
          {info.license && <details className="border-t pt-5"><summary className="cursor-pointer text-sm">{t("许可协议")}</summary><pre className="mt-3 whitespace-pre-wrap break-words text-xs leading-6 text-muted-foreground">{info.license}</pre></details>}
        </>}
      </div>
    </SheetContent>
  </Sheet>;
}
