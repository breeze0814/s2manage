"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { AlertTriangle } from "lucide-react";

export function ConfirmAlert(props: Readonly<{
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}>) {
  return (
    <AlertDialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-sm data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <AlertDialog.Content className="dialog-content-motion fixed left-1/2 top-1/2 z-50 w-[min(92vw,440px)] rounded-2xl border border-border bg-surface p-5 shadow-2xl sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"><AlertTriangle className="size-5" /></span>
            <div><AlertDialog.Title className="font-semibold">{props.title}</AlertDialog.Title><AlertDialog.Description className="mt-1 text-sm leading-6 text-muted">{props.description}</AlertDialog.Description></div>
          </div>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Cancel className="secondary-button">取消</AlertDialog.Cancel>
            <AlertDialog.Action onClick={props.onConfirm} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-red-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-red-700">{props.confirmLabel}</AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
