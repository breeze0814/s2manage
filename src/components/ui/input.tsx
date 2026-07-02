import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, inputMode, type, ...props }, ref) => {
  const resolvedInputMode = inputMode ?? (type === "number" ? "decimal" : undefined);

  return (
    <input
      type={type}
      inputMode={resolvedInputMode}
      className={cn(
        "flex min-h-11 w-full rounded-lg border border-white/[0.45] bg-white/[0.42] px-3 py-2 text-sm shadow-[inset_0_1px_0_hsl(0_0%_100%/0.24)] backdrop-blur-xl transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/[0.18] disabled:cursor-not-allowed disabled:opacity-50 lg:min-h-9 lg:py-1 dark:border-white/10 dark:bg-white/[0.07]",
        className,
      )}
      ref={ref}
      data-motion="control"
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
