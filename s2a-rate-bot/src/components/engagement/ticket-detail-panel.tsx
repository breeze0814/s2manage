"use client";

import { ImageIcon, Loader2, Send, UserRound } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";
import type { TicketDetail, TicketStatus } from "../../server/embeds/types";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Select } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { requestJson } from "./api";

const STATUS_LABELS: Record<TicketStatus, string> = { open: "待处理", pending: "待跟进", replied: "已回复", closed: "已关闭" };
const STATUS_OPTIONS = Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }));

export function TicketDetailPanel({ ticket, onChange }: Readonly<{ ticket: TicketDetail; onChange: (ticket: TicketDetail) => void }>) {
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const send = () => void reply({ ticket, body, setBody, setSaving, onChange });
  const changeStatus = (status: TicketStatus) => void updateStatus(ticket.id, status, setSaving, onChange);
  return (
    <aside className="overflow-hidden border-t border-border bg-surface xl:sticky xl:top-24 xl:border-l xl:border-t-0">
      <div className="panel-header">
        <div className="min-w-0"><h2 className="panel-title break-words">{ticket.title}</h2><p className="panel-description">{ticket.category} · {ticket.priority}</p></div>
        <div className="w-full sm:w-36"><Select ariaLabel="工单状态" value={ticket.status} options={STATUS_OPTIONS} disabled={saving}
          onValueChange={(value) => changeStatus(value as TicketStatus)} /></div>
      </div>
      <div className="border-b border-border bg-surface-muted/60 p-4 text-sm">
        <div className="flex items-start gap-3"><UserRound className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
          <dl className="min-w-0 space-y-1"><div><dt className="inline text-muted">联系邮箱：</dt><dd className="inline break-all">{ticket.manualEmail}</dd></div>
            <div><dt className="inline text-muted">Sub2API：</dt><dd className="inline break-all">{ticket.sub2apiEmail || ticket.sub2apiUserId}</dd></div>
            <div><dt className="inline text-muted">来源：</dt><dd className="inline break-all">{ticket.srcHost}</dd></div></dl>
        </div>
      </div>
      <ol className="max-h-[32rem] space-y-3 overflow-y-auto p-4" aria-label="工单消息">
        {ticket.messages.map((message) => (
          <li key={message.id} className={`rounded-lg border p-3 ${message.authorType === "admin" ? "ml-4 border-primary/25 bg-primary/[0.06]" : "mr-4 border-border bg-surface-muted"}`}>
            <div className="flex items-center justify-between gap-3 text-xs"><span className="font-semibold">{message.authorName || (message.authorType === "admin" ? "管理员" : "用户")}</span><time className="text-muted">{formatDate(message.createdAt)}</time></div>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{message.body}</p>
            {message.attachments.length ? <AttachmentGrid attachments={message.attachments} /> : null}
          </li>
        ))}
      </ol>
      <div className="border-t border-border p-4">
        <Label htmlFor="admin-ticket-reply" className="mb-1.5 block">客服回复</Label>
        <Textarea id="admin-ticket-reply" className="min-h-24 resize-y" value={body} disabled={ticket.status === "closed" || saving} onChange={(event) => setBody(event.target.value)} />
        <Button type="button" className="mt-3 w-full" disabled={!body.trim() || ticket.status === "closed" || saving} onClick={send}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}发送回复
        </Button>
      </div>
    </aside>
  );
}

function AttachmentGrid({ attachments }: Readonly<{ attachments: TicketDetail["messages"][number]["attachments"] }>) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {attachments.map((file) => <a key={file.id} href={`/api/tickets/attachments/${file.id}`} target="_blank" rel="noreferrer" className="group relative aspect-square overflow-hidden rounded-md border border-border bg-surface">
        <Image fill unoptimized sizes="160px" src={`/api/tickets/attachments/${file.id}`} alt={file.originalName} className="object-cover transition-transform duration-200 group-hover:scale-105" />
        <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-black/65 px-2 py-1 text-[11px] text-white"><ImageIcon className="size-3" />{file.originalName}</span>
      </a>)}
    </div>
  );
}

async function reply(input: Readonly<{ ticket: TicketDetail; body: string; setBody: (value: string) => void; setSaving: (value: boolean) => void; onChange: (ticket: TicketDetail) => void }>) {
  input.setSaving(true);
  try {
    const ticket = await requestJson<TicketDetail>(`/api/tickets/${input.ticket.id}/messages`, { method: "POST", body: JSON.stringify({ body: input.body }) });
    input.onChange(ticket); input.setBody(""); toast.success("回复已发送");
  } catch (error) { toast.error(error instanceof Error ? error.message : String(error)); }
  finally { input.setSaving(false); }
}

async function updateStatus(id: string, status: TicketStatus, setSaving: (value: boolean) => void, onChange: (ticket: TicketDetail) => void) {
  setSaving(true);
  try { onChange(await requestJson<TicketDetail>(`/api/tickets/${id}`, { method: "PATCH", body: JSON.stringify({ status }) })); toast.success("工单状态已更新"); }
  catch (error) { toast.error(error instanceof Error ? error.message : String(error)); }
  finally { setSaving(false); }
}

function formatDate(value: string) { return new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
