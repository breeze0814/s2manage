import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex h-6 items-center rounded-md border px-2 text-xs font-medium shadow-[inset_0_1px_0_hsl(0_0%_100%/0.18)] backdrop-blur-xl transition-colors",
  {
    variants: {
      variant: {
        default: "border-primary/[0.28] bg-primary/[0.14] text-teal-700 dark:text-teal-200",
        secondary: "border-border/70 bg-secondary/75 text-secondary-foreground dark:border-white/10 dark:bg-white/[0.08]",
        outline: "border-border/75 bg-secondary/[0.42] text-foreground dark:border-white/10 dark:bg-white/[0.05]",
        destructive: "border-red-400/[0.24] bg-red-400/[0.12] text-red-700 dark:text-red-300",
        success: "border-teal-400/[0.24] bg-teal-400/[0.12] text-teal-700 dark:text-teal-300",
        warning: "border-amber-400/[0.24] bg-amber-400/[0.12] text-amber-700 dark:text-amber-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div data-motion="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
