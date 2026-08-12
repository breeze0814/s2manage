"use client";

import Link from "next/link";
import { Activity, ArrowRight, Database, Layers3, Loader2, RefreshCw, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Tag } from "../ui/tag";
import { RateChangePanel, type RateChange } from "./rate-change-panel";

type Site = { readonly id: number; readonly name: string; readonly balance: number | null; readonly todayConsume: number | null; readonly historyRecharge: number | null; readonly balanceAlertThreshold: number | null; readonly enabled: boolean; readonly lastStatus: string | null; readonly lastSuccessAt: string | null };
type Group = { readonly id: number; readonly name: string; readonly platform?: string | null; readonly rule: { readonly enabled: boolean }; readonly bindings: readonly unknown[] };
type Rate = { readonly sourceSiteId: number; readonly groupId: string; readonly effectiveRate: number };
type WorkerRun = { readonly status: string; readonly collectedSources: number; readonly failedSources: number; readonly appliedGroups: number; readonly failedGroups: number; readonly startedAt: string; readonly finishedAt: string | null };
type DashboardData = {
  readonly sites: readonly Site[];
  readonly groups: readonly Group[];
  readonly rates: readonly Rate[];
  readonly changes: readonly RateChange[];
  readonly run: WorkerRun | null;
  readonly workerConnected: boolean;
};

export function HomeDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const load = () => void loadDashboard({ setData, setLoading });
  useEffect(load, []);
  return (
    <section className="page-stack">
      <Header loading={loading} onRefresh={load} />
      {loading && !data ? <Loading /> : data ? <DashboardContent data={data} /> : null}
    </section>
  );
}

function Header({ loading, onRefresh }: Readonly<{ loading: boolean; onRefresh: () => void }>) {
  return (
    <header className="page-header">
      <div>
        <h1 className="page-heading">系统概览</h1>
        <p className="page-description">采集站、目标分组、倍率变化与 Worker 运行状态</p>
      </div>
      <Button type="button" variant="secondary" onClick={onRefresh} disabled={loading} className="self-start lg:self-auto">
        {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
        刷新数据
      </Button>
    </header>
  );
}

function DashboardContent({ data }: Readonly<{ data: DashboardData }>) {
  const enabledSites = data.sites.filter((site) => site.enabled).length;
  const enabledRules = data.groups.filter((group) => group.rule.enabled).length;
  const failures = data.sites.filter((site) => site.lastStatus === "failed" || site.lastStatus === "partial").length;
  const lowBalanceSites = data.sites.filter((site) => site.balance !== null && site.balanceAlertThreshold !== null && site.balance <= site.balanceAlertThreshold);
  const totalBalance = data.sites.reduce((total, site) => total + (site.balance ?? 0), 0);
  const totalTodayConsume = data.sites.reduce((total, site) => total + (site.todayConsume ?? 0), 0);
  return (
    <>
      <AlertBanner data={data} failedSites={failures} lowBalanceSites={lowBalanceSites.length} />
      <div className="dashboard-split overview-priority-grid">
        <div className="grid gap-5 lg:sticky sticky-below-header">
          <RiskSummary data={data} failedSites={failures} lowBalanceSites={lowBalanceSites.length} />
          <WorkerOverview run={data.run} connected={data.workerConnected} />
        </div>
        <div className="grid gap-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric href="/sources" icon={<Database />} label="采集站" value={data.sites.length} detail={`启用 ${enabledSites}`} tone="blue" />
            <Metric href="/sources#source-sites" icon={<WalletCards />} label="采集站总余额" value={formatBalance(totalBalance)} valueClassName="text-balance-value" detail={`今日消费 ${formatBalance(totalTodayConsume)}`} tone="emerald" />
            <Metric href="/groups" icon={<Layers3 />} label="目标分组" value={data.groups.length} detail={`启用规则 ${enabledRules}`} tone="violet" />
            <Metric href={failures ? "/logs" : "/sources"} icon={<Activity />} label="倍率快照" value={data.rates.length} detail={failures ? `${failures} 个站点异常` : "全部站点正常"} tone={failures ? "red" : "amber"} />
          </div>
          <RateChangePanel changes={data.changes} />
          <SiteBalances sites={data.sites} />
        </div>
      </div>
    </>
  );
}

function AlertBanner({ data, failedSites, lowBalanceSites }: Readonly<{ data: DashboardData; failedSites: number; lowBalanceSites: number }>) {
  return <RiskSummary data={data} failedSites={failedSites} lowBalanceSites={lowBalanceSites} />;
}

function RiskSummary({ data, failedSites, lowBalanceSites }: Readonly<{ data: DashboardData; failedSites: number; lowBalanceSites: number }>) {
  const risks = [
    !data.workerConnected ? { href: "/settings", label: "Worker 未连接", detail: "自动采集与应用可能已停止", tone: "warning" as const } : null,
    failedSites > 0 ? { href: "/sources", label: `${failedSites} 个采集站异常`, detail: "最近一次运行存在接口异常", tone: "danger" as const } : null,
    lowBalanceSites > 0 ? { href: "/sources", label: `${lowBalanceSites} 个采集站余额偏低`, detail: "余额已低于告警阈值", tone: "warning" as const } : null,
    data.run && (data.run.status === "failed" || data.run.status === "partial") ? { href: "/logs", label: `Worker ${data.run.status}`, detail: "最近周期未完整完成", tone: "danger" as const } : null,
    data.run && data.run.failedGroups > 0 ? { href: "/groups", label: `${data.run.failedGroups} 个分组应用失败`, detail: "需要检查目标分组规则", tone: "danger" as const } : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);
  return (
    <section className="panel overflow-hidden" aria-labelledby="risk-summary-title">
      <div className="panel-header"><div><h2 id="risk-summary-title" className="panel-title">需要关注</h2><p className="panel-description">优先处理会影响采集或倍率应用的状态。</p></div><Tag tone={risks.length ? "warning" : "success"}>{risks.length ? `${risks.length} 项` : "无异常"}</Tag></div>
      {risks.length ? <div className="risk-queue">{risks.map((risk) => <Link key={risk.label} href={risk.href} className="risk-queue-item"><span className={`mt-1 size-2 shrink-0 rounded-full ${risk.tone === "danger" ? "bg-danger" : "bg-warning"}`} aria-hidden="true" /><span className="min-w-0"><span className="block truncate text-sm font-medium">{risk.label}</span><span className="mt-0.5 block text-xs text-muted">{risk.detail}</span></span><ArrowRightIcon /></Link>)}</div> : <p className="px-4 py-5 text-sm text-muted">当前没有需要立即处理的风险。</p>}
    </section>
  );
}

function ArrowRightIcon() {
  return <ArrowRight aria-hidden="true" className="ml-auto size-4 shrink-0 text-muted" />;
}

function Metric({ href, icon, label, value, valueClassName = "", detail, tone }: Readonly<{
  href: string;
  icon: React.ReactNode;
  label: string;
  value: string | number;
  valueClassName?: string;
  detail: string;
  tone: MetricTone;
}>) {
  const style = METRIC_TONES[tone];
  return (
    <Link href={href} className="metric-card block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" style={{ ["--metric-accent" as string]: style.accent }}>
      <div className="flex items-start justify-between gap-3 pl-1">
        <div>
          <p className="text-sm text-muted">{label}</p>
          <p className={`mt-1.5 font-mono text-2xl font-semibold tabular-nums ${valueClassName}`}>{value}</p>
        </div>
        <span className={`flex size-9 items-center justify-center rounded-lg bg-surface-muted [&>svg]:size-4 ${style.icon}`}>{icon}</span>
      </div>
      <p className={`mt-2.5 pl-1 text-xs font-medium ${style.detail}`}>{detail}</p>
    </Link>
  );
}

function SiteBalances({ sites }: Readonly<{ sites: readonly Site[] }>) {
  return (
    <section className="panel overflow-hidden">
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <WalletCards className="size-4 text-balance-value" />
          <h2 className="panel-title">采集站状态与余额</h2>
        </div>
        <Tag>{sites.length} 个站点</Tag>
      </div>
      <div className="max-h-[min(22rem,40dvh)] divide-y divide-border overflow-y-auto xl:max-h-[min(28rem,46dvh)] 2xl:max-h-[min(32rem,50dvh)]">
        {sites.length === 0 ? (
          <p className="p-4 text-sm text-muted">尚未添加采集站。</p>
        ) : (
          sites.map((site) => (
            <div key={site.id} className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-surface-muted/60">
              <div className="flex min-w-0 items-center gap-2">
                <span className={`size-2 shrink-0 rounded-full ${siteStatusClass(site)}`} />
                <span className="truncate text-sm">{site.name}</span>
              </div>
              <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-balance-value">
                {site.balance === null ? "—" : formatBalance(site.balance)}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function siteStatusClass(site: Site) {
  if (site.lastStatus === "failed") return "bg-danger";
  if (site.lastStatus === "partial") return "bg-warning";
  return site.enabled ? "bg-success" : "bg-muted";
}

function WorkerOverview({ run, connected }: Readonly<{ run: WorkerRun | null; connected: boolean }>) {
  return (
    <section className="panel overflow-hidden">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Worker 最近运行</h2>
          <p className="panel-description">最近一个持久化执行周期。</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Tag tone={connected ? "success" : "warning"}>{connected ? "已连接" : "未连接"}</Tag>
          {run ? <Tag tone={run.status === "success" ? "success" : run.status === "failed" ? "danger" : "warning"}>{run.status}</Tag> : null}
        </div>
      </div>
      {run ? (
        <dl className="grid grid-cols-2 gap-3 p-4 sm:p-5">
          <Stat label="采集成功" value={run.collectedSources} />
          <Stat label="采集失败" value={run.failedSources} />
          <Stat label="应用分组" value={run.appliedGroups} />
          <Stat label="分组失败" value={run.failedGroups} />
          <div className="col-span-2 border-t border-border pt-3">
            <dt className="text-xs text-muted">开始时间</dt>
            <dd className="mt-1 text-sm">{formatTime(run.startedAt)}</dd>
          </div>
        </dl>
      ) : (
        <p className="p-5 text-sm text-muted">暂无 Worker 运行记录。</p>
      )}
    </section>
  );
}

function Stat({ label, value }: Readonly<{ label: string; value: number }>) {
  return (
    <div className="border-l-2 border-primary/25 pl-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 font-mono text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function Loading() {
  return (
    <div className="loading-state">
      <Loader2 className="size-4 animate-spin" />
      正在读取系统数据...
    </div>
  );
}

function formatTime(value: string) {
  return new Date(value).toLocaleString("zh-CN");
}

function formatBalance(value: number) {
  return Number(value.toFixed(4)).toLocaleString("zh-CN", { maximumFractionDigits: 4 });
}

const METRIC_TONES = {
  blue: { icon: "text-info", detail: "text-info", accent: "var(--info)" },
  emerald: { icon: "text-success", detail: "text-success", accent: "var(--success)" },
  violet: { icon: "text-effective-rate", detail: "text-effective-rate", accent: "var(--effective-rate)" },
  amber: { icon: "text-warning", detail: "text-warning", accent: "var(--warning)" },
  red: { icon: "text-danger", detail: "text-danger", accent: "var(--danger)" },
} as const;
type MetricTone = keyof typeof METRIC_TONES;

async function loadDashboard(input: { setData: (value: DashboardData) => void; setLoading: (value: boolean) => void }) {
  input.setLoading(true);
  try {
    const [sites, groups, rates, changes, worker] = await Promise.all([
      api<{ sites: Site[] }>("/api/sources"),
      api<{ groups: Group[] }>("/api/groups"),
      api<{ rates: Rate[] }>("/api/sources/rates"),
      api<{ changes: RateChange[] }>("/api/sources/changes"),
      api<{ run: WorkerRun | null; connection?: { connected?: boolean } }>("/api/worker/status"),
    ]);
    input.setData({
      sites: sites.sites,
      groups: groups.groups,
      rates: rates.rates,
      changes: changes.changes,
      run: worker.run,
      workerConnected: worker.connection?.connected === true,
    });
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error));
  } finally {
    input.setLoading(false);
  }
}

async function api<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `请求失败 HTTP ${response.status}`);
  return body;
}
