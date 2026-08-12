"use client";

import { MoreHorizontal } from "lucide-react";
import * as React from "react";
import { cn } from "../../lib/utils";
import { Button } from "./button";

export function OverflowActions({ children, className }: Readonly<{ children: React.ReactNode; className?: string }>) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const closeWhenOutside = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeWhenOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeWhenOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>("button:not(:disabled), a[href]")?.focus();
  }, [open]);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <Button
        type="button"
        variant="secondary"
        size="icon"
        ref={triggerRef}
        aria-label="更多操作"
        title="更多操作"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal className="size-4" aria-hidden="true" />
      </Button>
      {open ? (
        <div ref={menuRef} role="menu" aria-label="更多操作" className="overflow-actions-menu">
          {React.Children.map(children, (child, index) => (
            <div key={index} role="none" onClick={() => { setOpen(false); triggerRef.current?.focus(); }}>{child}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function OverflowAction({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" role="menuitem" className={cn("overflow-action", className)} {...props} />;
}
