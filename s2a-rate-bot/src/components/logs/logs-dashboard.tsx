"use client";

import { Activity, Bot, Clock3, Loader2, RefreshCw, ServerCrash } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { DataLoadError } from "../ui/data-load-error";
import { Tag } from "../ui/tag";

type LogType = "api" | "worker";
type LogEntry = Record<string, unknown>;
type LogResponse = {
  readonly type: LogType;
  readonly file: string;
  readonly size: number;
  readonly modifiedAt: string | null;
  readonly entries: readonly LogEntry[];
};

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
      {error && !data ? <DataLoadError message={`业务日志加载失败：${error}`} onRetry={() => load()} pending={loading} className="min-h-36 justify-center" /> : null}
      {error && data ? <DataLoadError message={`业务日志刷新失败：${error}`} onRetry={() => load()} pending={loading} /> : null}
      {data || loading ? <section className="panel overflow-hidden">
        <LogOverview type={type} data={data} loading={loading} onChange={selectType} />
        {data ? (
          data.entries.length === 0
            ? <p className="empty-state m-4 border-0 bg-transparent">暂无业务日志记录。</p>
            : data.type === "api"
              ? <ApiLogList entries={data.entries} />
              : <WorkerLogList entries={data.entries} />
        ) : loading ? (
          <Loading />
        ) : null}
      </section> : null}
    </section>
  );
}

function Header({ loading, onRefresh }: Readonly<{ loading: boolean; onRefresh: () => void }>) {
  return (
    <header className="page-header">
      <div className="min-w-0">
        <h1 className="page-heading">系统日志</h1>
        <p className="page-description">外部 API 调用与 Worker 执行记录</p>
      </div>
      <Button
        type="button"
        aria-label="刷新业务日志"
        title="刷新业务日志"
        onClick={onRefresh}
        disabled={loading}
        variant="secondary"
        className="self-start lg:self-auto"
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
        刷新日志
      </Button>
    </header>
  );
}

function LogOverview({
  type,
  data,
  loading,
  onChange,
}: Readonly<{
  type: LogType;
  data: LogResponse | null;
  loading: boolean;
  onChange: (value: LogType) => void;
}>) {
  return (
    <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <LogTabs type={type} onChange={onChange} />
        {data ? (
          <div className="min-w-0">
            <p className="panel-title">{data.type === "api" ? "外部 API 调用" : "Worker 执行记录"}</p>
            <p className="panel-description truncate">{data.file} · {formatBytes(data.size)}</p>
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        {data ? <SummaryBar data={data} /> : null}
        {data ? <Tag>{data.entries.length} 条</Tag> : null}
      </div>
    </div>
  );
}

function LogTabs({ type, onChange }: Readonly<{ type: LogType; onChange: (value: LogType) => void }>) {
  return (
    <div className="inline-flex w-fit shrink-0 rounded-lg border border-border bg-surface-muted/40 p-1">
      <Tab active={type === "api"} icon={<Activity />} label="外部 API" onClick={() => onChange("api")} />
      <Tab active={type === "worker"} icon={<Bot />} label="Worker" onClick={() => onChange("worker")} />
    </div>
  );
}

function Tab({ active, icon, label, onClick }: Readonly<{ active: boolean; icon: React.ReactNode; label: string; onClick: () => void }>) {
  return (
    <Button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      variant={active ? "default" : "ghost"}
      size="sm"
    >
      <span className="[&>svg]:size-3.5">{icon}</span>
      {label}
    </Button>
  );
}

function SummaryBar({ data }: Readonly<{ data: LogResponse }>) {
  const failures = failureCount(data.entries);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm">
      <Summary icon={<Activity />} label="记录" value={data.entries.length} />
      <Summary icon={<ServerCrash />} label="失败" value={failures} danger={failures > 0} />
      <Summary icon={<Clock3 />} label="更新" value={data.modifiedAt ? new Date(data.modifiedAt).toLocaleTimeString("zh-CN") : "-"} />
    </div>
  );
}

function Summary({ icon, label, value, danger = false }: Readonly<{ icon: React.ReactNode; label: string; value: string | number; danger?: boolean }>) {
  return (
    <div className="inline-flex items-center gap-1.5">
      <span className={`${danger ? "text-danger" : "text-muted"} [&>svg]:size-3.5`}>{icon}</span>
      <span className="text-muted">{label}</span>
      <span className={`font-mono font-semibold tabular-nums ${danger ? "text-danger" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

function ApiLogList({ entries }: Readonly<{ entries: readonly LogEntry[] }>) {
  return (
    <div className="log-list-viewport divide-y divide-border">
      <div className="hidden bg-surface-muted px-4 py-2.5 text-xs font-semibold text-muted lg:grid lg:grid-cols-[160px_72px_minmax(0,1fr)_96px_88px] lg:gap-2 lg:px-5">
        <span>时间</span>
        <span>方法</span>
        <span>请求</span>
        <span>状态</span>
        <span className="text-right">耗时</span>
      </div>
      {entries.map((entry, index) => (
        <article key={`${String(entry.timestamp)}:${index}`} className="grid gap-2 px-4 py-3 sm:px-5 lg:grid-cols-[160px_72px_minmax(0,1fr)_96px_88px] lg:items-center">
          <time className="text-xs text-muted">{formatTime(entry.timestamp)}</time>
          <Tag tone={entry.outcome === "failed" ? "danger" : "success"}>{String(entry.method ?? "-")}</Tag>
          <div className="min-w-0">
            <p className="truncate font-mono text-xs" title={String(entry.url ?? "")}>{String(entry.url ?? "-")}</p>
            {entry.error ? <p className="mt-1 truncate text-xs text-danger" title={String(entry.error)}>{String(entry.error)}</p> : null}
          </div>
          <span className="font-mono text-xs tabular-nums">HTTP {String(entry.status ?? "-")}</span>
          <span className="text-right font-mono text-xs tabular-nums text-muted">{String(entry.durationMs ?? "-")} ms</span>
        </article>
      ))}
    </div>
  );
}

function WorkerLogList({ entries }: Readonly<{ entries: readonly LogEntry[] }>) {
  return (
    <div className="log-list-viewport divide-y divide-border">
      {entries.map((entry, index) => (
        <article key={`${String(entry.timestamp)}:${index}`} className="px-4 py-3 sm:px-5">
          <div className="grid gap-2 lg:grid-cols-[160px_minmax(90px,auto)_minmax(0,1fr)] lg:items-center">
            <time className="text-xs text-muted">{formatTime(entry.timestamp)}</time>
            <Tag tone={workerTone(entry.status)}>{workerStatus(entry)}</Tag>
            <span className="text-xs text-muted">
              采集 {String(entry.collectedSources ?? 0)} · 采集失败 {String(entry.failedSources ?? 0)} · 应用 {String(entry.appliedGroups ?? 0)} · 应用失败 {String(entry.failedGroups ?? 0)}
            </span>
          </div>
          {Array.isArray(entry.errors) && entry.errors.length ? (
            <ul className="mt-2 space-y-1 text-xs text-danger lg:ml-[168px]">
              {entry.errors.map((error, errorIndex) => <li key={errorIndex}>{String(error)}</li>)}
            </ul>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function workerStatus(entry: LogEntry) {
  return entry.event === "cycle_skipped" ? "已跳过" : String(entry.status ?? "未知");
}

function workerTone(status: unknown): "success" | "warning" | "danger" | "neutral" {
  return status === "success" ? "success" : status === "partial" ? "warning" : status === "failed" ? "danger" : "neutral";
}

function failureCount(entries: readonly LogEntry[]) {
  return entries.filter((entry) => entry.outcome === "failed" || entry.status === "failed" || entry.status === "partial").length;
}

function Loading() {
  return (
    <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted">
      <Loader2 className="size-4 animate-spin" />
      正在读取业务日志...
    </div>
  );
}

function formatTime(value: unknown) {
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN");
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

async function loadLogs(input: {
  type: LogType;
  setData: (value: LogResponse) => void;
  setLoading: (value: boolean) => void;
  setError: (value: string) => void;
}) {
  input.setLoading(true);
  input.setError("");
  try {
    const response = await fetch(`/api/logs?type=${input.type}`, { cache: "no-store" });
    const body = await response.json() as LogResponse & { error?: string };
    if (!response.ok) throw new Error(body.error ?? `请求失败 HTTP ${response.status}`);
    input.setData(body);
  } catch (error) {
    input.setError(error instanceof Error ? error.message : String(error));
  } finally {
    input.setLoading(false);
  }
}
