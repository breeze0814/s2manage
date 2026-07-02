import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer relative inline-flex size-4 min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md border border-transparent bg-transparent text-primary-foreground shadow-none transition-colors before:absolute before:left-1/2 before:top-1/2 before:size-4 before:-translate-x-1/2 before:-translate-y-1/2 before:rounded before:border before:border-slate-400/70 before:bg-white/75 before:shadow-[inset_0_1px_0_hsl(0_0%_100%/0.58),0_1px_4px_hsl(217_34%_35%/0.12)] before:backdrop-blur-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/[0.18] focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[state=checked]:before:border-primary/60 data-[state=checked]:before:bg-primary disabled:cursor-not-allowed disabled:opacity-50 lg:min-h-4 lg:min-w-4 dark:before:border-white/35 dark:before:bg-white/[0.12]",
      className,
    )}
    data-motion="none"
    data-motion-hover="none"
    {...props}
  >
    <CheckboxPrimitive.Indicator className="relative z-10 flex items-center justify-center text-current">
      <Check className="size-3.5" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
