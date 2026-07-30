"use client";

import { Activity, AlertTriangle, Ban, CalendarClock, Copy, Gift, Loader2, Pencil, Plus, RefreshCw, TicketCheck, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { LotteryCampaign } from "../../server/embeds/types";
import { Button } from "../ui/button";
import { ConfirmAlert } from "../ui/confirm-alert";
import { requestJson } from "./api";
import { EngagementPageHeader } from "./engagement-page-header";
import { LotteryForm } from "./lottery-form";

const PRIZE_TYPE_LABELS = { balance: "余额", subscription: "订阅" } as const;

export function LotteryDashboard() {
  const [items, setItems] = useState<LotteryCampaign[]>([]);
  const [editing, setEditing] = useState<LotteryCampaign | "new" | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = () => void loadCampaigns(setItems, setLoading);
  useEffect(() => { void loadCampaigns(setItems, setLoading); }, []);
  return (
    <section className="page-stack">
      <EngagementPageHeader kind="lottery" title="抽奖活动" description="创建活动、管理报名并查看开奖结果，定时活动由 Worker 自动结算。" actions={<>
        <Button type="button" variant="secondary" size="icon" aria-label="刷新活动" title="刷新活动" disabled={loading} onClick={load}>{loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}</Button>
        <Button type="button" onClick={() => setEditing("new")}><Plus className="size-4" />新建抽奖</Button>
      </>} />
      <LotteryStats items={items} />
      <section className="panel overflow-hidden">
        <div className="panel-header"><div><h2 className="panel-title">活动列表</h2><p className="panel-description">共 {items.length} 个活动，按创建时间排列</p></div></div>
        <CampaignList items={items} loading={loading} onEdit={setEditing} onCancel={setPendingId} />
      </section>
      {editing ? <LotteryForm campaign={editing === "new" ? null : editing} onCancel={() => setEditing(null)} onSaved={(campaign) => { setItems((current) => [campaign, ...current.filter((item) => item.id !== campaign.id)]); setEditing(null); }} /> : null}
      <ConfirmAlert open={Boolean(pendingId)} onOpenChange={(open) => { if (!open) setPendingId(null); }}
        title="确认取消活动？" description="取消后活动将停止参与且无法恢复；即时开奖已发出的兑换码仍然有效。" confirmLabel="确认取消"
        onConfirm={() => { if (pendingId) void cancelCampaign(pendingId, setItems); }} />
    </section>
  );
}

function LotteryStats({ items }: Readonly<{ items: readonly LotteryCampaign[] }>) {
  const values = [
    { label: "全部活动", value: items.length, icon: Gift },
    { label: "进行中", value: items.filter((item) => item.status === "open" || item.status === "scheduled" || item.status === "drawing").length, icon: Activity },
    { label: "累计参与", value: items.reduce((sum, item) => sum + item.entryCount, 0), icon: TicketCheck },
    { label: "中奖人数", value: items.reduce((sum, item) => sum + item.winnerCount, 0), icon: Trophy },
  ];
  return <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">{values.map(({ label, value, icon: Icon }) => <div key={label} className="metric-card"><div className="flex items-center justify-between gap-3"><dt className="text-sm text-muted">{label}</dt><Icon className="size-4 text-primary-strong" /></div><dd className="mt-2 text-2xl font-semibold tabular-nums">{value}</dd></div>)}</dl>;
}

function CampaignList({ items, loading, onEdit, onCancel }: Readonly<{ items: readonly LotteryCampaign[]; loading: boolean; onEdit: (campaign: LotteryCampaign) => void; onCancel: (id: string) => void }>) {
  if (loading && !items.length) return <div className="loading-state m-4"><Loader2 className="size-4 animate-spin" />读取活动…</div>;
  if (!items.length) return <div className="empty-state m-4"><Gift className="size-7" /><span>还没有抽奖活动</span></div>;
  return <div className="grid gap-3 p-4 lg:grid-cols-2 lg:p-5">{items.map((campaign) => <CampaignCard key={campaign.id} campaign={campaign} onEdit={() => onEdit(campaign)} onCancel={() => onCancel(campaign.id)} />)}</div>;
}

function CampaignCard({ campaign, onEdit, onCancel }: Readonly<{ campaign: LotteryCampaign; onEdit: () => void; onCancel: () => void }>) {
  const active = campaign.status === "open" || campaign.status === "scheduled";
  return <article className="rounded-xl border border-border bg-surface p-4 shadow-sm transition-[border-color,box-shadow] duration-200 hover:border-primary/35 hover:shadow-md">
    <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{campaign.name}</h3><p className="mt-1 line-clamp-2 text-sm leading-6 text-muted">{campaign.description || "暂无活动说明"}</p></div><span className={statusClass(campaign.status)}>{statusLabel(campaign)}</span></div>
    <p className="mt-3 flex items-center gap-2 text-xs text-muted"><CalendarClock className="size-3.5" />{campaign.drawMode === "scheduled" ? `定时开奖${campaign.drawAt ? ` · ${formatDate(campaign.drawAt)}` : ""}` : "即时开奖 · 用户抽奖后立即返回结果"}</p>
    <dl className="mt-4 grid grid-cols-3 gap-2 text-center"><Metric icon={TicketCheck} label="参与" value={campaign.entryCount} /><Metric icon={Gift} label="剩余奖品" value={campaign.prizeInventory.reduce((sum, item) => sum + item.remaining, 0)} /><Metric icon={Trophy} label="中奖" value={campaign.winnerCount} /></dl>
    <PrizeInventory campaign={campaign} />
    {campaign.lastError ? <p role="alert" className="mt-3 flex gap-2 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><span><strong>开奖失败：</strong>{campaign.lastError}</span></p> : null}
    <div className="mt-4 flex flex-wrap gap-2"><Button type="button" variant="secondary" disabled={!active || campaign.entryCount > 0} onClick={onEdit}><Pencil className="size-4" />编辑</Button>
      <Button type="button" variant="outline" className="ml-auto text-danger hover:bg-danger/10 hover:text-danger" disabled={!active} onClick={onCancel}><Ban className="size-4" />取消</Button></div>
    {active && campaign.entryCount > 0 ? <p className="mt-2 text-xs text-muted">已有参与记录，为保证抽奖规则一致，当前活动不可编辑。</p> : null}
    {campaign.winners.length ? <WinnerList campaign={campaign} /> : null}
  </article>;
}

function WinnerList({ campaign }: Readonly<{ campaign: LotteryCampaign }>) {
  return <div className="mt-4 border-t border-border pt-3"><p className="text-xs font-semibold text-muted">中奖结果与兑换码</p>
    <ul className="mt-2 space-y-2 text-sm">{campaign.winners.map((winner) => <li key={winner.id} className="rounded-lg bg-surface-muted px-3 py-2">
      <div className="flex justify-between gap-3"><span>{winner.maskedEmail}</span><strong className="text-primary-strong">{winner.prizeName}</strong></div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-muted"><span>{winner.prizeType ? PRIZE_TYPE_LABELS[winner.prizeType] : "-"} · 额度 {winner.prizeValue ?? "-"}</span><span className="flex items-center gap-1"><code className="select-all font-mono text-foreground">{winner.redemptionCode ?? "兑换码缺失（数据异常）"}</code>{winner.redemptionCode ? <Button type="button" variant="ghost" size="icon-sm" aria-label="复制兑换码" title="复制兑换码" onClick={() => void copyCode(winner.redemptionCode!)}><Copy className="size-3.5" /></Button> : null}</span></div>
    </li>)}</ul>
  </div>;
}

function Metric({ icon: Icon, label, value }: Readonly<{ icon: typeof Gift; label: string; value: number }>) { return <div className="rounded-md border border-border bg-surface p-2"><Icon className="mx-auto size-4 text-muted" /><span className="mt-1 block font-semibold tabular-nums">{value}</span><span className="text-xs text-muted">{label}</span></div>; }
function PrizeInventory({ campaign }: Readonly<{ campaign: LotteryCampaign }>) { return <div className="mt-3 flex flex-wrap gap-2">{campaign.prizes.map((prize) => { const inventory = campaign.prizeInventory.find((item) => item.prizeId === prize.id); return <span key={prize.id} className="rounded-md bg-surface-muted px-2 py-1 text-xs text-muted">{prize.name}：剩余 {inventory?.remaining ?? 0}/{prize.quantity}{campaign.drawMode === "instant" ? ` · ${prize.probability}%` : ""}</span>; })}</div>; }
function statusClass(status: LotteryCampaign["status"]) { const tone = status === "open" ? "border-success/25 bg-success/10 text-success" : status === "drawn" || status === "exhausted" ? "border-primary/25 bg-primary/10 text-primary-strong" : status === "drawing" ? "border-warning/25 bg-warning/10 text-warning" : "border-border bg-surface text-muted"; return `shrink-0 rounded-md border px-2 py-1 text-xs font-semibold ${tone}`; }
function statusLabel(campaign: LotteryCampaign) { if (campaign.status === "open") return campaign.drawMode === "instant" ? "抽奖中" : "报名中"; return { scheduled: "待开始", drawing: "开奖处理中", drawn: "已开奖", exhausted: "奖品已抽完", cancelled: "已取消" }[campaign.status]; }
function formatDate(value: string) { return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }

async function loadCampaigns(setItems: (items: LotteryCampaign[]) => void, setLoading: (value: boolean) => void) { setLoading(true); try { setItems((await requestJson<{ items: LotteryCampaign[] }>("/api/lottery/campaigns")).items); } catch (error) { toast.error(error instanceof Error ? error.message : String(error)); } finally { setLoading(false); } }
async function cancelCampaign(id: string, setItems: React.Dispatch<React.SetStateAction<LotteryCampaign[]>>) { try { const campaign = await requestJson<LotteryCampaign>(`/api/lottery/campaigns/${id}/action`, { method: "POST", body: JSON.stringify({ action: "cancel" }) }); setItems((items) => items.map((item) => item.id === id ? campaign : item)); toast.success("活动已取消"); } catch (error) { toast.error(error instanceof Error ? error.message : String(error)); } }
async function copyCode(code: string) { try { await navigator.clipboard.writeText(code); toast.success("兑换码已复制"); } catch (error) { toast.error(error instanceof Error ? error.message : "复制兑换码失败"); } }
