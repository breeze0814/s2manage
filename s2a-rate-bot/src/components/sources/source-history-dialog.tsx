"use client";

import { ArrowRight, CirclePlus, History, Loader2, RefreshCw, Trash2, TrendingDown, TrendingUp, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "../ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog";
import { Tag } from "../ui/tag";
import type { SourceRateChangeView, SourceRateHistoryTarget, SourceRunView } from "./types";

export function SourceRateHistoryDialog({ target, onOpenChange }: Readonly<{ target: SourceRateHistoryTarget | null; onOpenChange: (target: SourceRateHistoryTarget | null) => void }>) {
  const [changes, setChanges] = useState<SourceRateChangeView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!target) return;
    let active = true;
    setLoading(true);
    setError(null);
    void loadRateHistory(target).then((next) => { if (active) setChanges(next); }).catch((reason) => { if (active) setError(errorMessage(reason)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [target]);
  return (
    <Dialog open={target !== null} onOpenChange={(open) => { if (!open) onOpenChange(null); }}>
      <DialogContent className="flex max-h-[86dvh] w-[min(96vw,760px)] flex-col overflow-hidden">
        <DialogHeader title="倍率变化历史" description={target ? `${target.siteName} · ${target.groupName}（${target.groupId}）` : ""} />
        <div className="min-h-0 flex-1 overflow-y-auto bg-background/40 p-4 sm:p-5">
          {loading ? <HistoryLoading /> : error ? <HistoryError message={error} /> : changes.length ? <ChangeHistoryList changes={changes} /> : <EmptyHistory />}
        </div>
        <DialogClose asChild><Button type="button" variant="ghost" size="icon-sm" aria-label="关闭" className="absolute right-4 top-4 text-muted"><X className="size-3.5" /></Button></DialogClose>
      </DialogContent>
    </Dialog>
  );
}

export function SourceCollectionRunsDialog({ open, siteId, onOpenChange }: Readonly<{ open: boolean; siteId: number | null; onOpenChange: (open: boolean) => void }>) {
  const [runs, setRuns] = useState<SourceRunView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    void loadRuns(siteId).then(setRuns).catch((reason) => setError(errorMessage(reason))).finally(() => setLoading(false));
  }, [siteId]);
  useEffect(() => { if (open) load(); }, [open, load]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[86dvh] w-[min(96vw,980px)] flex-col overflow-hidden">
        <DialogHeader title="采集运行记录" description={siteId === null ? "全部采集站最近的运行结果" : "当前采集站最近的运行结果"} />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background/40">
          <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3 sm:px-5"><Tag>{runs.length} 条记录</Tag><Button type="button" variant="secondary" size="sm" onClick={load} disabled={loading}>{loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}刷新记录</Button></div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">{loading && runs.length === 0 ? <HistoryLoading /> : error ? <HistoryError message={error} /> : runs.length ? <RunList runs={runs} /> : <EmptyRuns />}</div>
        </div>
        <DialogClose asChild><Button type="button" variant="ghost" size="icon-sm" aria-label="关闭" className="absolute right-4 top-4 text-muted"><X className="size-3.5" /></Button></DialogClose>
      </DialogContent>
    </Dialog>
  );
}

function DialogHeader({ title, description }: Readonly<{ title: string; description: string }>) {
  return <div className="shrink-0 border-b border-border bg-surface-muted/30 px-5 py-4 pr-16 sm:px-6 sm:py-5"><DialogTitle className="text-lg font-semibold">{title}</DialogTitle><DialogDescription className="mt-1 text-sm leading-6 text-muted">{description}</DialogDescription></div>;
}

function ChangeHistoryList({ changes }: Readonly<{ changes: readonly SourceRateChangeView[] }>) {
  return <div className="divide-y divide-border rounded-lg border border-border bg-surface">{changes.map((change) => <article key={change.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-start gap-3"><ChangeIcon change={change} /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="truncate text-sm font-medium">{change.groupName}</span><Tag tone={changeTone(change)}>{changeLabel(change)}</Tag></div><p className="mt-1 text-xs text-muted">{change.sourceSiteName} · {change.platform ?? "未知平台"} · {formatTime(change.collectedAt)}</p></div></div><div className="flex shrink-0 items-center gap-2 font-mono text-sm font-semibold tabular-nums"><span className="text-muted">{formatRate(change.oldRate)}</span><ArrowRight className="size-4 text-muted" /><span className={change.changeType === "deleted" ? "text-danger" : "text-effective-rate"}>{change.changeType === "deleted" ? "已删除" : formatRate(change.newRate)}</span></div></article>)}</div>;
}

function RunList({ runs }: Readonly<{ runs: readonly SourceRunView[] }>) {
  return <div className="divide-y divide-border rounded-lg border border-border bg-surface">{runs.map((run) => <article key={run.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="truncate text-sm font-medium">{run.sourceSiteName}</span><Tag tone={runTone(run.status)}>{runLabel(run.status)}</Tag><Tag>{run.groupCount} 个分组</Tag></div><p className="mt-1 text-xs text-muted">{formatTime(run.startedAt)} · 耗时 {formatDuration(run.durationMs)}</p>{run.error ? <p className="mt-1 truncate text-xs text-danger" title={run.error}>{run.error}</p> : null}</div><span className="shrink-0 font-mono text-xs tabular-nums text-muted">#{run.id}</span></article>)}</div>;
}

function runTone(status: SourceRunView["status"]) {
  return status === "success" ? "success" as const : status === "partial" ? "warning" as const : "danger" as const;
}

function runLabel(status: SourceRunView["status"]) {
  return status === "success" ? "成功" : status === "partial" ? "部分成功" : "失败";
}

function ChangeIcon({ change }: Readonly<{ change: SourceRateChangeView }>) {
  const state = changeState(change);
  return <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${state.className}`} aria-hidden="true">{state.icon}</span>;
}

function changeState(change: SourceRateChangeView) {
  if (change.changeType === "added") return { icon: <CirclePlus className="size-4" />, className: "bg-success/10 text-success" };
  if (change.changeType === "deleted") return { icon: <Trash2 className="size-4" />, className: "bg-danger/10 text-danger" };
  return (change.newRate ?? 0) > (change.oldRate ?? 0)
    ? { icon: <TrendingUp className="size-4" />, className: "bg-warning/10 text-warning" }
    : { icon: <TrendingDown className="size-4" />, className: "bg-info/10 text-info" };
}

function changeTone(change: SourceRateChangeView) {
  if (change.changeType === "added") return "success" as const;
  if (change.changeType === "deleted") return "danger" as const;
  return (change.newRate ?? 0) > (change.oldRate ?? 0) ? "warning" as const : "primary" as const;
}

function changeLabel(change: SourceRateChangeView) { if (change.changeType === "added") return "新增"; if (change.changeType === "deleted") return "已删除"; return (change.newRate ?? 0) > (change.oldRate ?? 0) ? "上调" : "下调"; }
function formatRate(value: number | null) { return value === null ? "—" : `×${Number(value.toFixed(4))}`; }
function formatTime(value: string) { return new Date(value).toLocaleString("zh-CN"); }
function formatDuration(value: number) { if (value < 1_000) return `${value} 毫秒`; return `${Number((value / 1_000).toFixed(1))} 秒`; }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error); }
function HistoryLoading() { return <div className="loading-state min-h-40"><Loader2 className="size-4 animate-spin" />正在读取记录...</div>; }
function HistoryError({ message }: Readonly<{ message: string }>) { return <div className="rounded-lg border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger">{message}</div>; }
function EmptyHistory() { return <div className="empty-state-inline rounded-lg border border-dashed border-border bg-surface-muted/40"><History className="size-5 text-muted" /><p className="mt-2">该分组暂无倍率变化记录。</p></div>; }
function EmptyRuns() { return <div className="empty-state-inline rounded-lg border border-dashed border-border bg-surface-muted/40"><History className="size-5 text-muted" /><p className="mt-2">暂无采集运行记录。</p></div>; }

async function loadRateHistory(target: SourceRateHistoryTarget) {
  const params = new URLSearchParams({ all: "true", siteId: String(target.siteId), groupId: target.groupId, limit: "100" });
  const body = await request<{ changes: SourceRateChangeView[] }>(`/api/sources/changes?${params}`);
  return body.changes;
}

async function loadRuns(siteId: number | null) {
  const params = new URLSearchParams({ limit: "100" });
  if (siteId !== null) params.set("siteId", String(siteId));
  const body = await request<{ runs: SourceRunView[] }>(`/api/sources/runs?${params}`);
  return body.runs;
}

async function request<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `请求失败 HTTP ${response.status}`);
  return body;
}
