"use client";

import { Activity, AlertTriangle, Ban, CalendarClock, Copy, Eye, EyeOff, Gift, Loader2, Pencil, Plus, RefreshCw, Search, TicketCheck, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { lotteryParticipationLabel } from "../../core/lottery-participation";
import type { LotteryCampaign } from "../../server/embeds/types";
import { LotteryEligibilitySummary } from "../lottery-eligibility-summary";
import { Button } from "../ui/button";
import { ConfirmAlert } from "../ui/confirm-alert";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { requestJson } from "./api";
import { EngagementPageHeader } from "./engagement-page-header";
import { LotteryForm } from "./lottery-form";

const PRIZE_TYPE_LABELS = { balance: "余额", subscription: "订阅" } as const;
type CampaignFilter = "all" | "active" | "finished";

export function LotteryDashboard() {
  const [items, setItems] = useState<LotteryCampaign[]>([]);
  const [editing, setEditing] = useState<LotteryCampaign | "new" | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [visibilityPendingId, setVisibilityPendingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<CampaignFilter>("all");
  const [search, setSearch] = useState("");
  const visibleItems = items.filter((campaign) => matchesCampaign(campaign, filter, search));
  const load = () => void loadCampaigns(setItems, setLoading);
  useEffect(() => { void loadCampaigns(setItems, setLoading); }, []);
  return (
    <section className="page-stack">
      <EngagementPageHeader kind="lottery" title="抽奖活动" description="创建活动、管理报名并查看开奖结果，定时活动由 Worker 自动结算。" actions={<>
        <Button type="button" variant="secondary" size="icon" aria-label="刷新活动" title="刷新活动" disabled={loading} onClick={load}>{loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}</Button>
        <Button type="button" onClick={() => setEditing("new")}><Plus className="size-4" />新建抽奖</Button>
      </>} />
      <LotteryStats items={items} />
      <section aria-labelledby="lottery-campaigns-heading">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"><div><h2 id="lottery-campaigns-heading" className="text-lg font-semibold">活动列表</h2><p className="mt-1 text-sm text-muted">共 {items.length} 个活动，按创建时间排列</p></div><p className="text-sm text-muted">当前显示 {visibleItems.length} 个</p></div>
        <CampaignToolbar filter={filter} search={search} onFilter={setFilter} onSearch={setSearch} />
        <CampaignList items={visibleItems} total={items.length} loading={loading}
          visibilityPendingId={visibilityPendingId} onEdit={setEditing} onCancel={setPendingId}
          onVisibilityChange={(id, visibleToUsers) => void toggleCampaignVisibility({ id, visibleToUsers, setItems, setPending: setVisibilityPendingId })} />
      </section>
      {editing ? <LotteryForm campaign={editing === "new" ? null : editing} onCancel={() => setEditing(null)} onSaved={(campaign) => { setItems((current) => [campaign, ...current.filter((item) => item.id !== campaign.id)]); setEditing(null); }} /> : null}
      <ConfirmAlert open={Boolean(pendingId)} onOpenChange={(open) => { if (!open) setPendingId(null); }}
        title="确认取消活动？" description="取消后活动将停止参与且无法恢复；即时开奖已发出的兑换码仍然有效。" confirmLabel="确认取消"
        onConfirm={() => { if (pendingId) void cancelCampaign(pendingId, setItems); }} />
    </section>
  );
}

function CampaignToolbar(props: Readonly<{
  filter: CampaignFilter;
  search: string;
  onFilter: (value: CampaignFilter) => void;
  onSearch: (value: string) => void;
}>) {
  const filters: ReadonlyArray<{ value: CampaignFilter; label: string }> = [
    { value: "all", label: "全部" },
    { value: "active", label: "进行中" },
    { value: "finished", label: "已结束" },
  ];
  return <div className="mt-4 flex flex-col gap-3 border-y border-border bg-surface-muted/35 py-3 sm:flex-row sm:items-center sm:justify-between">
    <div role="group" aria-label="活动状态筛选" className="flex w-fit rounded-lg border border-border-strong bg-surface p-1">
      {filters.map((item) => <Button key={item.value} type="button" size="sm" variant="ghost" aria-pressed={props.filter === item.value}
        className={props.filter === item.value ? "bg-primary/10 text-primary-strong hover:bg-primary/10" : ""} onClick={() => props.onFilter(item.value)}>{item.label}</Button>)}
    </div>
    <Label className="relative block w-full sm:max-w-sm"><span className="sr-only">搜索抽奖活动</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
      <Input type="search" value={props.search} onChange={(event) => props.onSearch(event.target.value)} placeholder="搜索活动名称或说明" className="pl-9" />
    </Label>
  </div>;
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

function CampaignList({ items, total, loading, visibilityPendingId, onEdit, onCancel, onVisibilityChange }: Readonly<{ items: readonly LotteryCampaign[]; total: number; loading: boolean; visibilityPendingId: string | null; onEdit: (campaign: LotteryCampaign) => void; onCancel: (id: string) => void; onVisibilityChange: (id: string, visible: boolean) => void }>) {
  if (loading && !total) return <div className="loading-state mt-4"><Loader2 className="size-4 animate-spin" />读取活动…</div>;
  if (!items.length) return <div className="empty-state mt-4"><Gift className="size-7" /><span>{total ? "没有符合当前条件的活动" : "还没有抽奖活动"}</span></div>;
  return <div className="grid gap-3 pt-4 lg:grid-cols-2">{items.map((campaign) => <CampaignCard key={campaign.id} campaign={campaign}
    visibilityPending={visibilityPendingId === campaign.id} onEdit={() => onEdit(campaign)} onCancel={() => onCancel(campaign.id)}
    onVisibilityChange={(visible) => onVisibilityChange(campaign.id, visible)} />)}</div>;
}

function CampaignCard({ campaign, visibilityPending, onEdit, onCancel, onVisibilityChange }: Readonly<{ campaign: LotteryCampaign; visibilityPending: boolean; onEdit: () => void; onCancel: () => void; onVisibilityChange: (visible: boolean) => void }>) {
  const active = campaign.status === "open" || campaign.status === "scheduled";
  const VisibilityIcon = campaign.visibleToUsers ? Eye : EyeOff;
  return <article className="rounded-lg border border-border bg-surface p-4 shadow-sm transition-[border-color,box-shadow] duration-200 hover:border-primary/35 hover:shadow-md">
    <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{campaign.name}</h3><p className="mt-1 line-clamp-2 text-sm leading-6 text-muted">{campaign.description || "暂无活动说明"}</p></div><span className={statusClass(campaign.status)}>{statusLabel(campaign)}</span></div>
    <p className="mt-3 flex items-center gap-2 text-xs text-muted"><CalendarClock className="size-3.5" />{campaign.drawMode === "scheduled" ? `定时开奖${campaign.drawAt ? ` · ${formatDate(campaign.drawAt)}` : ""}` : "即时开奖"} · {lotteryParticipationLabel(campaign.participationMode)}</p>
    <dl className="mt-4 grid grid-cols-3 gap-2 text-center"><Metric icon={TicketCheck} label="参与" value={campaign.entryCount} /><Metric icon={Gift} label="剩余奖品" value={campaign.prizeInventory.reduce((sum, item) => sum + item.remaining, 0)} /><Metric icon={Trophy} label="中奖" value={campaign.winnerCount} /></dl>
    <PrizeInventory campaign={campaign} />
    <LotteryEligibilitySummary conditions={campaign.eligibilityConditions} className="mt-3 border-t border-border pt-3" />
    <div className="mt-3 flex min-h-16 items-center gap-3 rounded-lg border border-border bg-surface-muted px-3">
      <VisibilityIcon className={`size-4 shrink-0 ${campaign.visibleToUsers ? "text-success" : "text-muted"}`} aria-hidden="true" />
      <Label htmlFor={`campaign-visibility-${campaign.id}`} className="min-w-0 flex-1 cursor-pointer"><span className="block text-sm font-medium">向用户展示</span><span className="block text-xs font-normal leading-5 text-muted">{campaign.visibleToUsers ? "用户端可查看并参与活动" : "用户端已隐藏且不可参与"}</span></Label>
      <Switch id={`campaign-visibility-${campaign.id}`} checked={campaign.visibleToUsers} disabled={visibilityPending} aria-label={`${campaign.visibleToUsers ? "隐藏" : "展示"}活动 ${campaign.name}`} onCheckedChange={onVisibilityChange} />
    </div>
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
async function toggleCampaignVisibility(input: Readonly<{ id: string; visibleToUsers: boolean; setItems: React.Dispatch<React.SetStateAction<LotteryCampaign[]>>; setPending: (id: string | null) => void }>) { input.setPending(input.id); try { const campaign = await requestJson<LotteryCampaign>(`/api/lottery/campaigns/${input.id}/action`, { method: "POST", body: JSON.stringify({ action: "set-visibility", visibleToUsers: input.visibleToUsers }) }); input.setItems((items) => items.map((item) => item.id === campaign.id ? campaign : item)); toast.success(input.visibleToUsers ? "活动已展示给用户" : "活动已从用户端隐藏"); } catch (error) { toast.error(error instanceof Error ? error.message : String(error)); } finally { input.setPending(null); } }
async function copyCode(code: string) { try { await navigator.clipboard.writeText(code); toast.success("兑换码已复制"); } catch (error) { toast.error(error instanceof Error ? error.message : "复制兑换码失败"); } }

function matchesCampaign(campaign: LotteryCampaign, filter: CampaignFilter, search: string) {
  const active = campaign.status === "open" || campaign.status === "scheduled" || campaign.status === "drawing";
  if (filter === "active" && !active) return false;
  if (filter === "finished" && active) return false;
  const query = search.trim().toLocaleLowerCase("zh-CN");
  return !query || `${campaign.name} ${campaign.description}`.toLocaleLowerCase("zh-CN").includes(query);
}
