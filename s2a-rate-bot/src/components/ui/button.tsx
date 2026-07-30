import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "../../lib/utils";

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border text-sm font-medium transition-[border-color,background-color,box-shadow,color,filter] duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "border-primary bg-primary font-semibold text-primary-foreground shadow-sm hover:brightness-95 hover:shadow-md active:brightness-90",
        secondary: "border-border-strong bg-surface text-foreground shadow-sm hover:border-primary/50 hover:bg-primary/5 hover:text-primary-strong active:bg-primary/10",
        outline: "border-border-strong bg-transparent text-foreground hover:bg-surface-muted",
        ghost: "border-transparent bg-transparent text-muted hover:bg-surface-muted hover:text-foreground",
        destructive: "border-danger bg-danger font-semibold text-white shadow-sm hover:brightness-95",
      },
      size: {
        default: "min-h-11 px-4",
        sm: "min-h-9 px-3",
        icon: "size-11 p-0",
        "icon-sm": "size-9 p-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  readonly asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Component = asChild ? Slot : "button";
    return <Component ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
  },
);
Button.displayName = "Button";
