import * as React from "react";
import { cn } from "../../lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input type={type} ref={ref} className={cn("flex min-h-10 w-full rounded-lg border border-border-strong bg-surface px-3 text-base text-foreground outline-none transition-[border-color,box-shadow,background-color] duration-200 placeholder:text-muted/80 focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted sm:text-sm", className)} {...props} />
  ),
);
Input.displayName = "Input";
