import type { ReactNode } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type LoadingStateProps = {
  label?: ReactNode;
  className?: string;
};

type EmptyStateProps = {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  children?: ReactNode;
};

type ErrorStateProps = {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
};

type InlineErrorProps = {
  children: ReactNode;
  className?: string;
};

function LoadingState({ label = "加载中...", className }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("glass-inset flex min-h-24 items-center justify-center gap-2 rounded-lg px-4 py-6 text-sm text-muted-foreground", className)}
    >
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

function EmptyState({ title, description, action, children, className }: EmptyStateProps) {
  return (
    <div className={cn("rounded-lg border border-dashed border-border/70 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground", className)}>
      {children ?? (
        <>
          {title ? <div className="font-medium text-foreground">{title}</div> : null}
          {description ? <p className="mx-auto mt-1 max-w-xl leading-6">{description}</p> : null}
          {action ? <div className="mt-4 flex justify-center [&>button]:w-full lg:[&>button]:w-auto">{action}</div> : null}
        </>
      )}
    </div>
  );
}

function ErrorState({ title, description, action, className }: ErrorStateProps) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn("rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-5 text-sm text-destructive", className)}
    >
      <div className="flex min-w-0 items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0">
          <div className="font-medium">{title}</div>
          {description ? <p className="mt-1 break-words leading-6 text-destructive/85">{description}</p> : null}
          {action ? <div className="mt-4 flex flex-wrap gap-2">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}

function InlineError({ children, className }: InlineErrorProps) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn("flex min-w-0 items-start gap-2 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive", className)}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 break-words leading-6">{children}</div>
    </div>
  );
}

export { EmptyState, ErrorState, InlineError, LoadingState };
