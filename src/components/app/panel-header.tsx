import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PanelHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

type PanelActionsProps = {
  children: ReactNode;
  className?: string;
};

function PanelActions({ children, className }: PanelActionsProps) {
  return (
    <div className={cn("grid w-full grid-cols-2 gap-2 lg:flex lg:w-auto lg:flex-wrap lg:items-center lg:justify-end [&>button]:min-w-0", className)}>
      {children}
    </div>
  );
}

function PanelHeader({ title, description, meta, actions, className }: PanelHeaderProps) {
  return (
    <div className={cn("glass-inset flex flex-col gap-3 rounded-lg px-3 py-3 sm:px-4 lg:flex-row lg:items-center lg:justify-between", className)}>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="truncate text-base font-semibold leading-6 sm:text-lg">{title}</h2>
          {meta ? <div className="shrink-0">{meta}</div> : null}
        </div>
        {description ? <p className="mt-1 max-w-3xl text-sm leading-5 text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="w-full lg:w-auto lg:shrink-0">{actions}</div> : null}
    </div>
  );
}

export { PanelActions, PanelHeader };
