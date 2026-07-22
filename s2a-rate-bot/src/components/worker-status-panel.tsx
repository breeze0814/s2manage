"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Tag, type TagTone } from "./ui/tag";

type WorkerRun = {
  readonly id: number;
  readonly status: "running" | "success" | "partial" | "failed";
  readonly collectedSources: number;
  readonly skippedSources: number;
  readonly failedSources: number;
  readonly appliedGroups: number;
  readonly skippedGroups: number;
  readonly failedGroups: number;
  readonly sentNotifications: number;
  readonly skippedNotifications: number;
  readonly failedNotifications: number;
  readonly errors: readonly string[];
  readonly startedAt: string;
  readonly finishedAt: string | null;
};

export function WorkerStatusPanel() {
  const [run, setRun] = useState<WorkerRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  useEffect(() => { void loadWorkerStatus({ setRun, setLoading, setFailed }); }, []);
  return (
    <section className="space-y-4 border-t border-border pt-4" aria-labelledby="worker-status-title">
      <div className="flex items-center justify-between gap-3">
        <div><h3 id="worker-status-title" className="text-sm font-semibold text-foreground">最近运行</h3><p className="text-xs text-muted">来自 Worker 持久化运行摘要。</p></div>
        <button type="button" aria-label="刷新 Worker 最近状态" title="刷新 Worker 最近状态" onClick={() => void loadWorkerStatus({ setRun, setLoading, setFailed })} disabled={loading} className="icon-button">
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
        </button>
      </div>
      {failed ? null : loading ? <p className="text-sm text-muted">正在读取 Worker 状态...</p> : run ? <RunSummary run={run} /> : <p className="text-sm text-muted">尚无 Worker 运行记录。</p>}
    </section>
  );
}

function RunSummary({ run }: Readonly<{ run: WorkerRun }>) {
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2"><StatusBadge status={run.status} /><span className="text-xs text-muted">开始 {formatTime(run.startedAt)} · 完成 {formatTime(run.finishedAt)}</span></div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Metric label="采集成功" value={run.collectedSources} />
        <Metric label="采集跳过" value={run.skippedSources} />
        <Metric label="采集失败" value={run.failedSources} />
        <Metric label="规则应用" value={run.appliedGroups} />
        <Metric label="规则跳过" value={run.skippedGroups} />
        <Metric label="规则失败" value={run.failedGroups} />
        <Metric label="通知成功" value={run.sentNotifications} />
        <Metric label="通知跳过" value={run.skippedNotifications} />
        <Metric label="通知失败" value={run.failedNotifications} />
      </dl>
      {run.errors.length ? <ul className="space-y-1 text-xs text-danger">{run.errors.map((message, index) => <li key={`${index}:${message}`}>{message}</li>)}</ul> : null}
    </div>
  );
}

function Metric({ label, value }: Readonly<{ label: string; value: number }>) {
  return <div className="rounded-lg border border-border bg-surface px-3 py-2.5"><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</dd></div>;
}

function StatusBadge({ status }: Readonly<{ status: WorkerRun["status"] }>) {
  const labels = { running: "运行中", success: "成功", partial: "部分失败", failed: "失败" } as const;
  const tones: Record<WorkerRun["status"], TagTone> = { running: "info", success: "success", partial: "warning", failed: "danger" };
  return <Tag tone={tones[status]}>{labels[status]}</Tag>;
}

async function loadWorkerStatus(actions: StatusActions) {
  actions.setLoading(true);
  actions.setFailed(false);
  try {
    const response = await fetch("/api/worker/status", { cache: "no-store" });
    const body = await response.json() as { run?: WorkerRun | null; error?: string };
    if (!response.ok) throw new Error(body.error ?? `请求失败 HTTP ${response.status}`);
    actions.setRun(body.run ?? null);
  } catch (error) {
    actions.setFailed(true);
    toast.error(error instanceof Error ? error.message : String(error));
  } finally {
    actions.setLoading(false);
  }
}

function formatTime(value: string | null) { return value ? new Date(value).toLocaleString("zh-CN") : "-"; }
type StatusActions = { readonly setRun: (run: WorkerRun | null) => void; readonly setLoading: (loading: boolean) => void; readonly setFailed: (failed: boolean) => void };
