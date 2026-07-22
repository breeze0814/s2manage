"use client";

import { Activity, Database, Layers3, Loader2, RefreshCw, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Tag } from "../ui/tag";
import { RateChangePanel, type RateChange } from "./rate-change-panel";

type Site = { readonly id: number; readonly name: string; readonly balance: number | null; readonly enabled: boolean; readonly lastStatus: string | null; readonly lastSuccessAt: string | null };
type Group = { readonly id: number; readonly name: string; readonly platform?: string | null; readonly rule: { readonly enabled: boolean }; readonly bindings: readonly unknown[] };
type Rate = { readonly sourceSiteId: number; readonly groupId: string; readonly effectiveRate: number };
type WorkerRun = { readonly status: string; readonly collectedSources: number; readonly failedSources: number; readonly appliedGroups: number; readonly failedGroups: number; readonly startedAt: string; readonly finishedAt: string | null };
type DashboardData = { readonly sites: readonly Site[]; readonly groups: readonly Group[]; readonly rates: readonly Rate[]; readonly changes: readonly RateChange[]; readonly run: WorkerRun | null };

export function HomeDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const load = () => void loadDashboard({ setData, setLoading });
  useEffect(load, []);
  return <section className="page-stack"><Header loading={loading} onRefresh={load} />{loading && !data ? <Loading /> : data ? <DashboardContent data={data} /> : null}</section>;
}

function Header({ loading, onRefresh }: Readonly<{ loading: boolean; onRefresh: () => void }>) { return <header className="page-header"><div><h1 className="page-heading">系统概览</h1><p className="page-description">采集站、目标分组、倍率变化与 Worker 运行状态</p></div><button type="button" onClick={onRefresh} disabled={loading} className="secondary-button self-start lg:self-auto">{loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}刷新数据</button></header>; }

function DashboardContent({ data }: Readonly<{ data: DashboardData }>) {
  const enabledSites = data.sites.filter((site) => site.enabled).length;
  const enabledRules = data.groups.filter((group) => group.rule.enabled).length;
  const failures = data.sites.filter((site) => site.lastStatus === "failed").length;
  const totalBalance = data.sites.reduce((total, site) => total + (site.balance ?? 0), 0);
  return <><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric icon={<Database />} label="采集站" value={data.sites.length} detail={`启用 ${enabledSites}`} tone="blue" /><Metric icon={<WalletCards />} label="采集站总余额" value={formatBalance(totalBalance)} valueClassName="text-balance-value" detail={`${data.sites.filter((site) => site.balance !== null).length} 个站点已采集`} tone="emerald" /><Metric icon={<Layers3 />} label="目标分组" value={data.groups.length} detail={`启用规则 ${enabledRules}`} tone="violet" /><Metric icon={<Activity />} label="倍率快照" value={data.rates.length} detail={failures ? `${failures} 个站点异常` : "全部站点正常"} tone={failures ? "red" : "amber"} /></div><div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(340px,0.75fr)]"><RateChangePanel changes={data.changes} /><div className="grid gap-5"><WorkerOverview run={data.run} /><SiteBalances sites={data.sites} /></div></div></>;
}

function Metric({ icon, label, value, valueClassName = "", detail, tone }: Readonly<{ icon: React.ReactNode; label: string; value: string | number; valueClassName?: string; detail: string; tone: MetricTone }>) { const style = METRIC_TONES[tone]; return <article className="rounded-lg border border-border bg-surface p-4 shadow-sm transition-colors hover:border-primary/30"><div className="flex items-start justify-between gap-3"><div><p className="text-sm text-muted">{label}</p><p className={`mt-1.5 font-mono text-2xl font-semibold tabular-nums ${valueClassName}`}>{value}</p></div><span className={`flex size-9 items-center justify-center rounded-md bg-surface-muted [&>svg]:size-4 ${style.icon}`}>{icon}</span></div><p className={`mt-2 text-xs font-medium ${style.detail}`}>{detail}</p></article>; }

function SiteBalances({ sites }: Readonly<{ sites: readonly Site[] }>) { return <section className="panel overflow-hidden"><div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3"><div className="flex items-center gap-2"><WalletCards className="size-4 text-balance-value" /><h2 className="text-sm font-semibold">采集站状态与余额</h2></div><Tag>{sites.length} 个站点</Tag></div><div className="divide-y divide-border">{sites.length === 0 ? <p className="p-4 text-sm text-muted">尚未添加采集站。</p> : sites.map((site) => <div key={site.id} className="flex items-center justify-between gap-3 px-4 py-2.5"><div className="flex min-w-0 items-center gap-2"><span className={`size-2 shrink-0 rounded-full ${siteStatusClass(site)}`} /><span className="truncate text-sm">{site.name}</span></div><span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-balance-value">{site.balance === null ? "—" : formatBalance(site.balance)}</span></div>)}</div></section>; }

function siteStatusClass(site: Site) { if (site.lastStatus === "failed") return "bg-danger"; return site.enabled ? "bg-success" : "bg-muted"; }

function WorkerOverview({ run }: Readonly<{ run: WorkerRun | null }>) { return <section className="panel overflow-hidden"><div className="panel-header"><div><h2 className="panel-title">Worker 最近运行</h2><p className="panel-description">最近一个持久化执行周期。</p></div>{run ? <Tag tone={run.status === "success" ? "success" : run.status === "failed" ? "danger" : "warning"}>{run.status}</Tag> : null}</div>{run ? <dl className="grid grid-cols-2 gap-3 p-4 sm:p-5"><Stat label="采集成功" value={run.collectedSources} /><Stat label="采集失败" value={run.failedSources} /><Stat label="应用分组" value={run.appliedGroups} /><Stat label="分组失败" value={run.failedGroups} /><div className="col-span-2 border-t border-border pt-3"><dt className="text-xs text-muted">开始时间</dt><dd className="mt-1 text-sm">{formatTime(run.startedAt)}</dd></div></dl> : <p className="p-5 text-sm text-muted">暂无 Worker 运行记录。</p>}</section>; }

function Stat({ label, value }: Readonly<{ label: string; value: number }>) { return <div className="border-l-2 border-primary/20 pl-3"><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 font-mono text-lg font-semibold tabular-nums">{value}</dd></div>; }
function Loading() { return <div className="loading-state"><Loader2 className="size-4 animate-spin" />正在读取系统数据...</div>; }
function formatTime(value: string) { return new Date(value).toLocaleString("zh-CN"); }
function formatBalance(value: number) { return Number(value.toFixed(4)).toLocaleString("zh-CN", { maximumFractionDigits: 4 }); }

const METRIC_TONES = {
  blue: { icon: "text-info", detail: "text-info" },
  emerald: { icon: "text-success", detail: "text-success" },
  violet: { icon: "text-effective-rate", detail: "text-effective-rate" },
  amber: { icon: "text-warning", detail: "text-warning" },
  red: { icon: "text-danger", detail: "text-danger" },
} as const;
type MetricTone = keyof typeof METRIC_TONES;

async function loadDashboard(input: { setData: (value: DashboardData) => void; setLoading: (value: boolean) => void }) { input.setLoading(true); try { const [sites, groups, rates, changes, worker] = await Promise.all([api<{ sites: Site[] }>("/api/sources"), api<{ groups: Group[] }>("/api/groups"), api<{ rates: Rate[] }>("/api/sources/rates"), api<{ changes: RateChange[] }>("/api/sources/changes"), api<{ run: WorkerRun | null }>("/api/worker/status")]); input.setData({ sites: sites.sites, groups: groups.groups, rates: rates.rates, changes: changes.changes, run: worker.run }); } catch (error) { toast.error(error instanceof Error ? error.message : String(error)); } finally { input.setLoading(false); } }
async function api<T>(url: string): Promise<T> { const response = await fetch(url, { cache: "no-store" }); const body = await response.json() as T & { error?: string }; if (!response.ok) throw new Error(body.error ?? `请求失败 HTTP ${response.status}`); return body; }
