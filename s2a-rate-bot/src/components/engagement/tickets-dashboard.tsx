"use client";

import { Inbox, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { Ticket, TicketDetail, TicketStatus } from "../../server/embeds/types";
import { Button } from "../ui/button";
import { DataLoadError } from "../ui/data-load-error";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { requestJson } from "./api";
import { EngagementPageHeader } from "./engagement-page-header";
import { TicketDetailPanel } from "./ticket-detail-panel";

const STATUS_LABELS: Record<TicketStatus, string> = { open: "待处理", pending: "待跟进", replied: "已回复", closed: "已关闭" };
const STATUS_FILTERS = [{ value: "", label: "全部" }, ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))] as const;

export function TicketsDashboard() {
  const [items, setItems] = useState<readonly Ticket[]>([]);
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = () => void loadTickets(status, setItems, setLoading, selected?.id, setSelected, setError);
  const openDetail = (id: string) => void loadDetail(id, (ticket) => {
    setSelected(ticket);
    if (!window.matchMedia("(max-width: 1023px)").matches) return;
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => document.getElementById("ticket-detail-panel")?.scrollIntoView({ behavior: "smooth", block: "start" })));
  });
  useEffect(() => { void loadTickets(status, setItems, setLoading, undefined, setSelected, setError); }, [status]);
  return (
    <section className="page-stack">
      <EngagementPageHeader kind="tickets" title="工单中心" description="集中处理用户反馈、附件和客服往来，快速识别仍需跟进的问题。" />
      <section className="panel overflow-hidden">
        <div className="panel-header">
          <div className="flex min-w-0 items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary-strong"><Inbox className="size-4" /></span><div className="min-w-0"><h2 className="panel-title">工单队列</h2><p className="panel-description">当前视图共 {items.length} 张工单</p></div></div>
          <Button type="button" variant="secondary" size="icon" aria-label="刷新工单" title="刷新工单" disabled={loading} onClick={load}>{loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}</Button>
        </div>
        <div className="flex gap-2 overflow-x-auto border-b border-border bg-surface-muted/45 px-4 py-2.5" aria-label="工单状态筛选">
          {STATUS_FILTERS.map((filter) => <Button key={filter.value || "all"} type="button" size="sm" variant={status === filter.value ? "secondary" : "ghost"} aria-pressed={status === filter.value}
            onClick={() => setStatus(filter.value)}>{filter.label}</Button>)}
        </div>
        {error && !items.length ? <DataLoadError message={`工单队列加载失败：${error}`} onRetry={load} pending={loading} className="m-4 min-h-36 justify-center" /> : <>
          {error ? <DataLoadError message={`工单队列刷新失败：${error}`} onRetry={load} pending={loading} className="m-4" /> : null}
          <div className={`grid items-start ${selected ? "xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.85fr)]" : ""}`}>
            <TicketList items={items} selectedId={selected?.id} loading={loading} onSelect={openDetail} />
            {selected ? <TicketDetailPanel ticket={selected} onClose={() => setSelected(null)} onChange={(ticket) => { setSelected(ticket); setItems((current) => current.map((item) => item.id === ticket.id ? ticket : item)); }} /> : null}
          </div>
        </>}
      </section>
    </section>
  );
}

function TicketList({ items, selectedId, loading, onSelect }: Readonly<{ items: readonly Ticket[]; selectedId?: string; loading: boolean; onSelect: (id: string) => void }>) {
  if (loading && !items.length) return <div className="loading-state m-4"><Loader2 className="size-4 animate-spin" />读取工单…</div>;
  if (!items.length) return <div className="empty-state m-4"><Inbox className="size-7" /><span>当前筛选条件下没有工单</span></div>;
  return (
    <>
      <div className="space-y-2.5 p-3 lg:hidden">
        {items.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} selected={selectedId === ticket.id} onSelect={onSelect} />)}
      </div>
      <div className="desktop-table-viewport hidden overflow-auto xl:border-r xl:border-border lg:block">
        <Table className="data-table-sticky min-w-[720px]"><TableHeader><TableRow><TableHead>标题</TableHead><TableHead>状态</TableHead><TableHead>分类 / 优先级</TableHead><TableHead>用户</TableHead><TableHead>最近消息</TableHead></TableRow></TableHeader>
          <TableBody>{items.map((ticket) => <TableRow key={ticket.id} data-selected={selectedId === ticket.id} className="cursor-pointer" onClick={() => onSelect(ticket.id)}>
            <TableCell><Button type="button" variant="ghost" className="min-h-11 justify-start px-0 text-left font-medium hover:bg-transparent hover:text-primary-strong" aria-label={`查看工单：${ticket.title}`}>{ticket.title}</Button></TableCell>
            <TableCell><StatusBadge status={ticket.status} /></TableCell><TableCell><span>{ticket.category}</span><span className="ml-2 text-xs text-muted">{ticket.priority}</span></TableCell>
            <TableCell><span className="block max-w-44 truncate">{ticket.sub2apiEmail || ticket.manualEmail}</span></TableCell><TableCell className="whitespace-nowrap text-muted">{formatDate(ticket.lastMessageAt)}</TableCell>
          </TableRow>)}</TableBody>
        </Table>
      </div>
    </>
  );
}

function TicketCard({ ticket, selected, onSelect }: Readonly<{ ticket: Ticket; selected: boolean; onSelect: (id: string) => void }>) {
  return (
    <article className={`rounded-lg border p-3 shadow-sm transition-[border-color,background-color,box-shadow] ${selected ? "border-primary/45 bg-primary/[0.06] shadow-panel" : "border-border bg-surface"}`}>
      <div className="flex items-start justify-between gap-3">
        <Button type="button" variant="ghost" aria-pressed={selected} className="h-auto min-h-0 min-w-0 flex-1 justify-start truncate px-0 py-0 text-left font-medium leading-5 hover:bg-transparent hover:text-primary-strong" aria-label={`查看工单：${ticket.title}`} title={ticket.title} onClick={() => onSelect(ticket.id)}>{ticket.title}</Button>
        <StatusBadge status={ticket.status} />
      </div>
      <p className="mt-2 text-xs text-muted"><span>{ticket.category}</span><span className="px-1.5">·</span><span>{ticket.priority}</span></p>
      <dl className="mt-3 grid grid-cols-2 divide-x divide-border border-t border-border pt-2.5 text-sm">
        <div className="min-w-0 pr-3"><dt className="text-xs text-muted">用户</dt><dd className="mt-1 truncate" title={ticket.sub2apiEmail || ticket.manualEmail}>{ticket.sub2apiEmail || ticket.manualEmail}</dd></div>
        <div className="min-w-0 pl-3"><dt className="text-xs text-muted">最近消息</dt><dd className="mt-1 whitespace-nowrap font-mono text-xs text-muted">{formatDate(ticket.lastMessageAt)}</dd></div>
      </dl>
    </article>
  );
}

function StatusBadge({ status }: Readonly<{ status: TicketStatus }>) {
  const tone = status === "closed" ? "border-border bg-surface-muted text-muted" : status === "replied" ? "border-success/25 bg-success/10 text-success" : "border-warning/25 bg-warning/10 text-warning";
  return <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${tone}`}>{STATUS_LABELS[status]}</span>;
}

async function loadTickets(status: string, setItems: (items: readonly Ticket[]) => void, setLoading: (value: boolean) => void, selectedId: string | undefined, setSelected: (value: TicketDetail | null) => void, setError: (value: string) => void) {
  setLoading(true);
  setError("");
  try { const response = await requestJson<{ items: Ticket[] }>(`/api/tickets${status ? `?status=${status}` : ""}`); setItems(response.items); if (selectedId) await loadDetail(selectedId, setSelected); }
  catch (error) { const message = error instanceof Error ? error.message : String(error); setError(message); toast.error(message); }
  finally { setLoading(false); }
}

async function loadDetail(id: string, setSelected: (value: TicketDetail | null) => void) {
  try { setSelected(await requestJson<TicketDetail>(`/api/tickets/${id}`)); }
  catch (error) { toast.error(error instanceof Error ? error.message : String(error)); }
}

function formatDate(value: string) { return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
