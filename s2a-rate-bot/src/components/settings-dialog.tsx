"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Settings, X } from "lucide-react";
import { useState } from "react";
import { SettingsForm } from "./settings-form";

export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button type="button" aria-label="打开全局配置" title="全局配置" className="icon-button">
          <Settings className="size-4" aria-hidden="true" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-sm data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="dialog-content-motion fixed left-1/2 top-1/2 z-50 flex h-[min(760px,92dvh)] max-h-[92dvh] w-[min(96vw,960px)] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
          <SettingsDialogHeader />
          <SettingsForm presentation="dialog" onSaved={() => setOpen(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SettingsDialogHeader() {
  return (
    <div className="shrink-0 border-b border-border px-5 py-4 pr-16 sm:px-6">
      <Dialog.Title className="text-lg font-semibold tracking-tight">Global Settings</Dialog.Title>
      <Dialog.Description className="mt-1 text-sm text-muted">全局配置</Dialog.Description>
      <Dialog.Close aria-label="关闭全局配置" title="关闭" className="absolute right-3 top-3 flex size-11 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-muted hover:text-foreground">
        <X className="size-4" aria-hidden="true" />
      </Dialog.Close>
    </div>
  );
}
