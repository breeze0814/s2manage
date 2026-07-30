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
        <AlertDialog.Overlay className="dialog-overlay" />
        <AlertDialog.Content className="dialog-content-motion dialog-surface fixed left-1/2 top-1/2 z-50 w-[min(92vw,440px)] p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-danger/10 text-danger">
              <AlertTriangle className="size-5" />
            </span>
            <div>
              <AlertDialog.Title className="font-semibold">{props.title}</AlertDialog.Title>
              <AlertDialog.Description className="mt-1.5 text-sm leading-6 text-muted">{props.description}</AlertDialog.Description>
            </div>
          </div>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Cancel className="secondary-button">取消</AlertDialog.Cancel>
            <AlertDialog.Action
              onClick={props.onConfirm}
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-danger px-4 text-sm font-semibold text-white shadow-sm transition-[filter,box-shadow] duration-200 hover:brightness-95 active:brightness-90"
            >
              {props.confirmLabel}
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
