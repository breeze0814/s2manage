import * as React from "react";
import { cn } from "@/lib/utils";

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-lg border border-border/70 bg-white/[0.72] text-card-foreground shadow-[inset_0_1px_0_hsl(0_0%_100%/0.32),0_16px_46px_hsl(214_34%_24%/0.12)] backdrop-blur-2xl dark:border-white/10 dark:bg-secondary/[0.72] dark:shadow-[inset_0_1px_0_hsl(0_0%_100%/0.06),0_18px_56px_hsl(214_55%_5%/0.3)]",
      className,
    )}
    data-motion="card"
    data-motion-hover="lift"
    {...props}
  />
));
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex flex-col gap-1.5 p-4 pb-3 sm:p-5 sm:pb-4", className)} {...props} />
));
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(({ className, ...props }, ref) => (
  <h3 ref={ref} className={cn("text-[15px] font-semibold leading-none", className)} {...props} />
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-4 pt-0 sm:p-5 sm:pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

export { Card, CardContent, CardHeader, CardTitle, CardDescription };
