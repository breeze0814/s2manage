import * as React from "react";
import { cn } from "@/lib/utils";

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(({ className, ...props }, ref) => (
  <div
    className="max-h-[70dvh] max-w-full overflow-auto rounded-lg border border-white/50 bg-white/[0.42] shadow-[inset_0_1px_0_hsl(0_0%_100%/0.28)] backdrop-blur-2xl outline-none [-webkit-overflow-scrolling:touch] [scrollbar-gutter:stable] focus-visible:ring-2 focus-visible:ring-ring/55 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:border-white/10 dark:bg-white/[0.06]"
    data-motion="table"
    role="region"
    aria-label="可横向滚动的数据表"
    tabIndex={0}
  >
    <table ref={ref} className={cn("w-full min-w-max caption-bottom text-xs sm:text-sm", className)} {...props} />
  </div>
));
Table.displayName = "Table";

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
));
TableBody.displayName = "TableBody";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(({ className, ...props }, ref) => (
  <tr ref={ref} data-motion="row" className={cn("border-b border-white/[0.35] transition-colors hover:bg-white/[0.38] dark:border-white/[0.08] dark:hover:bg-white/[0.08]", className)} {...props} />
));
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(({ className, ...props }, ref) => (
  <th ref={ref} className={cn("sticky top-0 z-10 h-9 whitespace-nowrap bg-white/[0.82] px-2.5 text-left align-middle text-xs font-medium text-muted-foreground shadow-[inset_0_-1px_0_hsl(var(--border)/0.72)] backdrop-blur-xl sm:h-10 sm:px-3 dark:bg-zinc-950/[0.86]", className)} {...props} />
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(({ className, ...props }, ref) => (
  <td ref={ref} className={cn("p-2.5 align-middle tabular-nums sm:p-3", className)} {...props} />
));
TableCell.displayName = "TableCell";

type TableEmptyRowProps = Omit<React.TdHTMLAttributes<HTMLTableCellElement>, "colSpan"> & {
  colSpan: number;
};

function TableEmptyRow({ colSpan, children, className, ...props }: TableEmptyRowProps) {
  return (
    <TableRow className="hover:bg-transparent dark:hover:bg-transparent">
      <TableCell colSpan={colSpan} className={cn("py-10 text-center text-sm text-muted-foreground", className)} {...props}>
        <div className="flex min-h-16 flex-col items-center justify-center gap-1">{children}</div>
      </TableCell>
    </TableRow>
  );
}

function TableActionHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <TableHead
      className={cn(
        "sticky right-0 z-20 bg-white/[0.9] shadow-[inset_1px_0_0_hsl(var(--border)/0.72),inset_0_-1px_0_hsl(var(--border)/0.72)] dark:bg-zinc-950/[0.92]",
        className,
      )}
      {...props}
    />
  );
}

function TableActionCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <TableCell
      className={cn(
        "sticky right-0 z-[5] bg-white/[0.78] shadow-[inset_1px_0_0_hsl(var(--border)/0.58)] backdrop-blur-xl dark:bg-zinc-950/[0.78]",
        className,
      )}
      {...props}
    />
  );
}

export { Table, TableActionCell, TableActionHead, TableBody, TableCell, TableEmptyRow, TableHead, TableHeader, TableRow };
