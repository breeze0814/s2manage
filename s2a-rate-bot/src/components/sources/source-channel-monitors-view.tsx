"use client";

import { Activity, Gauge, Globe2, Loader2, Radio, RefreshCw } from "lucide-react";
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
        <header className="flex min-w-0 shrink-0 flex-wrap items-center justify-between gap-x-5 gap-y-1 border-b border-border bg-surface-muted/30 px-4 py-3 sm:px-5">
          <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold"><Activity className="size-4 shrink-0 text-primary" /><span className="truncate">{site.name}</span></h2>
          <p className="max-w-full truncate font-mono text-xs text-muted" title={site.baseUrl}>{site.baseUrl}</p>
        </header>

        <div className="flex min-h-0 flex-1 flex-col bg-background/40">
          <div className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2 sm:px-5">
            <div className="flex flex-wrap items-center gap-2">
              <Tag tone="info">{monitors.length} 个渠道</Tag>
              <span className="text-xs text-muted">{updatedAt ? `更新于 ${formatTime(updatedAt.toISOString())}` : "Asia/Shanghai"}</span>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              刷新监控
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
            {loading && monitors.length === 0 ? <MonitorLoading /> : error ? <MonitorError message={error} onRetry={() => void load()} /> : monitors.length ? (
              <div className="grid gap-3 lg:grid-cols-2">
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
  const visiblePointCount = Math.min(points.length, 60);
  return (
    <article className="monitor-card" aria-labelledby={`monitor-${monitor.id}-title`}>
      <div className="monitor-card-identity">
        <div className="monitor-card-mark" aria-hidden="true"><Radio className="size-6" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 id={`monitor-${monitor.id}-title`} className="min-w-0 truncate text-lg font-semibold" title={monitor.name}>{monitor.name}</h3>
            {monitor.provider ? <Tag tone="primary">{monitor.provider}</Tag> : null}
          </div>
          <p className="mt-1 truncate font-mono text-sm text-muted" title={[monitor.primaryModel, monitor.groupName].filter(Boolean).join(" · ")}>{[monitor.primaryModel, monitor.groupName].filter(Boolean).join(" · ") || `渠道 #${monitor.id}`}</p>
        </div>
        <Tag tone={state.tone} className="h-8 px-3 text-sm">{state.label}</Tag>
      </div>

      <dl className="monitor-metrics">
        <MonitorMetric icon={<Gauge />} label="对话延迟" value={formatLatency(monitor.primaryLatencyMs)} />
        <MonitorMetric icon={<Globe2 />} label="端点 PING" value={formatLatency(monitor.primaryPingLatencyMs)} />
        <div className="monitor-availability"><dt className="monitor-section-label">7 天可用性</dt><dd className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${availabilityClass(monitor.availability7d)}`}>{formatAvailability(monitor.availability7d)}</dd></div>
      </dl>

      <div className="monitor-history" aria-label={`${monitor.name} 最近 ${visiblePointCount} 次监控记录`}>
        <div className="flex items-center justify-between gap-3"><span className="monitor-section-label">近 {visiblePointCount} 次记录</span><span className="font-mono text-[11px] text-muted">{points.length ? `${formatShortTime(points[0]!.checkedAt)} 更新` : "暂无记录"}</span></div>
        <StatusBars points={points} />
      </div>
    </article>
  );
}

function MonitorMetric({ icon, label, value, valueClass = "text-foreground" }: Readonly<{ icon: React.ReactNode; label: string; value: string; valueClass?: string }>) {
  return (
    <div className="monitor-metric">
      <dt className="flex items-center gap-2 text-sm font-medium text-muted">{icon}<span className="truncate">{label}</span></dt>
      <dd title={value} className={`mt-1 truncate font-mono text-2xl font-semibold tabular-nums ${valueClass}`}>{value}{value !== "—" ? <span className="ml-1 text-xs font-medium text-muted">ms</span> : null}</dd>
    </div>
  );
}

function StatusBars({ points }: Readonly<{ points: readonly SourceChannelMonitorPoint[] }>) {
  const visiblePoints = points.slice(-60);
  if (!visiblePoints.length) return <div className="monitor-history-empty">暂无历史记录</div>;
  return <div className="monitor-status-bars">{visiblePoints.map((point, index) => <span key={`${point.checkedAt}-${index}`} className={statusBarClass(point.status)} title={`${formatTime(point.checkedAt)} · ${monitorState(point.status).label}${point.latencyMs === null ? "" : ` · ${formatLatency(point.latencyMs)}`}`} />)}</div>;
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

function statusBarClass(status: string) {
  const tone = monitorState(status).tone;
  if (tone === "success") return "monitor-status-bar-success";
  if (tone === "warning") return "monitor-status-bar-warning";
  if (tone === "danger") return "monitor-status-bar-danger";
  return "monitor-status-bar-neutral";
}

function availabilityClass(value: number | null) {
  if (value === null) return "text-muted";
  if (value >= 99) return "text-success";
  if (value >= 90) return "text-warning";
  return "text-danger";
}

function formatAvailability(value: number | null) { return value === null ? "—" : `${Math.max(0, Math.min(100, value)).toFixed(2)}%`; }
function formatLatency(value: number | null) { return value === null ? "—" : Math.round(value).toLocaleString("zh-CN"); }
function formatTime(value: string) { return new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }); }
function formatShortTime(value: string) { return new Date(value).toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false }); }

function MonitorLoading() { return <div className="loading-state min-h-44"><Loader2 className="size-4 animate-spin" />正在读取渠道监控...</div>; }
function MonitorEmpty() { return <div className="empty-state-inline min-h-40 rounded-lg border border-dashed border-border bg-surface-muted/40"><Activity className="size-5 text-muted" /><p className="mt-2">该站点暂无渠道监控数据。</p></div>; }
function MonitorError({ message, onRetry }: Readonly<{ message: string; onRetry: () => void }>) { return <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border border-danger/25 bg-danger/10 px-5 text-center text-sm text-danger"><p>{message}</p><Button type="button" variant="secondary" size="sm" onClick={onRetry}><RefreshCw className="size-3.5" />重新请求</Button></div>; }

async function loadChannelMonitors(siteId: number) {
  const response = await fetch(`/api/sources/${siteId}/channel-monitors`, { cache: "no-store" });
  const body = await response.json() as { monitors?: SourceChannelMonitor[]; error?: string };
  if (!response.ok) throw new Error(body.error ?? `请求失败 HTTP ${response.status}`);
  if (!Array.isArray(body.monitors)) throw new Error("渠道监控响应无效");
  return body.monitors;
}
