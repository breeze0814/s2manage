import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "../ui/button";

export function EmbedLoading({ label = "正在验证身份…" }: Readonly<{ label?: string }>) {
  return <div className="grid min-h-dvh place-items-center p-6"><div className="text-center text-sm text-muted"><Loader2 className="mx-auto mb-3 size-6 animate-spin text-primary" /><p>{label}</p></div></div>;
}

export function EmbedError({ message }: Readonly<{ message: string }>) {
  return <div className="grid min-h-dvh place-items-center p-6"><section role="alert" className="w-full max-w-md rounded-lg border border-danger/25 bg-danger/10 p-5 text-center"><AlertCircle className="mx-auto size-7 text-danger" /><h1 className="mt-3 font-semibold">无法打开嵌入页面</h1><p className="mt-2 break-words text-sm leading-6 text-muted">{message}</p></section></div>;
}

export function EmbedInlineError({ message, onRetry, retryLabel }: Readonly<{ message: string; onRetry: () => void; retryLabel: string }>) {
  return <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-danger/25 bg-danger/10 px-4 py-3 text-sm"><AlertCircle className="size-4 shrink-0 text-danger" /><p className="min-w-0 flex-1 break-words text-danger">{message}</p><Button type="button" variant="secondary" size="sm" className="shrink-0" onClick={onRetry}><RefreshCw className="size-4" />{retryLabel}</Button></div>;
}

export function EmbedHeader({ eyebrow, title, description }: Readonly<{ eyebrow: string; title: string; description: string }>) {
  return <header className="border-b border-border bg-surface/95 px-4 py-4 shadow-sm sm:py-5"><div className="mx-auto min-w-0 max-w-6xl"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-strong">{eyebrow}</p><h1 className="mt-1 min-w-0 text-xl font-semibold sm:text-2xl" style={{ overflowWrap: "anywhere" }}>{title}</h1><p className="mt-1 text-sm leading-5 text-muted" style={{ overflowWrap: "anywhere" }}>{description}</p></div></header>;
}
