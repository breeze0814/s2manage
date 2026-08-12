"use client";

import { Code2, Settings2, X } from "lucide-react";
import { Button } from "../ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "../ui/dialog";
import { EmbedLinkPanel } from "./embed-link-panel";
import { TicketConfigPanel } from "./ticket-config-panel";

type Kind = "tickets" | "leaderboard" | "lottery" | "compensation";
const LABELS: Record<Kind, string> = {
  tickets: "工单",
  leaderboard: "排行榜",
  lottery: "抽奖",
  compensation: "订单补偿",
};

export function EmbedSettingsDialog({ kind, compact = false }: Readonly<{ kind: Kind; compact?: boolean }>) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" aria-label="嵌入设置" title="嵌入设置">
          <Settings2 className="size-4" />
          {compact ? <><span className="sr-only sm:not-sr-only">嵌入设置</span></> : "嵌入设置"}
        </Button>
      </DialogTrigger>
        <DialogContent className="flex max-h-[92dvh] w-[min(94vw,760px)] flex-col overflow-hidden">
          <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary-strong"><Code2 className="size-5" aria-hidden="true" /></span>
              <div><DialogTitle className="font-semibold">{LABELS[kind]}嵌入设置</DialogTitle><DialogDescription className="mt-1 text-sm leading-5 text-muted">配置 Sub2API iframe 地址与嵌入端行为</DialogDescription></div>
            </div>
            <DialogClose asChild><Button type="button" variant="secondary" size="icon-sm" aria-label="关闭嵌入设置" title="关闭"><X className="size-4" /></Button></DialogClose>
          </header>
          <div className="space-y-4 overflow-y-auto bg-background/60 p-4 sm:p-6">
            <EmbedLinkPanel kind={kind} />
            {kind === "tickets" ? <TicketConfigPanel /> : null}
          </div>
        </DialogContent>
    </Dialog>
  );
}
