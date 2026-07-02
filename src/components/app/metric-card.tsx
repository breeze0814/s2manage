import type { ComponentType, ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type MetricTone = "neutral" | "success" | "warning" | "danger" | "info";

type MetricCardProps = {
  title: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  tone?: MetricTone;
  className?: string;
};

const toneClasses: Record<MetricTone, string> = {
  neutral: "bg-muted/55 text-foreground",
  success: "bg-teal-500/10 text-teal-700 dark:text-teal-300",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  danger: "bg-destructive/10 text-destructive",
  info: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
};

function MetricCard({ title, value, detail, icon: Icon, tone = "neutral", className }: MetricCardProps) {
  return (
    <Card className={cn("h-full", className)}>
      <CardContent className="flex min-h-24 items-center gap-3 p-4">
        {Icon ? (
          <div className={cn("shrink-0 rounded-md p-2", toneClasses[tone])}>
            <Icon className="h-5 w-5" />
          </div>
        ) : null}
        <div className="min-w-0">
          <div className="text-sm text-muted-foreground">{title}</div>
          <div className="mt-1 truncate text-2xl font-semibold tabular-nums">{value}</div>
          {detail ? <div className="mt-1 min-w-0 truncate text-xs text-muted-foreground">{detail}</div> : null}
        </div>
      </CardContent>
    </Card>
  );
}

export { MetricCard, type MetricTone };
