"use client";

import { ArrowLeft, CheckCircle2, Clock3, Copy, Gift, Loader2, Sparkles, Ticket, Trophy, Undo2, XCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { lotteryParticipationLabel } from "../../core/lottery-participation";
import type { LotteryCampaign } from "../../server/embeds/types";
import { LotteryEligibilitySummary } from "../lottery-eligibility-summary";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog";
import { EmbedError, EmbedHeader, EmbedLoading } from "./embed-state";
import { LotteryWheel } from "./lottery-wheel";
import { embedRequestJson, useEmbedSession } from "./use-embed-session";

const DEFAULT_POLL_MS = 30_000;
const REWARD_POLL_MS = 3_000;

export function LotteryEmbedPage() {
  const auth = useEmbedSession("lottery");
  const [items, setItems] = useState<LotteryCampaign[]>([]); const [selected, setSelected] = useState<LotteryCampaign | null>(null);
  const [loading, setLoading] = useState(false); const [error, setError] = useState(""); const [reveal, setReveal] = useState<"won" | "lost" | null>(null);
  const previousStatus = useRef<string | null>(null);
  const selectedId = selected?.id;
  const rewardPending = selected?.currentEntry?.rewardStatus === "pending"
    || selected?.currentEntry?.rewardStatus === "processing"
    || selected?.currentEntry?.rewardStatus === "retryable_failed";
  const load = useCallback(async () => {
    if (!auth.session) return;
    setLoading(true); setError("");
    try {
      const response = await embedRequestJson<{ items: LotteryCampaign[] }>("/api/embed/lottery/campaigns", auth.session.token);
      setItems(response.items);
      if (selectedId) {
        const next = response.items.find((item) => item.id === selectedId) ?? null; setSelected(next);
        const status = next?.currentEntry?.status ?? null;
        if (previousStatus.current === "entered" && (status === "won" || status === "not_won")) setReveal(status === "won" ? "won" : "lost");
        previousStatus.current = status;
      }
    } catch (reason) { setError(message(reason)); }
    finally { setLoading(false); }
  }, [auth.session, selectedId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!auth.session) return; const timer = window.setInterval(() => { void load(); }, rewardPending ? REWARD_POLL_MS : DEFAULT_POLL_MS); return () => window.clearInterval(timer); }, [auth.session, load, rewardPending]);
  if (auth.loading) return <EmbedLoading />;
  if (auth.error || !auth.session) return <EmbedError message={auth.error || "嵌入会话不可用"} />;
  return <div className="min-h-dvh bg-background"><EmbedHeader eyebrow="Lucky Draw" title="抽奖中心" description="即时抽奖立刻返回结果，定时活动到点自动开奖" />
    <div className="mx-auto max-w-6xl p-4 sm:p-6">{error ? <p role="alert" className="mb-4 rounded-lg border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p> : null}
      {selected ? <CampaignDetail campaign={selected} token={auth.session.token} onBack={() => { setSelected(null); previousStatus.current = null; }} onChange={(campaign) => { const status = campaign.currentEntry?.status ?? null; setSelected(campaign); setItems((current) => current.map((item) => item.id === campaign.id ? campaign : item)); if (status === "won" || status === "not_won") setReveal(status === "won" ? "won" : "lost"); previousStatus.current = status; }} />
        : <CampaignList items={items} loading={loading} onSelect={(campaign) => { setSelected(campaign); previousStatus.current = campaign.currentEntry?.status ?? null; }} />}
    </div>{reveal ? <ResultReveal result={reveal} campaign={selected} onClose={() => setReveal(null)} /> : null}</div>;
}

function CampaignList({ items, loading, onSelect }: Readonly<{ items: readonly LotteryCampaign[]; loading: boolean; onSelect: (campaign: LotteryCampaign) => void }>) {
  if (loading && !items.length) return <div className="loading-state"><Loader2 className="size-4 animate-spin" />读取活动…</div>;
  if (!items.length) return <div className="empty-state"><Gift className="size-7" /><span>当前没有可展示的抽奖活动</span></div>;
  return <div className="grid gap-4 sm:grid-cols-2">{items.map((campaign) => <Button key={campaign.id} type="button" variant="outline" className="h-auto min-h-0 flex-col items-stretch rounded-lg p-4 text-left shadow-panel hover:border-primary/40 hover:bg-surface hover:shadow-md" onClick={() => onSelect(campaign)}>
    <div className="flex items-start justify-between gap-3"><span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary-strong"><Gift className="size-5" /></span><Status status={campaign.status} /></div><h2 className="mt-4 text-lg font-semibold">{campaign.name}</h2><p className="mt-1 line-clamp-2 text-sm leading-6 text-muted">{campaign.description || "查看活动详情与奖品"}</p>
    <PrizeInventoryPreview campaign={campaign} limit={3} className="mt-4" />
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted"><span>{lotteryParticipationLabel(campaign.participationMode)}</span><span>{campaign.eligibilityConditions.length ? `${campaign.eligibilityConditions.length} 项参与条件` : "无参与门槛"}</span><span>剩余 {totalRemainingPrizes(campaign)} 份</span></div>
  </Button>)}</div>;
}

function CampaignDetail({ campaign, token, onBack, onChange }: Readonly<{ campaign: LotteryCampaign; token: string; onBack: () => void; onChange: (campaign: LotteryCampaign) => void }>) {
  const [pending, setPending] = useState<"POST" | "DELETE" | null>(null);
  const [actionError, setActionError] = useState("");
  const entry = campaign.currentEntry;
  const canEnter = campaign.status === "open" && (!entry || entry.status === "withdrawn");
  const canWithdraw = campaign.drawMode === "scheduled" && campaign.status === "open" && entry?.status === "entered";
  const request = (method: "POST" | "DELETE") => runEntryAction({ campaignId: campaign.id, token, method, setPending, setError: setActionError });
  const action = async (method: "POST" | "DELETE") => { const next = await request(method); if (next) onChange(next); };
  return <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-panel">
    <div className="flex items-center gap-3 border-b border-border p-4"><Button type="button" variant="secondary" size="icon" aria-label="返回活动列表" onClick={onBack}><ArrowLeft className="size-4" /></Button><div className="min-w-0 flex-1"><h2 className="break-words font-semibold">{campaign.name}</h2><p className="mt-1 text-xs text-muted">{campaign.drawMode === "instant" ? "即时开奖" : "定时开奖"} · {lotteryParticipationLabel(campaign.participationMode)}</p></div><Status status={campaign.status} /></div>
    <div className="grid lg:grid-cols-[minmax(320px,1.05fr)_minmax(280px,0.75fr)]">
      <div className="border-b border-border bg-surface-muted/45 p-4 sm:p-6 lg:border-b-0 lg:border-r">
        {campaign.drawMode === "instant" ? <><LotteryWheel campaign={campaign} disabled={!canEnter} pending={pending === "POST"} onSpin={() => request("POST")} onComplete={onChange} />{actionError ? <ActionError message={actionError} /> : null}</> : <ScheduledOverview campaign={campaign} />}
      </div>
      <ParticipationPanel campaign={campaign} pending={pending} actionError={actionError} canEnter={canEnter} canWithdraw={canWithdraw} onAction={(method) => void action(method)} />
    </div>
    <CampaignInformation campaign={campaign} />
  </section>;
}

function ParticipationPanel({ campaign, pending, actionError, canEnter, canWithdraw, onAction }: Readonly<{ campaign: LotteryCampaign; pending: "POST" | "DELETE" | null; actionError: string; canEnter: boolean; canWithdraw: boolean; onAction: (method: "POST" | "DELETE") => void }>) {
  const entry = campaign.currentEntry;
  return <aside className="p-4 sm:p-6"><p className="text-xs font-semibold text-primary-strong">{campaign.drawMode === "instant" ? "参与信息" : "报名信息"}</p><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-muted">{campaign.description || "暂无活动说明"}</p><p className="mt-3 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs font-medium text-primary-strong">{campaign.participationMode === "daily" ? "每日可参与一次，以 Asia/Shanghai 自然日为准" : "整个活动周期内仅可参与一次"}</p><CampaignTimes campaign={campaign} />
    <div className="mt-5 border-t border-border pt-5"><h3 className="flex items-center gap-2 font-semibold"><Ticket className="size-4 text-primary" />{campaign.drawMode === "instant" ? "我的抽奖" : "我的报名"}</h3>
      {entry ? <div className="mt-4 space-y-3 text-sm"><div className="flex justify-between gap-3"><span className="text-muted">状态</span><EntryStatus status={entry.status} /></div><div className="flex justify-between gap-3"><span className="text-muted">参与时间</span><span>{formatDate(entry.createdAt)}</span></div>{entry.prizeName ? <RewardResult campaign={campaign} /> : null}</div> : <p className="mt-3 text-sm text-muted">{campaign.participationMode === "daily" ? (campaign.drawMode === "instant" ? "今天还未参与抽奖" : "今天还未报名") : (campaign.drawMode === "instant" ? "转动幸运轮盘参与本活动" : "尚未报名此活动")}</p>}
      {campaign.drawMode === "scheduled" && actionError ? <ActionError message={actionError} /> : null}<LotteryEligibilitySummary conditions={campaign.eligibilityConditions} className="mt-4" />
      {campaign.drawMode === "scheduled" ? <div className="mt-3 grid gap-2"><Button type="button" disabled={!canEnter || pending !== null} onClick={() => onAction("POST")}>{pending === "POST" ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}{entryActionLabel(campaign)}</Button><Button type="button" variant="secondary" disabled={!canWithdraw || pending !== null} onClick={() => onAction("DELETE")}>{pending === "DELETE" ? <Loader2 className="size-4 animate-spin" /> : <Undo2 className="size-4" />}{campaign.participationMode === "daily" ? "撤回今日报名" : "撤回报名"}</Button></div> : null}
    </div>
    <ParticipationHistory campaign={campaign} />
  </aside>;
}

function ScheduledOverview({ campaign }: Readonly<{ campaign: LotteryCampaign }>) {
  return <div className="flex min-h-[360px] flex-col items-center justify-center text-center"><span className="flex size-28 items-center justify-center rounded-full border-8 border-surface bg-primary/10 text-primary-strong shadow-elevated ring-1 ring-border"><Clock3 className="size-11" /></span><h3 className="mt-6 text-xl font-semibold">等待统一开奖</h3><p className="mt-2 max-w-sm text-sm leading-6 text-muted">报名成功后将在设定时间统一抽取，中奖结果会自动更新。</p><p className="mt-5 font-semibold tabular-nums text-primary-strong">{campaign.drawAt ? formatDate(campaign.drawAt) : "开奖时间待定"}</p></div>;
}

function CampaignInformation({ campaign }: Readonly<{ campaign: LotteryCampaign }>) {
  return <div className="grid gap-6 border-t border-border p-4 sm:p-6 lg:grid-cols-2"><section aria-labelledby="lottery-prize-inventory-heading"><h3 id="lottery-prize-inventory-heading" className="flex items-center gap-2 text-sm font-semibold"><Gift className="size-4 text-primary" />剩余奖品</h3><p className="mt-1 text-xs leading-5 text-muted">展示当前可领取奖品库存。</p><div className="mt-3 grid gap-2">{campaign.prizes.map((prize) => <PrizeCard key={prize.id} campaign={campaign} prizeId={prize.id} />)}</div></section>
    <section><h3 className="flex items-center gap-2 text-sm font-semibold"><Trophy className="size-4 text-warning" />中奖名单</h3>{campaign.winners.length ? <ul className="mt-3 divide-y divide-border rounded-lg border border-border">{campaign.winners.map((winner) => <li key={winner.id} className="flex justify-between gap-3 px-3 py-2 text-sm"><span>{winner.maskedEmail}</span><strong className="text-primary-strong">{winner.prizeName}</strong></li>)}</ul> : <p className="mt-3 rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted">暂未公布中奖名单</p>}</section>
  </div>;
}

function ActionError({ message }: Readonly<{ message: string }>) { return <p role="alert" className="mt-4 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger">{message}</p>; }

function CampaignTimes({ campaign }: Readonly<{ campaign: LotteryCampaign }>) { return <dl className="grid gap-2 rounded-lg border border-border bg-surface-muted p-3 text-xs sm:grid-cols-3"><TimeItem label="活动开始" value={campaign.registrationStart} /><TimeItem label="活动结束" value={campaign.registrationEnd} />{campaign.drawMode === "scheduled" ? <TimeItem label="开奖时间" value={campaign.drawAt} /> : null}</dl>; }
function TimeItem({ label, value }: Readonly<{ label: string; value: string | null }>) { return <div><dt className="text-muted">{label}</dt><dd className="mt-1 font-medium">{value ? formatDate(value) : "不限制"}</dd></div>; }
function PrizeCard({ campaign, prizeId }: Readonly<{ campaign: LotteryCampaign; prizeId: string }>) { const prize = campaign.prizes.find((item) => item.id === prizeId); if (!prize) return null; const remaining = campaign.prizeInventory.find((item) => item.prizeId === prizeId)?.remaining ?? 0; return <div className="rounded-lg border border-border bg-surface-muted p-3"><p className="font-medium">{prize.name}</p><p className="mt-1 text-xs text-muted">{prize.type === "balance" ? "余额金额" : "订阅额度"} {prize.value} · 剩余 {remaining}/{prize.quantity} 份{campaign.drawMode === "instant" ? ` · 中奖率 ${prize.probability}%` : ""}</p></div>; }

function PrizeInventoryPreview(props: Readonly<{ campaign: LotteryCampaign; limit: number; className?: string }>) {
  const items = prizeInventoryItems(props.campaign);
  return <div className={props.className} aria-label="当前剩余奖品">
    <div className="flex flex-wrap gap-1.5">{items.slice(0, props.limit).map((item) => <span key={item.id} className="rounded-md border border-border bg-surface-muted px-2 py-1 text-xs text-muted"><span className="text-foreground">{item.name}</span> · 剩余 {item.remaining}/{item.quantity}</span>)}{items.length > props.limit ? <span className="rounded-md border border-border bg-surface-muted px-2 py-1 text-xs text-muted">另 {items.length - props.limit} 种奖品</span> : null}</div>
  </div>;
}

function prizeInventoryItems(campaign: LotteryCampaign) {
  return campaign.prizes.map((prize) => {
    const inventory = campaign.prizeInventory.find((item) => item.prizeId === prize.id);
    return { id: prize.id, name: prize.name, quantity: prize.quantity, remaining: inventory?.remaining ?? 0 };
  });
}

function totalRemainingPrizes(campaign: LotteryCampaign) {
  return campaign.prizeInventory.reduce((sum, item) => sum + item.remaining, 0);
}

function RewardResult({ campaign }: Readonly<{ campaign: LotteryCampaign }>) {
  const entry = campaign.currentEntry;
  if (!entry?.prizeName) return null;
  return <div className="rounded-md border border-warning/25 bg-warning/10 p-3 text-warning"><strong>中奖奖品：{entry.prizeName}</strong>
    <p className="mt-1 text-xs">{entry.prizeType === "balance" ? "余额" : "订阅"}额度 {entry.prizeValue}</p>
    <div className="mt-2 flex items-center gap-2 rounded bg-surface px-2 py-1.5"><code className="min-w-0 flex-1 select-all break-all font-mono text-xs text-foreground">{entry.redemptionCode ?? rewardStatusLabel(entry.rewardStatus)}</code>{entry.redemptionCode ? <CopyCodeButton code={entry.redemptionCode} /> : null}</div>
  </div>;
}

function ParticipationHistory({ campaign }: Readonly<{ campaign: LotteryCampaign }>) {
  if (campaign.participationMode !== "daily" || !campaign.myEntries.length) return null;
  return <section aria-labelledby="lottery-participation-history" className="mt-5 border-t border-border pt-5"><h3 id="lottery-participation-history" className="text-sm font-semibold">参与记录</h3>
    <ul className="mt-3 divide-y divide-border border-y border-border">{campaign.myEntries.map((entry) => <li key={entry.id} className="py-3 text-xs">
      <div className="flex items-center justify-between gap-3"><span className="text-muted">{formatDate(entry.createdAt)}</span><EntryStatus status={entry.status} /></div>
      {entry.prizeName ? <div className="mt-2"><p className="font-medium text-warning">{entry.prizeName}</p><div className="mt-1 flex items-center gap-2"><code className="min-w-0 flex-1 select-all break-all font-mono text-foreground">{entry.redemptionCode ?? rewardStatusLabel(entry.rewardStatus)}</code>{entry.redemptionCode ? <CopyCodeButton code={entry.redemptionCode} /> : null}</div></div> : null}
    </li>)}</ul>
  </section>;
}

function ResultReveal({ result, campaign, onClose }: Readonly<{ result: "won" | "lost"; campaign: LotteryCampaign | null; onClose: () => void }>) { const won = result === "won"; const entry = campaign?.currentEntry; return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent className="w-[min(92vw,440px)] p-6 text-center"><span className={`mx-auto flex size-16 items-center justify-center rounded-full ${won ? "bg-warning/10 text-warning" : "bg-primary/10 text-primary-strong"}`}>{won ? <Trophy className="size-8" /> : <Sparkles className="size-8" />}</span><DialogTitle className="mt-4 text-2xl font-semibold">{won ? "恭喜中奖" : "感谢参与"}</DialogTitle><DialogDescription className="mt-2 text-sm text-muted">{won ? `你获得了「${entry?.prizeName || "活动奖品"}」` : "本次未中奖，期待下次好运"}</DialogDescription>{won && entry ? <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-surface-muted px-3 py-2"><code className="min-w-0 flex-1 select-all break-all font-mono text-sm">{entry.redemptionCode ?? rewardStatusLabel(entry.rewardStatus)}</code>{entry.redemptionCode ? <CopyCodeButton code={entry.redemptionCode} /> : null}</div> : null}<Button type="button" className="mt-6 w-full" autoFocus onClick={onClose}>查看活动详情</Button></DialogContent></Dialog>; }
function Status({ status }: Readonly<{ status: LotteryCampaign["status"] }>) { const labels = { scheduled: "待开始", open: "参与中", closed: "报名已结束", drawing: "开奖处理中", drawn: "已开奖", exhausted: "奖品已抽完", cancelled: "已取消" }; return <span className="shrink-0 rounded-md border border-border bg-surface-muted px-2 py-1 text-xs font-semibold text-muted">{labels[status]}</span>; }
function EntryStatus({ status }: Readonly<{ status: NonNullable<LotteryCampaign["currentEntry"]>["status"] }>) { const won = status === "won"; const Icon = won ? Trophy : status === "not_won" || status === "withdrawn" ? XCircle : Clock3; return <span className={`inline-flex items-center gap-1 font-medium ${won ? "text-warning" : "text-muted"}`}><Icon className="size-4" />{{ entered: "已报名", won: "已中奖", not_won: "未中奖", withdrawn: "已撤回" }[status]}</span>; }
function CopyCodeButton({ code }: Readonly<{ code: string }>) { return <Button type="button" variant="ghost" size="icon-sm" className="shrink-0" aria-label="复制兑换码" title="复制兑换码" onClick={() => void copyCode(code)}><Copy className="size-4" /></Button>; }
async function runEntryAction(input: Readonly<{ campaignId: string; token: string; method: "POST" | "DELETE"; setPending: (value: "POST" | "DELETE" | null) => void; setError: (value: string) => void }>) { input.setPending(input.method); input.setError(""); try { await embedRequestJson(`/api/embed/lottery/campaigns/${input.campaignId}/entries`, input.token, { method: input.method }); return await embedRequestJson<LotteryCampaign>(`/api/embed/lottery/campaigns/${input.campaignId}`, input.token); } catch (error) { input.setError(message(error)); return null; } finally { input.setPending(null); } }
function entryActionLabel(campaign: LotteryCampaign) { if (campaign.status === "exhausted") return "奖品已抽完"; if (campaign.currentEntry && campaign.currentEntry.status !== "withdrawn") return campaign.participationMode === "daily" ? (campaign.drawMode === "instant" ? "今日已参与" : "今日已报名") : (campaign.drawMode === "instant" ? "已参与抽奖" : "已报名"); return campaign.drawMode === "instant" ? "立即抽奖" : "报名抽奖"; }
function rewardStatusLabel(status: NonNullable<LotteryCampaign["currentEntry"]>["rewardStatus"]) { return status === "retryable_failed" ? "奖励发放失败，系统正在重试" : "奖励发放中"; }
async function copyCode(code: string) { try { await navigator.clipboard.writeText(code); toast.success("兑换码已复制"); } catch (error) { toast.error(message(error)); } }
function message(error: unknown) { return error instanceof Error ? error.message : String(error); }
function formatDate(value: string) { return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
