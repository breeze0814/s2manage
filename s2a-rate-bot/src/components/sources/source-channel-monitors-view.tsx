"use client";

import { Activity, Clock3, Loader2, RefreshCw, Timer, Wifi } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../ui/button";
import { Tag, type TagTone } from "../ui/tag";
import type { SourceChannelMonitor, SourceChannelMonitorPoint, SourceSiteView } from "./types";

export function SourceChannelMonitorsView({ site }: Readonly<{ site: SourceSiteView }>) {
  const [monitors, setMonitors] = useState<SourceChannelMonitor[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const requestVersion = useRef(0);

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError(null);
    try {
      const next = await loadChannelMonitors(site.id);
      if (version !== requestVersion.current) return;
      setMonitors(next);
      setUpdatedAt(new Date());
    } catch (reason) {
      if (version !== requestVersion.current) return;
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [site]);

  useEffect(() => {
    setMonitors([]);
    setUpdatedAt(null);
    void load();
    return () => { requestVersion.current += 1; };
  }, [site, load]);

  return (
    <section className="min-w-0 overflow-hidden">
        <header className="shrink-0 border-b border-border bg-surface-muted/30 px-5 py-4 sm:px-6 sm:py-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Activity className="size-5 text-primary" />{site.name}</h2>
          <p className="mt-1 truncate text-sm leading-6 text-muted" title={site.baseUrl}>{site.baseUrl}</p>
        </header>

        <div className="flex min-h-0 flex-1 flex-col bg-background/40">
          <div className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2.5 sm:px-6">
            <div className="flex flex-wrap items-center gap-2">
              <Tag tone="info">{monitors.length} 个渠道</Tag>
              <span className="text-xs text-muted">{updatedAt ? `更新于 ${formatTime(updatedAt.toISOString())}` : "Asia/Shanghai"}</span>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              刷新监控
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
            {loading && monitors.length === 0 ? <MonitorLoading /> : error ? <MonitorError message={error} onRetry={() => void load()} /> : monitors.length ? (
              <div className="grid gap-4 xl:grid-cols-2">
                {monitors.map((monitor) => <MonitorCard key={monitor.id} monitor={monitor} />)}
              </div>
            ) : <MonitorEmpty />}
          </div>
        </div>

    </section>
  );
}

function MonitorCard({ monitor }: Readonly<{ monitor: SourceChannelMonitor }>) {
  const state = monitorState(monitor.primaryStatus);
  const points = chronologicalPoints(monitor.timeline);
  return (
    <article className="min-w-0 overflow-hidden rounded-lg border border-border bg-surface shadow-panel">
      <div className="flex min-h-20 flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="max-w-full truncate text-sm font-semibold" title={monitor.name}>{monitor.name}</h3>
            <Tag tone={state.tone}>{state.label}</Tag>
          </div>
          <p className="mt-1 truncate text-xs text-muted" title={[monitor.provider, monitor.primaryModel, monitor.groupName].filter(Boolean).join(" · ")}>{[monitor.provider, monitor.primaryModel, monitor.groupName].filter(Boolean).join(" · ") || `渠道 #${monitor.id}`}</p>
        </div>
        <span className="shrink-0 font-mono text-xs tabular-nums text-muted">#{monitor.id}</span>
      </div>

      <dl className="grid grid-cols-3 divide-x divide-border border-b border-border bg-surface-muted/25">
        <MonitorMetric icon={<Clock3 className="size-3.5" />} label="7日可用率" value={formatAvailability(monitor.availability7d)} valueClass={availabilityClass(monitor.availability7d)} />
        <MonitorMetric icon={<Timer className="size-3.5" />} label="响应延迟" value={formatLatency(monitor.primaryLatencyMs)} />
        <MonitorMetric icon={<Wifi className="size-3.5" />} label="网络延迟" value={formatLatency(monitor.primaryPingLatencyMs)} />
      </dl>

      <div className="px-3 pb-3 pt-4 sm:px-5 sm:pb-4">
        <div className="mb-2 flex items-center justify-between gap-3 px-1">
          <span className="text-xs font-medium text-muted">响应延迟</span>
          <span className="font-mono text-[11px] tabular-nums text-muted">{points.length ? `${formatShortTime(points[0]!.checkedAt)} - ${formatShortTime(points.at(-1)!.checkedAt)}` : "暂无时间线"}</span>
        </div>
        <LatencyChart points={points} name={monitor.name} />
      </div>
    </article>
  );
}

function MonitorMetric({ icon, label, value, valueClass = "text-foreground" }: Readonly<{ icon: React.ReactNode; label: string; value: string; valueClass?: string }>) {
  return (
    <div className="min-w-0 px-2 py-3 text-center sm:px-4">
      <dt className="flex items-center justify-center gap-1 text-[11px] text-muted">{icon}<span className="truncate">{label}</span></dt>
      <dd title={value} className={`mt-1 truncate font-mono text-sm font-semibold tabular-nums ${valueClass}`}>{value}</dd>
    </div>
  );
}

function LatencyChart({ points, name }: Readonly<{ points: readonly SourceChannelMonitorPoint[]; name: string }>) {
  const available = points.filter((point): point is SourceChannelMonitorPoint & { latencyMs: number } => point.latencyMs !== null && Number.isFinite(point.latencyMs));
  if (available.length === 0) return <div className="flex h-44 items-center justify-center rounded-md border border-dashed border-border bg-surface-muted/30 text-xs text-muted">暂无延迟数据</div>;

  const width = 680;
  const height = 176;
  const plot = { left: 44, right: 12, top: 12, bottom: 27 };
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = height - plot.top - plot.bottom;
  const maximum = niceMaximum(Math.max(...available.map((point) => point.latencyMs)));
  const x = (point: SourceChannelMonitorPoint) => plot.left + (points.length === 1 ? plotWidth / 2 : (points.indexOf(point) / (points.length - 1)) * plotWidth);
  const y = (value: number) => plot.top + plotHeight - (value / maximum) * plotHeight;
  const line = available.map((point) => `${x(point)},${y(point.latencyMs)}`).join(" ");
  const levels = [maximum, maximum / 2, 0];

  return (
    <div className="h-44 w-full overflow-hidden rounded-md border border-border bg-background/55">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" role="img" aria-label={`${name} 响应延迟趋势图`}>
        <title>{name} 响应延迟趋势</title>
        {levels.map((level) => {
          const gridY = y(level);
          return <g key={level}><line x1={plot.left} x2={width - plot.right} y1={gridY} y2={gridY} stroke="rgb(var(--border))" strokeWidth="1" /><text x={plot.left - 7} y={gridY + 4} textAnchor="end" fill="rgb(var(--foreground-muted))" fontSize="10">{compactLatency(level)}</text></g>;
        })}
        <polyline points={line} fill="none" stroke="rgb(var(--primary))" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {available.map((point, index) => (
          <circle key={`${point.checkedAt}-${index}`} cx={x(point)} cy={y(point.latencyMs)} r="3.5" fill={statusColor(point.status)} stroke="rgb(var(--surface))" strokeWidth="1.5">
            <title>{`${formatTime(point.checkedAt)} · ${formatLatency(point.latencyMs)} · ${monitorState(point.status).label}`}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}

function chronologicalPoints(points: readonly SourceChannelMonitorPoint[]) {
  return [...points].filter((point) => !Number.isNaN(Date.parse(point.checkedAt))).sort((left, right) => Date.parse(left.checkedAt) - Date.parse(right.checkedAt));
}

function monitorState(status: string): { label: string; tone: TagTone } {
  if (status === "operational") return { label: "正常", tone: "success" };
  if (status === "degraded") return { label: "降级", tone: "warning" };
  if (status === "error") return { label: "异常", tone: "danger" };
  return { label: status || "未知", tone: "neutral" };
}

function statusColor(status: string) {
  const tone = monitorState(status).tone;
  if (tone === "success") return "rgb(var(--success))";
  if (tone === "warning") return "rgb(var(--warning))";
  if (tone === "danger") return "rgb(var(--danger))";
  return "rgb(var(--foreground-muted))";
}

function availabilityClass(value: number | null) {
  if (value === null) return "text-muted";
  if (value >= 99) return "text-success";
  if (value >= 90) return "text-warning";
  return "text-danger";
}

function formatAvailability(value: number | null) { return value === null ? "-" : `${Math.max(0, Math.min(100, value)).toFixed(2)}%`; }
function formatLatency(value: number | null) { return value === null ? "-" : `${Math.round(value).toLocaleString("zh-CN")} ms`; }
function compactLatency(value: number) { return value >= 1_000 ? `${Number((value / 1_000).toFixed(1))}s` : `${Math.round(value)}`; }
function niceMaximum(value: number) { const padded = Math.max(100, value * 1.12); const magnitude = 10 ** Math.floor(Math.log10(padded)); return Math.ceil(padded / magnitude) * magnitude; }
function formatTime(value: string) { return new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }); }
function formatShortTime(value: string) { return new Date(value).toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false }); }

function MonitorLoading() { return <div className="loading-state min-h-60"><Loader2 className="size-4 animate-spin" />正在读取渠道监控...</div>; }
function MonitorEmpty() { return <div className="empty-state-inline min-h-52 rounded-lg border border-dashed border-border bg-surface-muted/40"><Activity className="size-5 text-muted" /><p className="mt-2">该站点暂无渠道监控数据。</p></div>; }
function MonitorError({ message, onRetry }: Readonly<{ message: string; onRetry: () => void }>) { return <div className="flex min-h-52 flex-col items-center justify-center gap-3 rounded-lg border border-danger/25 bg-danger/10 px-5 text-center text-sm text-danger"><p>{message}</p><Button type="button" variant="secondary" size="sm" onClick={onRetry}><RefreshCw className="size-3.5" />重新请求</Button></div>; }

async function loadChannelMonitors(siteId: number) {
  const response = await fetch(`/api/sources/${siteId}/channel-monitors`, { cache: "no-store" });
  const body = await response.json() as { monitors?: SourceChannelMonitor[]; error?: string };
  if (!response.ok) throw new Error(body.error ?? `请求失败 HTTP ${response.status}`);
  if (!Array.isArray(body.monitors)) throw new Error("渠道监控响应无效");
  return body.monitors;
}
