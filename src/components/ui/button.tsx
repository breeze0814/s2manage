import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex h-9 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border px-3 text-sm font-medium shadow-[inset_0_1px_0_hsl(0_0%_100%/0.2),0_8px_22px_hsl(214_34%_24%/0.1)] backdrop-blur-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-45 dark:shadow-[inset_0_1px_0_hsl(0_0%_100%/0.07),0_10px_26px_hsl(214_55%_5%/0.28)] [&_svg]:size-4",
  {
    variants: {
      variant: {
        default:
          "border-primary/[0.45] bg-primary/90 text-primary-foreground shadow-[inset_0_1px_0_hsl(0_0%_100%/0.18),0_12px_26px_hsl(188_73%_45%/0.18)] hover:bg-primary hover:brightness-105",
        secondary:
          "border-border/70 bg-secondary/80 text-secondary-foreground hover:bg-accent/65 hover:text-accent-foreground dark:border-white/10 dark:bg-white/[0.08] dark:hover:bg-white/[0.12]",
        ghost:
          "border-transparent bg-transparent text-muted-foreground shadow-none hover:border-primary/25 hover:bg-primary/[0.12] hover:text-foreground dark:hover:border-primary/25 dark:hover:bg-primary/[0.1]",
        outline:
          "border-border/80 bg-secondary/[0.42] text-foreground hover:border-primary/30 hover:bg-accent/[0.42] dark:border-white/10 dark:bg-white/[0.05] dark:hover:border-primary/25 dark:hover:bg-primary/[0.1]",
        destructive:
          "border-destructive/35 bg-destructive/90 text-destructive-foreground hover:bg-destructive",
      },
      size: {
        default: "h-9 px-3",
        sm: "h-8 px-2.5 text-xs",
        icon: "h-9 w-9 px-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp data-motion="control" data-motion-hover="lift" className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
Button.displayName = "Button";

export { Button, buttonVariants };
