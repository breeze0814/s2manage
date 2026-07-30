"use client";

import { Inbox, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { Ticket, TicketDetail, TicketStatus } from "../../server/embeds/types";
import { Button } from "../ui/button";
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
  const load = () => void loadTickets(status, setItems, setLoading, selected?.id, setSelected);
  useEffect(() => { void loadTickets(status, setItems, setLoading, undefined, setSelected); }, [status]);
  return (
    <section className="page-stack">
      <EngagementPageHeader kind="tickets" title="工单中心" description="集中处理用户反馈、附件和客服往来，快速识别仍需跟进的问题。" />
      <section className="panel overflow-hidden">
        <div className="panel-header">
          <div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary-strong"><Inbox className="size-4" /></span><div><h2 className="panel-title">工单队列</h2><p className="panel-description">当前视图共 {items.length} 张工单</p></div></div>
          <Button type="button" variant="secondary" size="icon" aria-label="刷新工单" title="刷新工单" disabled={loading} onClick={load}>{loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}</Button>
        </div>
        <div className="flex gap-2 overflow-x-auto border-b border-border bg-surface-muted/45 px-4 py-3" aria-label="工单状态筛选">
          {STATUS_FILTERS.map((filter) => <Button key={filter.value || "all"} type="button" size="sm" variant={status === filter.value ? "secondary" : "ghost"} aria-pressed={status === filter.value}
            onClick={() => setStatus(filter.value)}>{filter.label}</Button>)}
        </div>
        <div className={`grid items-start ${selected ? "xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.85fr)]" : ""}`}>
          <TicketList items={items} selectedId={selected?.id} loading={loading} onSelect={(id) => void loadDetail(id, setSelected)} />
          {selected ? <TicketDetailPanel ticket={selected} onChange={(ticket) => { setSelected(ticket); setItems((current) => current.map((item) => item.id === ticket.id ? ticket : item)); }} /> : null}
        </div>
      </section>
    </section>
  );
}

function TicketList({ items, selectedId, loading, onSelect }: Readonly<{ items: readonly Ticket[]; selectedId?: string; loading: boolean; onSelect: (id: string) => void }>) {
  if (loading && !items.length) return <div className="loading-state m-4"><Loader2 className="size-4 animate-spin" />读取工单…</div>;
  if (!items.length) return <div className="empty-state m-4"><Inbox className="size-7" /><span>当前筛选条件下没有工单</span></div>;
  return (
    <div className="desktop-table-viewport overflow-auto xl:border-r xl:border-border">
      <Table className="data-table-sticky min-w-[720px]"><TableHeader><TableRow><TableHead>标题</TableHead><TableHead>状态</TableHead><TableHead>分类 / 优先级</TableHead><TableHead>用户</TableHead><TableHead>最近消息</TableHead></TableRow></TableHeader>
        <TableBody>{items.map((ticket) => <TableRow key={ticket.id} data-selected={selectedId === ticket.id} className="cursor-pointer" onClick={() => onSelect(ticket.id)}>
          <TableCell><Button type="button" variant="ghost" className="min-h-11 justify-start px-0 text-left font-medium hover:bg-transparent hover:text-primary-strong">{ticket.title}</Button></TableCell>
          <TableCell><StatusBadge status={ticket.status} /></TableCell><TableCell><span>{ticket.category}</span><span className="ml-2 text-xs text-muted">{ticket.priority}</span></TableCell>
          <TableCell><span className="block max-w-44 truncate">{ticket.sub2apiEmail || ticket.manualEmail}</span></TableCell><TableCell className="whitespace-nowrap text-muted">{formatDate(ticket.lastMessageAt)}</TableCell>
        </TableRow>)}</TableBody>
      </Table>
    </div>
  );
}

function StatusBadge({ status }: Readonly<{ status: TicketStatus }>) {
  const tone = status === "closed" ? "border-border bg-surface-muted text-muted" : status === "replied" ? "border-success/25 bg-success/10 text-success" : "border-warning/25 bg-warning/10 text-warning";
  return <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${tone}`}>{STATUS_LABELS[status]}</span>;
}

async function loadTickets(status: string, setItems: (items: readonly Ticket[]) => void, setLoading: (value: boolean) => void, selectedId: string | undefined, setSelected: (value: TicketDetail | null) => void) {
  setLoading(true);
  try { const response = await requestJson<{ items: Ticket[] }>(`/api/tickets${status ? `?status=${status}` : ""}`); setItems(response.items); if (selectedId) await loadDetail(selectedId, setSelected); }
  catch (error) { toast.error(error instanceof Error ? error.message : String(error)); }
  finally { setLoading(false); }
}

async function loadDetail(id: string, setSelected: (value: TicketDetail | null) => void) {
  try { setSelected(await requestJson<TicketDetail>(`/api/tickets/${id}`)); }
  catch (error) { toast.error(error instanceof Error ? error.message : String(error)); }
}

function formatDate(value: string) { return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
