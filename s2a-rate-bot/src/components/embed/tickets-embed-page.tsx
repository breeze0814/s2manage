"use client";

import { ArrowLeft, ImageOff, ImagePlus, Inbox, Loader2, MessageSquarePlus, Send, X } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import type { Ticket, TicketDetail, TicketEmbedSettings } from "../../server/embeds/types";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { EmbedError, EmbedHeader, EmbedInlineError, EmbedLoading } from "./embed-state";
import { embedRequestJson, useEmbedSession } from "./use-embed-session";

export function TicketsEmbedPage() {
  const auth = useEmbedSession("tickets");
  const [items, setItems] = useState<readonly Ticket[]>([]);
  const [selected, setSelected] = useState<TicketDetail | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    if (!auth.session) return;
    setLoading(true); setError("");
    try { setItems((await embedRequestJson<{ items: Ticket[] }>("/api/embed/tickets", auth.session.token)).items); }
    catch (reason) { setError(message(reason)); }
    finally { setLoading(false); }
  }, [auth.session]);
  useEffect(() => { void load(); }, [load]);
  if (auth.loading) return <EmbedLoading />;
  if (auth.error || !auth.session) return <EmbedError message={auth.error || "嵌入会话不可用"} />;
  const settings = auth.session.settings as TicketEmbedSettings;
  return (
    <div className={`min-h-dvh ${settings.template === "minimal" ? "bg-surface" : "bg-background"}`}>
      <EmbedHeader eyebrow="Support Center" title="帮助与工单" description="提交问题、查看处理进度并与客服继续沟通" />
      <div className="mx-auto max-w-6xl p-4 sm:p-6">
        {error ? <div className="mb-4"><EmbedInlineError message={error} onRetry={() => void load()} retryLabel="重新读取工单" /></div> : null}
        {creating ? <CreateTicket settings={settings} token={auth.session.token} onCancel={() => setCreating(false)} onCreated={(ticket) => { setCreating(false); setSelected(ticket); void load(); }} />
          : selected ? <TicketConversation ticket={selected} token={auth.session.token} onBack={() => { setSelected(null); void load(); }} onChange={setSelected} />
            : <TicketList items={items} loading={loading} onCreate={() => setCreating(true)} onSelect={(id) => void openTicket(id, auth.session!.token, setSelected, setError)} />}
      </div>
    </div>
  );
}

function TicketList({ items, loading, onCreate, onSelect }: Readonly<{ items: readonly Ticket[]; loading: boolean; onCreate: () => void; onSelect: (id: string) => void }>) {
  return <section className="rounded-lg border border-border bg-surface shadow-panel">
    <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">我的工单</h2><p className="mt-1 text-sm text-muted">共 {items.length} 条记录</p></div><Button type="button" onClick={onCreate}><MessageSquarePlus className="size-4" />新建工单</Button></div>
    {loading ? <div className="loading-state m-4"><Loader2 className="size-4 animate-spin" />读取工单…</div> : !items.length ? <div className="empty-state m-4"><Inbox className="size-7" /><span>还没有工单，遇到问题可以立即提交</span><Button type="button" variant="secondary" onClick={onCreate}>创建第一张工单</Button></div>
      : <ul className="divide-y divide-border">{items.map((ticket) => <li key={ticket.id}><Button type="button" variant="ghost" className="h-auto min-h-20 w-full justify-between rounded-none px-4 py-3 text-left" onClick={() => onSelect(ticket.id)}><span className="min-w-0"><span className="block truncate font-medium">{ticket.title}</span><span className="mt-1 block text-xs text-muted">{ticket.category} · {ticket.priority} · {formatDate(ticket.lastMessageAt)}</span></span><Status status={ticket.status} /></Button></li>)}</ul>}
  </section>;
}

function CreateTicket({ settings, token, onCancel, onCreated }: Readonly<{ settings: TicketEmbedSettings; token: string; onCancel: () => void; onCreated: (ticket: TicketDetail) => void }>) {
  const [values, setValues] = useState({ manualEmail: "", title: "", body: "", category: settings.categoryOptions[0] ?? "", priority: settings.priorityOptions[0] ?? "" });
  const [files, setFiles] = useState<File[]>([]); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const submit = () => void createTicket({ values, files, token, setSaving, setError, onCreated });
  return <section className="rounded-lg border border-border bg-surface shadow-panel"><div className="flex items-center justify-between border-b border-border p-4"><div><h2 className="font-semibold">新建工单</h2><p className="mt-1 text-sm text-muted">请尽量完整描述问题和复现方式</p></div><Button type="button" variant="secondary" size="icon" aria-label="取消新建" onClick={onCancel}><X className="size-4" /></Button></div>
    <div className="grid gap-4 p-4 sm:p-5"><Field label="联系邮箱"><Input type="email" value={values.manualEmail} onChange={(event) => setValues({ ...values, manualEmail: event.target.value })} /></Field><Field label="标题"><Input value={values.title} onChange={(event) => setValues({ ...values, title: event.target.value })} /></Field>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="问题分类"><Select ariaLabel="问题分类" value={values.category} options={settings.categoryOptions.map(option)} onValueChange={(category) => setValues({ ...values, category })} /></Field><Field label="优先级"><Select ariaLabel="优先级" value={values.priority} options={settings.priorityOptions.map(option)} onValueChange={(priority) => setValues({ ...values, priority })} /></Field></div>
      <Field label="问题描述"><Textarea className="min-h-36 resize-y" value={values.body} onChange={(event) => setValues({ ...values, body: event.target.value })} /></Field>
      {settings.maxImagesPerTicket > 0 ? <Label className="flex min-h-20 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong bg-surface-muted text-sm text-muted hover:border-primary/50 hover:text-primary-strong"><ImagePlus className="size-5" />选择图片（最多 {settings.maxImagesPerTicket} 张，每张 2 MB）<Input className="sr-only" type="file" multiple accept="image/png,image/jpeg,image/gif,image/webp" onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, settings.maxImagesPerTicket))} /></Label> : null}
      {files.length ? <ul className="flex flex-wrap gap-2 text-xs text-muted">{files.map((file) => <li key={`${file.name}-${file.lastModified}`} className="rounded-md border border-border px-2 py-1">{file.name}</li>)}</ul> : null}
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="secondary" onClick={onCancel}>取消</Button><Button type="button" disabled={saving} onClick={submit}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}提交工单</Button></div>
    </div></section>;
}

function TicketConversation({ ticket, token, onBack, onChange }: Readonly<{ ticket: TicketDetail; token: string; onBack: () => void; onChange: (ticket: TicketDetail) => void }>) {
  const [body, setBody] = useState(""); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const send = () => void sendReply({ ticket, token, body, setBody, setSaving, setError, onChange });
  return <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-panel"><div className="flex items-center gap-3 border-b border-border p-4"><Button type="button" variant="secondary" size="icon" aria-label="返回工单列表" onClick={onBack}><ArrowLeft className="size-4" /></Button><div className="min-w-0 flex-1"><h2 className="truncate font-semibold">{ticket.title}</h2><p className="mt-1 text-xs text-muted">{ticket.category} · {ticket.priority}</p></div><Status status={ticket.status} /></div>
    <ol className="max-h-[55dvh] space-y-3 overflow-y-auto p-4 sm:p-5">{ticket.messages.map((item) => <li key={item.id} className={`max-w-[92%] rounded-lg border p-3 ${item.authorType === "customer" ? "ml-auto border-primary/25 bg-primary/[0.07]" : "mr-auto border-border bg-surface-muted"}`}><div className="flex justify-between gap-4 text-xs"><strong>{item.authorName}</strong><time className="text-muted">{formatDate(item.createdAt)}</time></div><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{item.body}</p>{item.attachments.length ? <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{item.attachments.map((file) => <AttachmentImage key={file.id} id={file.id} name={file.originalName} token={token} />)}</div> : null}</li>)}</ol>
    <div className="border-t border-border p-4"><Label className="mb-1.5 block" htmlFor="ticket-reply">继续回复</Label><Textarea id="ticket-reply" className="min-h-24 resize-y" value={body} disabled={ticket.status === "closed" || saving} onChange={(event) => setBody(event.target.value)} />{error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}<Button type="button" className="mt-3 w-full sm:w-auto" disabled={!body.trim() || ticket.status === "closed" || saving} onClick={send}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}发送回复</Button></div></section>;
}

function AttachmentImage({ id, name, token }: Readonly<{ id: string; name: string; token: string }>) {
  const [url, setUrl] = useState(""); const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true; let objectUrl = "";
    setUrl(""); setFailed(false);
    void fetch(`/api/embed/tickets/attachments/${id}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("图片加载失败");
      const nextUrl = URL.createObjectURL(await response.blob());
      if (!active) { URL.revokeObjectURL(nextUrl); return; }
      objectUrl = nextUrl; setUrl(nextUrl);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id, token]);
  if (url) return <a href={url} target="_blank" rel="noreferrer" className="relative block aspect-square overflow-hidden rounded-md border border-border"><Image fill unoptimized sizes="160px" src={url} alt={name} className="object-cover" /></a>;
  if (failed) return <div role="img" aria-label={`${name} 加载失败`} title={`${name} 加载失败`} className="grid aspect-square place-items-center rounded-md border border-danger/25 bg-danger/10 text-danger"><ImageOff className="size-5" /></div>;
  return <div role="status" aria-label={`${name} 正在加载`} className="aspect-square animate-pulse rounded-md bg-surface-muted" />;
}
function Field({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) { return <Label><span className="mb-1.5 block">{label}</span>{children}</Label>; }
function option(value: string) { return { value, label: value }; }
function Status({ status }: Readonly<{ status: Ticket["status"] }>) { const label = { open: "待处理", pending: "待跟进", replied: "已回复", closed: "已关闭" }[status]; return <span className="shrink-0 rounded-md border border-border bg-surface-muted px-2 py-1 text-xs font-semibold text-muted">{label}</span>; }
async function openTicket(id: string, token: string, setSelected: (ticket: TicketDetail) => void, setError: (value: string) => void) { try { setSelected(await embedRequestJson<TicketDetail>(`/api/embed/tickets/${id}`, token)); } catch (error) { setError(message(error)); } }
async function createTicket(input: Readonly<{ values: Record<string, string>; files: readonly File[]; token: string; setSaving: (value: boolean) => void; setError: (value: string) => void; onCreated: (ticket: TicketDetail) => void }>) { input.setSaving(true); input.setError(""); const form = new FormData(); Object.entries(input.values).forEach(([key, value]) => form.set(key, value)); input.files.forEach((file) => form.append("images", file)); try { input.onCreated(await embedRequestJson<TicketDetail>("/api/embed/tickets", input.token, { method: "POST", body: form })); } catch (error) { input.setError(message(error)); } finally { input.setSaving(false); } }
async function sendReply(input: Readonly<{ ticket: TicketDetail; token: string; body: string; setBody: (value: string) => void; setSaving: (value: boolean) => void; setError: (value: string) => void; onChange: (ticket: TicketDetail) => void }>) { input.setSaving(true); input.setError(""); try { input.onChange(await embedRequestJson<TicketDetail>(`/api/embed/tickets/${input.ticket.id}/messages`, input.token, { method: "POST", body: JSON.stringify({ body: input.body }) })); input.setBody(""); } catch (error) { input.setError(message(error)); } finally { input.setSaving(false); } }
function message(error: unknown) { return error instanceof Error ? error.message : String(error); }
function formatDate(value: string) { return new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
