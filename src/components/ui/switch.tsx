import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer relative inline-flex h-5 min-h-11 w-9 min-w-11 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-transparent p-0 shadow-none transition-colors before:absolute before:left-1/2 before:top-1/2 before:h-5 before:w-9 before:-translate-x-1/2 before:-translate-y-1/2 before:rounded-full before:border before:border-white/[0.45] before:bg-white/[0.38] before:shadow-[inset_0_1px_0_hsl(0_0%_100%/0.24)] before:backdrop-blur-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/[0.18] focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[state=checked]:before:border-primary/50 data-[state=checked]:before:bg-primary disabled:cursor-not-allowed disabled:opacity-50 lg:min-h-5 lg:min-w-9 dark:before:border-white/10 dark:before:bg-white/[0.08]",
      className,
    )}
    data-motion="control"
    data-motion-hover="scale"
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb className="pointer-events-none absolute left-1/2 top-1/2 block size-4 -translate-y-1/2 rounded-full bg-white shadow-[0_2px_8px_hsl(217_34%_35%/0.18)] transition-transform data-[state=checked]:translate-x-[1px] data-[state=checked]:bg-primary-foreground data-[state=unchecked]:-translate-x-[17px] dark:bg-foreground" />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
