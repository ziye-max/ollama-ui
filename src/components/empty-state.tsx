import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({ icon: Icon, title, action }: { icon: LucideIcon; title: string; action?: ReactNode }) {
  return <div className="flex min-h-72 flex-col items-center justify-center px-8 py-14 text-center">
    <div className="mb-5 flex size-12 items-center justify-center rounded-xl border bg-muted/50"><Icon className="size-5 text-muted-foreground" strokeWidth={1.5} /></div>
    <h2 className="text-sm font-semibold">{title}</h2>
    {action && <div className="mt-5">{action}</div>}
  </div>;
}
