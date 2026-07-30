"use client";

import { Settings, X } from "lucide-react";
import { useState } from "react";
import { SettingsForm } from "./settings-form";
import { Button } from "./ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "./ui/dialog";

export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" size="icon" aria-label="打开全局配置" title="全局配置">
          <Settings className="size-4" aria-hidden="true" />
        </Button>
      </DialogTrigger>
        <DialogContent className="flex h-[min(760px,92dvh)] max-h-[92dvh] w-[min(96vw,960px)] flex-col overflow-hidden 2xl:h-[min(820px,92dvh)] 2xl:w-[min(96vw,1080px)]">
          <SettingsDialogHeader />
          <SettingsForm presentation="dialog" onSaved={() => setOpen(false)} />
        </DialogContent>
    </Dialog>
  );
}

function SettingsDialogHeader() {
  return (
    <div className="shrink-0 border-b border-border bg-surface-muted/25 px-5 py-4 pr-16 sm:px-6">
      <DialogTitle className="text-lg font-semibold">全局配置</DialogTitle>
      <DialogDescription className="mt-1 text-sm text-muted">目标站、任务与通知设置</DialogDescription>
      <DialogClose asChild><Button type="button" variant="ghost" size="icon" aria-label="关闭全局配置" title="关闭" className="absolute right-3 top-3">
        <X className="size-4" aria-hidden="true" />
      </Button></DialogClose>
    </div>
  );
}
