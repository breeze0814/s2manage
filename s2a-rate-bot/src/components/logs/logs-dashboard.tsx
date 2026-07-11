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
  return <section className="page-stack"><Header loading={loading} onRefresh={() => load()} /><LogTabs type={type} onChange={selectType} />{error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p> : null}{data ? <LogContent data={data} loading={loading} /> : loading ? <Loading /> : null}</section>;
}

function Header({ loading, onRefresh }: Readonly<{ loading: boolean; onRefresh: () => void }>) { return <header className="flex items-start justify-between gap-4"><div><h1 className="page-heading">系统日志</h1><p className="page-description">查看系统调用外部 API 的请求结果与 Worker 任务执行记录。</p></div><button type="button" aria-label="刷新业务日志" title="刷新业务日志" onClick={onRefresh} disabled={loading} className="icon-button">{loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}</button></header>; }

function LogTabs({ type, onChange }: Readonly<{ type: LogType; onChange: (value: LogType) => void }>) { return <div className="inline-flex w-fit rounded-xl border border-border bg-surface p-1"><Tab active={type === "api"} icon={<Activity />} label="外部 API" onClick={() => onChange("api")} /><Tab active={type === "worker"} icon={<Bot />} label="Worker" onClick={() => onChange("worker")} /></div>; }
function Tab({ active, icon, label, onClick }: Readonly<{ active: boolean; icon: React.ReactNode; label: string; onClick: () => void }>) { return <button type="button" onClick={onClick} className={`flex min-h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors ${active ? "bg-primary text-primary-foreground" : "text-muted hover:bg-surface-muted hover:text-foreground"}`}><span className="[&>svg]:size-4">{icon}</span>{label}</button>; }

function LogContent({ data, loading }: Readonly<{ data: LogResponse; loading: boolean }>) { const failures = data.entries.filter((entry) => entry.outcome === "failed" || entry.status === "failed" || entry.status === "partial").length; return <><div className="grid gap-3 sm:grid-cols-3"><Summary icon={<Activity />} label="日志记录" value={data.entries.length} /><Summary icon={<ServerCrash />} label="失败记录" value={failures} danger={failures > 0} /><Summary icon={<Clock3 />} label="最后更新" value={data.modifiedAt ? new Date(data.modifiedAt).toLocaleTimeString("zh-CN") : "-"} /></div><section className="panel overflow-hidden"><div className="panel-header"><div><h2 className="font-semibold">{data.type === "api" ? "外部 API 调用" : "Worker 执行记录"}</h2><p className="mt-1 text-sm text-muted">{data.file} · {formatBytes(data.size)}</p></div>{loading ? <Loader2 className="size-4 animate-spin text-muted" /> : <Tag>{data.entries.length} 条</Tag>}</div>{data.entries.length === 0 ? <p className="p-8 text-center text-sm text-muted">暂无业务日志记录。</p> : data.type === "api" ? <ApiLogList entries={data.entries} /> : <WorkerLogList entries={data.entries} />}</section></>;
}

function ApiLogList({ entries }: Readonly<{ entries: readonly LogEntry[] }>) { return <div className="divide-y divide-border">{entries.map((entry, index) => <article key={`${String(entry.timestamp)}:${index}`} className="grid gap-2 px-4 py-3 sm:grid-cols-[150px_70px_minmax(0,1fr)_90px_80px] sm:items-center sm:px-5"><time className="text-xs text-muted">{formatTime(entry.timestamp)}</time><Tag tone={entry.outcome === "failed" ? "danger" : "success"}>{String(entry.method ?? "-")}</Tag><div className="min-w-0"><p className="truncate font-mono text-xs" title={String(entry.url ?? "")}>{String(entry.url ?? "-")}</p>{entry.error ? <p className="mt-1 truncate text-xs text-red-600 dark:text-red-400" title={String(entry.error)}>{String(entry.error)}</p> : null}</div><span className="font-mono text-xs tabular-nums">HTTP {String(entry.status ?? "-")}</span><span className="text-right font-mono text-xs tabular-nums text-muted">{String(entry.durationMs ?? "-")} ms</span></article>)}</div>; }

function WorkerLogList({ entries }: Readonly<{ entries: readonly LogEntry[] }>) { return <div className="divide-y divide-border">{entries.map((entry, index) => <article key={`${String(entry.timestamp)}:${index}`} className="px-4 py-3 sm:px-5"><div className="flex flex-wrap items-center gap-2"><time className="text-xs text-muted">{formatTime(entry.timestamp)}</time><Tag tone={workerTone(entry.status)}>{workerStatus(entry)}</Tag><span className="text-xs text-muted">采集 {String(entry.collectedSources ?? 0)} · 采集失败 {String(entry.failedSources ?? 0)} · 应用 {String(entry.appliedGroups ?? 0)} · 应用失败 {String(entry.failedGroups ?? 0)}</span></div>{Array.isArray(entry.errors) && entry.errors.length ? <ul className="mt-2 space-y-1 text-xs text-red-600 dark:text-red-400">{entry.errors.map((error, errorIndex) => <li key={errorIndex}>{String(error)}</li>)}</ul> : null}</article>)}</div>; }

function Summary({ icon, label, value, danger = false }: Readonly<{ icon: React.ReactNode; label: string; value: string | number; danger?: boolean }>) { return <div className="panel flex items-center gap-3 p-4"><span className={`${danger ? "text-red-600 dark:text-red-400" : "text-muted"} [&>svg]:size-5`}>{icon}</span><div><p className="font-mono text-xl font-semibold tabular-nums">{value}</p><p className="text-xs text-muted">{label}</p></div></div>; }
function workerStatus(entry: LogEntry) { return entry.event === "cycle_skipped" ? "已跳过" : String(entry.status ?? "未知"); }
function workerTone(status: unknown): "success" | "warning" | "danger" | "neutral" { return status === "success" ? "success" : status === "partial" ? "warning" : status === "failed" ? "danger" : "neutral"; }
function Loading() { return <div className="flex items-center gap-2 text-sm text-muted"><Loader2 className="size-4 animate-spin" />正在读取业务日志...</div>; }
function formatTime(value: unknown) { const date = new Date(String(value)); return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN"); }
function formatBytes(value: number) { if (value < 1024) return `${value} B`; if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`; return `${(value / 1024 / 1024).toFixed(1)} MB`; }
async function loadLogs(input: { type: LogType; setData: (value: LogResponse) => void; setLoading: (value: boolean) => void; setError: (value: string) => void }) { input.setLoading(true); input.setError(""); try { const response = await fetch(`/api/logs?type=${input.type}`, { cache: "no-store" }); const body = await response.json() as LogResponse & { error?: string }; if (!response.ok) throw new Error(body.error ?? `请求失败 HTTP ${response.status}`); input.setData(body); } catch (error) { input.setError(error instanceof Error ? error.message : String(error)); } finally { input.setLoading(false); } }
