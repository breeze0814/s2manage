"use client";

import { History, Loader2, RotateCw, X } from "lucide-react";
import { Button } from "../ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog";
import { Tag, type TagTone } from "../ui/tag";
import type { ConnectionEvent, ConnectionLifecycleEvent, ConnectionView, HealthEvent } from "./types";
import { useConnectionEvents } from "./use-connection-events";

export function HealthEventsDialog({ open, connection, onOpenChange }: Readonly<{
  open: boolean;
  connection: ConnectionView | null;
  onOpenChange: (open: boolean) => void;
}>) {
  const view = useConnectionEvents({ open, connectionId: connection?.id });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="flex max-h-[88dvh] w-[min(96vw,900px)] flex-col overflow-hidden"><div className="shrink-0 border-b border-border bg-surface-muted/30 px-5 py-4 pr-16 sm:px-6"><DialogTitle className="flex items-center gap-2 text-lg font-semibold"><History className="size-4 text-primary" />连接事件</DialogTitle><DialogDescription className="mt-1 text-sm text-muted">{connection ? `${connection.sourceSiteName} · ${connection.sourceGroupName}` : "全部真实连接的生命周期与健康记录"}</DialogDescription></div><div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5"><EventContent view={view} /></div><DialogClose asChild><Button type="button" variant="ghost" size="icon-sm" aria-label="关闭" className="absolute right-4 top-4 text-muted"><X className="size-3.5" /></Button></DialogClose></DialogContent></Dialog>;
}

function EventContent({ view }: Readonly<{
  view: ReturnType<typeof useConnectionEvents>;
}>) {
  if (view.loading) return <div className="loading-state min-h-44"><Loader2 className="size-4 animate-spin" />正在读取连接事件...</div>;
  return <div className="space-y-3">{view.error ? <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger"><p className="min-w-0 flex-1 break-words">{view.error}</p><Button type="button" variant="secondary" size="sm" disabled={view.loadingMore} onClick={view.retry}><RotateCw className="size-3.5" />重试</Button></div> : null}<EventList events={view.events} />{view.hasMore ? <Button type="button" variant="secondary" className="w-full" disabled={view.loadingMore} onClick={() => void view.loadMore()}>{view.loadingMore ? <Loader2 className="size-4 animate-spin" /> : <RotateCw className="size-4" />}加载更多</Button> : null}</div>;
}

function EventList({ events }: Readonly<{ events: readonly ConnectionEvent[] }>) {
  if (!events.length) return <p className="empty-state">暂无连接事件。</p>;
  return <div className="divide-y divide-border rounded-lg border border-border">{events.map((item) => <EventRow key={`${item.kind}:${item.event.id}`} item={item} />)}</div>;
}

function EventRow({ item }: Readonly<{ item: ConnectionEvent }>) {
  const event = item.event;
  return <div className="grid gap-2 px-4 py-3 sm:grid-cols-[120px_minmax(0,1fr)_auto]"><div><Tag tone={eventTone(event.result)}>{eventLabel(item)}</Tag></div><div className="min-w-0"><p className="break-words text-sm">{event.message}</p><p className="mt-1 truncate text-xs font-medium text-muted" title={identity(event)}>{identity(event)}</p><EventMeta item={item} /></div><time className="whitespace-nowrap text-xs text-muted">{formatTime(event.createdAt)}</time></div>;
}

function EventMeta({ item }: Readonly<{ item: ConnectionEvent }>) {
  if (item.kind === "lifecycle") return <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted"><span>{actionLabel(item.event.action)}</span><span>{stageLabel(item.event.stage)}</span></div>;
  const event = item.event;
  return <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted">{event.fromState || event.toState ? <span>{event.fromState ?? "-"} → {event.toState ?? "-"}</span> : null}{event.model ? <span>{event.model}</span> : null}{event.latencyMs !== null ? <span className="font-mono tabular-nums">{event.latencyMs}ms</span> : null}</div>;
}

function identity(event: HealthEvent | ConnectionLifecycleEvent) { return `${event.sourceSiteName} · ${event.sourceGroupName} → ${event.targetAccountName || "目标账号待创建"}`; }
function eventLabel(item: ConnectionEvent) { if (item.kind === "lifecycle") return "生命周期"; return item.event.eventType === "probe" ? "探测" : item.event.eventType === "action" ? "调度操作" : "策略"; }
function eventTone(result: HealthEvent["result"] | ConnectionLifecycleEvent["result"]): TagTone { return result === "success" ? "success" : result === "failure" ? "danger" : result === "started" ? "warning" : "info"; }
function actionLabel(value: ConnectionLifecycleEvent["action"]) { return value === "provision" ? "创建对接" : "断开对接"; }
function stageLabel(value: ConnectionLifecycleEvent["stage"]) { return STAGE_LABELS[value]; }
function formatTime(value: string) { return new Date(value).toLocaleString("zh-CN"); }

const STAGE_LABELS: Record<ConnectionLifecycleEvent["stage"], string> = {
  idle: "等待", metadata: "元数据", source: "采集凭据", target: "目标账号",
  pricing: "调价映射", health: "健康治理", remote: "远端清理", complete: "完成",
};
