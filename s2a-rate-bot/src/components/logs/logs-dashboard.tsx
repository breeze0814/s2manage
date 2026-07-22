"use client";

import { Activity, Bot, Clock3, Loader2, RefreshCw, ServerCrash } from "lucide-react";
import { useEffect, useState } from "react";
import { Tag } from "../ui/tag";

type LogType = "api" | "worker";
type LogEntry = Record<string, unknown>;
type LogResponse = { readonly type: LogType; readonly file: string; readonly size: number; readonly modifiedAt: string | null; readonly entries: readonly LogEntry[] };

export function LogsDashboard() {
  const [type, setType] = useState<LogType>("api");
  const [data, setData] = useState<LogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = (nextType = type) => void loadLogs({ type: nextType, setData, setLoading, setError });
  useEffect(() => { void loadLogs({ type: "api", setData, setLoading, setError }); }, []);
  const selectType = (value: LogType) => { setType(value); load(value); };
  return (
    <section className="page-stack">
      <Header loading={loading} onRefresh={() => load()} />
      <LogOverview type={type} data={data} onChange={selectType} />
      {error ? <p role="alert" className="rounded-lg border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p> : null}
      {data ? <LogContent data={data} loading={loading} /> : loading ? <Loading /> : null}
    </section>
  );
}

function Header({ loading, onRefresh }: Readonly<{ loading: boolean; onRefresh: () => void }>) {
  return <header className="page-header"><div><h1 className="page-heading">系统日志</h1><p className="page-description">外部 API 调用与 Worker 执行记录</p></div><button type="button" aria-label="刷新业务日志" title="刷新业务日志" onClick={onRefresh} disabled={loading} className="icon-button self-start lg:self-auto">{loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}</button></header>;
}

function LogOverview({ type, data, onChange }: Readonly<{ type: LogType; data: LogResponse | null; onChange: (value: LogType) => void }>) {
  return <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch"><LogTabs type={type} onChange={onChange} />{data ? <SummaryBar data={data} /> : null}</div>;
}

function LogTabs({ type, onChange }: Readonly<{ type: LogType; onChange: (value: LogType) => void }>) {
  return <div className="inline-flex w-fit shrink-0 rounded-lg border border-border bg-surface p-1"><Tab active={type === "api"} icon={<Activity />} label="外部 API" onClick={() => onChange("api")} /><Tab active={type === "worker"} icon={<Bot />} label="Worker" onClick={() => onChange("worker")} /></div>;
}

function Tab({ active, icon, label, onClick }: Readonly<{ active: boolean; icon: React.ReactNode; label: string; onClick: () => void }>) {
  return <button type="button" aria-pressed={active} onClick={onClick} className={`flex min-h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${active ? "bg-primary text-primary-foreground" : "text-muted hover:bg-surface-muted hover:text-foreground"}`}><span className="[&>svg]:size-4">{icon}</span>{label}</button>;
}

function SummaryBar({ data }: Readonly<{ data: LogResponse }>) {
  const failures = failureCount(data.entries);
  return <div className="panel grid flex-1 grid-cols-3 divide-x divide-border overflow-hidden"><Summary icon={<Activity />} label="日志记录" value={data.entries.length} /><Summary icon={<ServerCrash />} label="失败记录" value={failures} danger={failures > 0} /><Summary icon={<Clock3 />} label="最后更新" value={data.modifiedAt ? new Date(data.modifiedAt).toLocaleTimeString("zh-CN") : "-"} /></div>;
}

function Summary({ icon, label, value, danger = false }: Readonly<{ icon: React.ReactNode; label: string; value: string | number; danger?: boolean }>) {
  return <div className="flex min-w-0 items-center gap-2 px-3 py-3 lg:gap-3 lg:px-4"><span className={`${danger ? "text-danger" : "text-muted"} [&>svg]:size-4 lg:[&>svg]:size-5`}>{icon}</span><div className="min-w-0"><p className="truncate font-mono text-lg font-semibold tabular-nums lg:text-xl">{value}</p><p className="truncate text-xs text-muted">{label}</p></div></div>;
}

function LogContent({ data, loading }: Readonly<{ data: LogResponse; loading: boolean }>) {
  return <section className="panel overflow-hidden"><div className="panel-header"><div><h2 className="panel-title">{data.type === "api" ? "外部 API 调用" : "Worker 执行记录"}</h2><p className="panel-description">{data.file} · {formatBytes(data.size)}</p></div>{loading ? <Loader2 className="size-4 animate-spin text-muted" /> : <Tag>{data.entries.length} 条</Tag>}</div>{data.entries.length === 0 ? <p className="empty-state m-4">暂无业务日志记录。</p> : data.type === "api" ? <ApiLogList entries={data.entries} /> : <WorkerLogList entries={data.entries} />}</section>;
}

function ApiLogList({ entries }: Readonly<{ entries: readonly LogEntry[] }>) {
  return <div className="log-list-viewport divide-y divide-border"><div className="hidden bg-surface-muted px-4 py-2.5 text-xs font-semibold text-muted lg:grid lg:grid-cols-[160px_72px_minmax(0,1fr)_96px_88px] lg:gap-2 lg:px-5"><span>时间</span><span>方法</span><span>请求</span><span>状态</span><span className="text-right">耗时</span></div>{entries.map((entry, index) => <article key={`${String(entry.timestamp)}:${index}`} className="grid gap-2 px-4 py-3 sm:px-5 lg:grid-cols-[160px_72px_minmax(0,1fr)_96px_88px] lg:items-center"><time className="text-xs text-muted">{formatTime(entry.timestamp)}</time><Tag tone={entry.outcome === "failed" ? "danger" : "success"}>{String(entry.method ?? "-")}</Tag><div className="min-w-0"><p className="truncate font-mono text-xs" title={String(entry.url ?? "")}>{String(entry.url ?? "-")}</p>{entry.error ? <p className="mt-1 truncate text-xs text-danger" title={String(entry.error)}>{String(entry.error)}</p> : null}</div><span className="font-mono text-xs tabular-nums">HTTP {String(entry.status ?? "-")}</span><span className="text-right font-mono text-xs tabular-nums text-muted">{String(entry.durationMs ?? "-")} ms</span></article>)}</div>;
}

function WorkerLogList({ entries }: Readonly<{ entries: readonly LogEntry[] }>) {
  return <div className="log-list-viewport divide-y divide-border">{entries.map((entry, index) => <article key={`${String(entry.timestamp)}:${index}`} className="px-4 py-3 sm:px-5"><div className="grid gap-2 lg:grid-cols-[160px_minmax(90px,auto)_minmax(0,1fr)] lg:items-center"><time className="text-xs text-muted">{formatTime(entry.timestamp)}</time><Tag tone={workerTone(entry.status)}>{workerStatus(entry)}</Tag><span className="text-xs text-muted">采集 {String(entry.collectedSources ?? 0)} · 采集失败 {String(entry.failedSources ?? 0)} · 应用 {String(entry.appliedGroups ?? 0)} · 应用失败 {String(entry.failedGroups ?? 0)}</span></div>{Array.isArray(entry.errors) && entry.errors.length ? <ul className="mt-2 space-y-1 text-xs text-danger lg:ml-[168px]">{entry.errors.map((error, errorIndex) => <li key={errorIndex}>{String(error)}</li>)}</ul> : null}</article>)}</div>;
}

function workerStatus(entry: LogEntry) { return entry.event === "cycle_skipped" ? "已跳过" : String(entry.status ?? "未知"); }
function workerTone(status: unknown): "success" | "warning" | "danger" | "neutral" { return status === "success" ? "success" : status === "partial" ? "warning" : status === "failed" ? "danger" : "neutral"; }
function failureCount(entries: readonly LogEntry[]) { return entries.filter((entry) => entry.outcome === "failed" || entry.status === "failed" || entry.status === "partial").length; }
function Loading() { return <div className="loading-state"><Loader2 className="size-4 animate-spin" />正在读取业务日志...</div>; }
function formatTime(value: unknown) { const date = new Date(String(value)); return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN"); }
function formatBytes(value: number) { if (value < 1024) return `${value} B`; if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`; return `${(value / 1024 / 1024).toFixed(1)} MB`; }
async function loadLogs(input: { type: LogType; setData: (value: LogResponse) => void; setLoading: (value: boolean) => void; setError: (value: string) => void }) { input.setLoading(true); input.setError(""); try { const response = await fetch(`/api/logs?type=${input.type}`, { cache: "no-store" }); const body = await response.json() as LogResponse & { error?: string }; if (!response.ok) throw new Error(body.error ?? `请求失败 HTTP ${response.status}`); input.setData(body); } catch (error) { input.setError(error instanceof Error ? error.message : String(error)); } finally { input.setLoading(false); } }
