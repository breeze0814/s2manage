import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type MobileRecordProps = {
  children: ReactNode;
  className?: string;
};

type MobileRecordFieldProps = {
  label: ReactNode;
  value: ReactNode;
  className?: string;
};

function MobileRecordList({ children, className }: MobileRecordProps) {
  return <div className={cn("space-y-3 md:hidden", className)}>{children}</div>;
}

function MobileRecord({ children, className }: MobileRecordProps) {
  return (
    <div
      data-motion="card"
      data-motion-hover="lift"
      className={cn(
        "rounded-lg border border-white/[0.55] bg-white/[0.56] p-3 shadow-[inset_0_1px_0_hsl(0_0%_100%/0.36),0_14px_40px_hsl(217_34%_35%/0.11)] backdrop-blur-2xl dark:border-white/10 dark:bg-white/[0.08]",
        className,
      )}
    >
      {children}
    </div>
  );
}

function MobileRecordHeader({ children, className }: MobileRecordProps) {
  return <div className={cn("flex min-w-0 items-start justify-between gap-3", className)}>{children}</div>;
}

function MobileRecordTitle({ children, className }: MobileRecordProps) {
  return <div className={cn("min-w-0 font-medium leading-5", className)}>{children}</div>;
}

function MobileRecordMeta({ children, className }: MobileRecordProps) {
  return <div className={cn("mt-0.5 text-xs text-muted-foreground", className)}>{children}</div>;
}

function MobileRecordFields({ children, className }: MobileRecordProps) {
  return <div className={cn("mt-3 grid grid-cols-2 gap-2", className)}>{children}</div>;
}

function MobileRecordField({ label, value, className }: MobileRecordFieldProps) {
  return (
    <div className={cn("min-w-0 rounded-md border border-border/60 bg-white/[0.34] px-2.5 py-2 dark:bg-white/[0.04]", className)}>
      <div className="text-[11px] leading-4 text-muted-foreground">{label}</div>
      <div className="mt-1 min-w-0 text-sm leading-5">{value}</div>
    </div>
  );
}

function MobileRecordSection({ children, className }: MobileRecordProps) {
  return <div className={cn("mt-3 min-w-0 rounded-md border border-border/60 bg-white/[0.24] p-2.5 dark:bg-white/[0.03]", className)}>{children}</div>;
}

function MobileRecordActions({ children, className }: MobileRecordProps) {
  return <div className={cn("mt-3 flex flex-wrap gap-1.5", className)}>{children}</div>;
}

function MobileRecordEmpty({ children, className }: MobileRecordProps) {
  return (
    <div className={cn("rounded-lg border border-dashed border-border/70 px-3 py-8 text-center text-sm text-muted-foreground md:hidden", className)}>
      {children}
    </div>
  );
}

export {
  MobileRecord,
  MobileRecordActions,
  MobileRecordEmpty,
  MobileRecordField,
  MobileRecordFields,
  MobileRecordHeader,
  MobileRecordList,
  MobileRecordMeta,
  MobileRecordSection,
  MobileRecordTitle,
};
