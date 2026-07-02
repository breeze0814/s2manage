import * as React from "react";
import { cn } from "@/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => (
  <textarea
    className={cn(
      "flex min-h-24 w-full rounded-lg border border-white/[0.45] bg-white/[0.42] px-3 py-2.5 text-sm leading-5 shadow-[inset_0_1px_0_hsl(0_0%_100%/0.24)] backdrop-blur-xl transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/[0.18] focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.07]",
      className,
    )}
    ref={ref}
    data-motion="control"
    {...props}
  />
));
Textarea.displayName = "Textarea";

export { Textarea };
