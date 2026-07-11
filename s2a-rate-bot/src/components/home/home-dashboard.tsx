"use client";

import { Activity, Database, Layers3, Loader2, RefreshCw, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import { Tag } from "../ui/tag";

type Site = { readonly id: number; readonly name: string; readonly balance: number | null; readonly enabled: boolean; readonly lastStatus: string | null; readonly lastSuccessAt: string | null };
type Group = { readonly id: number; readonly name: string; readonly platform?: string | null; readonly rule: { readonly enabled: boolean }; readonly bindings: readonly unknown[] };
type Rate = { readonly sourceSiteId: number; readonly groupId: string; readonly effectiveRate: number };
type WorkerRun = { readonly status: string; readonly collectedSources: number; readonly failedSources: number; readonly appliedGroups: number; readonly failedGroups: number; readonly startedAt: string; readonly finishedAt: string | null };
type DashboardData = { readonly sites: readonly Site[]; readonly groups: readonly Group[]; readonly rates: readonly Rate[]; readonly run: WorkerRun | null };

export function HomeDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = () => void loadDashboard({ setData, setError, setLoading });
  useEffect(load, []);
  return <section className="page-stack"><Header loading={loading} onRefresh={load} />{error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p> : null}{loading && !data ? <Loading /> : data ? <DashboardContent data={data} /> : null}</section>;
}

function Header({ loading, onRefresh }: Readonly<{ loading: boolean; onRefresh: () => void }>) { return <header className="flex items-start justify-between gap-4"><div><h1 className="page-heading">系统首页</h1><p className="page-description">汇总采集站、目标分组、倍率快照和 Worker 最近运行状态。</p></div><button type="button" aria-label="刷新首页数据" title="刷新首页数据" onClick={onRefresh} disabled={loading} className="icon-button">{loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}</button></header>; }

function DashboardContent({ data }: Readonly<{ data: DashboardData }>) {
  const enabledSites = data.sites.filter((site) => site.enabled).length;
  const enabledRules = data.groups.filter((group) => group.rule.enabled).length;
  const failures = data.sites.filter((site) => site.lastStatus === "failed").length;
  const totalBalance = data.sites.reduce((total, site) => total + (site.balance ?? 0), 0);
  return <><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric icon={<Database />} label="采集站" value={data.sites.length} detail={`启用 ${enabledSites}`} tone="blue" /><Metric icon={<WalletCards />} label="采集站总余额" value={formatBalance(totalBalance)} detail={`${data.sites.filter((site) => site.balance !== null).length} 个站点已采集`} tone="emerald" /><Metric icon={<Layers3 />} label="目标分组" value={data.groups.length} detail={`启用规则 ${enabledRules}`} tone="violet" /><Metric icon={<Activity />} label="倍率快照" value={data.rates.length} detail={failures ? `${failures} 个站点异常` : "全部站点正常"} tone={failures ? "red" : "amber"} /></div><div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]"><SiteOverview sites={data.sites} /><WorkerOverview run={data.run} /></div></>;
}

function Metric({ icon, label, value, detail, tone }: Readonly<{ icon: React.ReactNode; label: string; value: string | number; detail: string; tone: MetricTone }>) { const style = METRIC_TONES[tone]; return <article className={`rounded-2xl border p-4 shadow-sm ${style.card}`}><div className="flex items-center justify-between gap-3"><span className={`flex size-10 items-center justify-center rounded-xl [&>svg]:size-5 ${style.icon}`}>{icon}</span><span className={`rounded-full px-2 py-1 text-xs ${style.detail}`}>{detail}</span></div><p className="mt-4 font-mono text-3xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-sm text-muted">{label}</p></article>; }

function SiteOverview({ sites }: Readonly<{ sites: readonly Site[] }>) { return <section className="panel overflow-hidden"><div className="panel-header"><div><h2 className="font-semibold">采集站状态与余额</h2><p className="mt-1 text-sm text-muted">展示最近采集状态和账户余额。</p></div><Tag>{sites.length} 个站点</Tag></div><div className="divide-y divide-border">{sites.length === 0 ? <p className="p-5 text-sm text-muted">尚未添加采集站。</p> : sites.map((site) => <div key={site.id} className="flex items-center justify-between gap-4 px-4 py-3 sm:px-5"><div className="flex min-w-0 items-center gap-3"><span className={`size-2.5 shrink-0 rounded-full ${site.lastStatus === "failed" ? "bg-red-500" : site.enabled ? "bg-emerald-500" : "bg-stone-400"}`} /><div className="min-w-0"><p className="truncate text-sm font-medium">{site.name}</p><p className="mt-1 text-xs text-muted">{site.lastSuccessAt ? `最近成功 ${formatTime(site.lastSuccessAt)}` : "尚未成功采集"}</p></div></div><div className="flex shrink-0 items-center gap-3"><div className="text-right"><p className="text-xs text-muted">余额</p><p className="mt-0.5 font-mono text-sm font-semibold tabular-nums">{site.balance === null ? "-" : formatBalance(site.balance)}</p></div><Tag tone={site.lastStatus === "failed" ? "danger" : site.enabled ? "success" : "neutral"}>{site.lastStatus === "failed" ? "失败" : site.enabled ? "已启用" : "已停用"}</Tag></div></div>)}</div></section>; }

function WorkerOverview({ run }: Readonly<{ run: WorkerRun | null }>) { return <section className="panel overflow-hidden"><div className="panel-header"><div><h2 className="font-semibold">Worker 最近运行</h2><p className="mt-1 text-sm text-muted">最近一个持久化执行周期。</p></div>{run ? <Tag tone={run.status === "success" ? "success" : run.status === "failed" ? "danger" : "warning"}>{run.status}</Tag> : null}</div>{run ? <dl className="grid grid-cols-2 gap-3 p-4 sm:p-5"><Stat label="采集成功" value={run.collectedSources} /><Stat label="采集失败" value={run.failedSources} /><Stat label="应用分组" value={run.appliedGroups} /><Stat label="分组失败" value={run.failedGroups} /><div className="col-span-2 border-t border-border pt-3"><dt className="text-xs text-muted">开始时间</dt><dd className="mt-1 text-sm">{formatTime(run.startedAt)}</dd></div></dl> : <p className="p-5 text-sm text-muted">暂无 Worker 运行记录。</p>}</section>; }

function Stat({ label, value }: Readonly<{ label: string; value: number }>) { return <div className="rounded-xl bg-surface-muted p-3"><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 font-mono text-lg font-semibold tabular-nums">{value}</dd></div>; }
function Loading() { return <div className="flex items-center gap-2 text-sm text-muted"><Loader2 className="size-4 animate-spin" />正在读取系统数据...</div>; }
function formatTime(value: string) { return new Date(value).toLocaleString("zh-CN"); }
function formatBalance(value: number) { return Number(value.toFixed(4)).toLocaleString("zh-CN", { maximumFractionDigits: 4 }); }

const METRIC_TONES = {
  blue: { card: "border-blue-200 bg-blue-50/80 dark:border-blue-900 dark:bg-blue-950/50", icon: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300", detail: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  emerald: { card: "border-emerald-200 bg-emerald-50/80 dark:border-emerald-900 dark:bg-emerald-950/50", icon: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300", detail: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" },
  violet: { card: "border-violet-200 bg-violet-50/80 dark:border-violet-900 dark:bg-violet-950/50", icon: "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300", detail: "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300" },
  amber: { card: "border-amber-200 bg-amber-50/80 dark:border-amber-900 dark:bg-amber-950/50", icon: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300", detail: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" },
  red: { card: "border-red-200 bg-red-50/80 dark:border-red-900 dark:bg-red-950/50", icon: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300", detail: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
} as const;
type MetricTone = keyof typeof METRIC_TONES;

async function loadDashboard(input: { setData: (value: DashboardData) => void; setError: (value: string) => void; setLoading: (value: boolean) => void }) { input.setLoading(true); input.setError(""); try { const [sites, groups, rates, worker] = await Promise.all([api<{ sites: Site[] }>("/api/sources"), api<{ groups: Group[] }>("/api/groups"), api<{ rates: Rate[] }>("/api/sources/rates"), api<{ run: WorkerRun | null }>("/api/worker/status")]); input.setData({ sites: sites.sites, groups: groups.groups, rates: rates.rates, run: worker.run }); } catch (error) { input.setError(error instanceof Error ? error.message : String(error)); } finally { input.setLoading(false); } }
async function api<T>(url: string): Promise<T> { const response = await fetch(url, { cache: "no-store" }); const body = await response.json() as T & { error?: string }; if (!response.ok) throw new Error(body.error ?? `请求失败 HTTP ${response.status}`); return body; }
