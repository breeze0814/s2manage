"use client";

import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";

export type SelectOption = {
  readonly value: string;
  readonly label: string;
};

export function Select({ value, options, ariaLabel, disabled = false, triggerIcon, onValueChange }: Readonly<{
  value: string;
  options: readonly SelectOption[];
  ariaLabel: string;
  disabled?: boolean;
  triggerIcon?: React.ReactNode;
  onValueChange: (value: string) => void;
}>) {
  return (
    <SelectPrimitive.Root value={value} disabled={disabled} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger
        aria-label={ariaLabel}
        title={ariaLabel}
        className={triggerIcon
          ? "compact-icon-button"
          : "form-control flex min-w-0 items-center justify-between gap-2 overflow-hidden text-left [&>span:first-child]:truncate"}
      >
        {triggerIcon ?? <SelectPrimitive.Value />}
        {triggerIcon ? <span className="sr-only"><SelectPrimitive.Value /></span> : <SelectPrimitive.Icon><ChevronDown className="size-4 text-muted" /></SelectPrimitive.Icon>}
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content position="popper" sideOffset={6} className="z-[70] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-xl">
          <SelectPrimitive.Viewport>
            {options.map((option) => <SelectItem key={option.value} option={option} />)}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

function SelectItem({ option }: Readonly<{ option: SelectOption }>) {
  return (
    <SelectPrimitive.Item value={option.value} className="relative flex min-h-10 cursor-pointer select-none items-center rounded-lg py-2 pl-9 pr-3 text-sm outline-none data-[highlighted]:bg-surface-muted data-[state=checked]:font-medium">
      <span className="absolute left-3 flex size-4 items-center justify-center">
        <SelectPrimitive.ItemIndicator><Check className="size-4 text-primary-strong" /></SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}
