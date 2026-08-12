import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "./button";

export function DataLoadError({ message, onRetry, pending = false, className }: Readonly<{
  message: string;
  onRetry: () => void;
  pending?: boolean;
  className?: string;
}>) {
  return <div role="alert" className={cn("flex flex-wrap items-center gap-3 rounded-lg border border-danger/25 bg-danger/10 px-4 py-3 text-sm", className)}>
    <AlertCircle className="size-4 shrink-0 text-danger" aria-hidden="true" />
    <p className="min-w-0 flex-1 break-words text-danger">{message}</p>
    <Button type="button" variant="secondary" size="sm" className="shrink-0" disabled={pending} onClick={onRetry}>
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
      重试
    </Button>
  </div>;
}
