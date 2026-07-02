import type { CSSProperties, ReactNode } from "react";
import { Search } from "lucide-react";
import { Input, type InputProps } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type FilterToolbarProps = {
  children: ReactNode;
  columns?: number;
  className?: string;
};

type FilterFieldProps = {
  label: ReactNode;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
};

type FilterSummaryProps = {
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
};

function FilterToolbar({ children, columns = 4, className }: FilterToolbarProps) {
  return (
    <div
      className={cn("grid gap-3 lg:grid-cols-[repeat(var(--filter-columns),minmax(0,1fr))]", className)}
      style={{ "--filter-columns": columns } as CSSProperties}
    >
      {children}
    </div>
  );
}

function FilterField({ label, children, className, htmlFor }: FilterFieldProps) {
  return (
    <div className={cn("min-w-0 space-y-2", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function FilterSearchField({ className, ...props }: InputProps) {
  return (
    <div className={cn("relative min-w-0", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input className="pl-9" {...props} />
    </div>
  );
}

function FilterSummary({ children, actions, className }: FilterSummaryProps) {
  return (
    <div className={cn("flex flex-col gap-3 rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-xs text-muted-foreground lg:flex-row lg:items-center lg:justify-between", className)}>
      <div className="min-w-0">{children}</div>
      {actions ? <div className="flex flex-wrap gap-2 lg:items-center [&>button]:flex-1 lg:[&>button]:flex-none">{actions}</div> : null}
    </div>
  );
}

export { FilterField, FilterSearchField, FilterSummary, FilterToolbar };
