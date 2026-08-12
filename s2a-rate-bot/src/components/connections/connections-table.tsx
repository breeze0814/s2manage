"use client";

import { Activity, History, Loader2, Power, Search, Settings2, Unplug } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Tag, type TagTone } from "../ui/tag";
import type { ConnectionView, HealthMonitor } from "./types";

export function ConnectionsTable({ connections, monitorMap, pendingKeys, onPolicy, onProbe, onAction, onEvents, onDisconnect }: Readonly<{
  connections: readonly ConnectionView[];
  monitorMap: ReadonlyMap<string, HealthMonitor>;
  pendingKeys: ReadonlySet<string>;
  onPolicy: (connection: ConnectionView) => void;
  onProbe: (connection: ConnectionView) => void;
  onAction: (connection: ConnectionView, action: "suspend" | "restore") => void;
  onEvents: (connection: ConnectionView) => void;
  onDisconnect: (connection: ConnectionView) => void;
}>) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("open");
  const filtered = useMemo(() => filterConnections(connections, search, status), [connections, search, status]);
  const actions = { pendingKeys, monitorMap, onPolicy, onProbe, onAction, onEvents, onDisconnect };
  return <section className="panel overflow-hidden" aria-labelledby="connections-title"><div className="panel-header"><div><h2 id="connections-title" className="panel-title">真实连接</h2><p className="panel-description">远端资源、调价映射与健康状态</p></div><Tag>{filtered.length} 条</Tag></div><ConnectionToolbar search={search} status={status} connections={connections} onSearch={setSearch} onStatus={setStatus} /><div className="p-3">{filtered.length ? <><div className="grid gap-2.5 lg:hidden">{filtered.map((connection) => <ConnectionCard key={connection.id} connection={connection} monitor={monitorMap.get(connection.id) ?? null} actions={actions} />)}</div><div className="table-shell embedded-table-viewport hidden lg:block"><Table className="data-table data-table-sticky min-w-[1180px]"><ConnectionHead /><TableBody>{filtered.map((connection) => <ConnectionRow key={connection.id} connection={connection} monitor={monitorMap.get(connection.id) ?? null} actions={actions} />)}</TableBody></Table></div></> : <p className="empty-state">没有匹配的真实连接。</p>}</div></section>;
}

function ConnectionToolbar({ search, status, connections, onSearch, onStatus }: Readonly<{ search: string; status: string; connections: readonly ConnectionView[]; onSearch: (value: string) => void; onStatus: (value: string) => void }>) {
  const active = connections.filter((item) => item.status === "active").length;
  const problem = connections.filter((item) => ["error", "provisioning", "disconnecting"].includes(item.status)).length;
  const disconnected = connections.filter((item) => item.status === "disconnected").length;
  const options = [{ value: "open", label: `进行中 (${active + problem})` }, { value: "active", label: `有效 (${active})` }, { value: "problem", label: `处理中/异常 (${problem})` }, { value: "disconnected", label: `已断开 (${disconnected})` }, { value: "all", label: `全部 (${connections.length})` }];
  return <div className="flex flex-col gap-2 border-b border-border bg-surface-muted/35 px-4 py-2.5 sm:flex-row sm:flex-wrap sm:items-center"><Label className="relative block min-w-0 flex-1 sm:min-w-56"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" /><span className="sr-only">搜索真实连接</span><Input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="搜索站点、分组或目标账号" className="pl-9" /></Label><div className="w-full sm:w-40"><Select ariaLabel="连接状态筛选" value={status} options={options} onValueChange={onStatus} /></div></div>;
}

function ConnectionHead() {
  return <TableHeader><TableRow><TableHead>采集来源</TableHead><TableHead>类型</TableHead><TableHead>目标转发账号</TableHead><TableHead>目标分组</TableHead><TableHead>连接状态</TableHead><TableHead>调价映射</TableHead><TableHead>健康状态</TableHead><TableHead>最后探测</TableHead><TableHead className="sticky-action-header">操作</TableHead></TableRow></TableHeader>;
}

function ConnectionRow({ connection, monitor, actions }: Readonly<{ connection: ConnectionView; monitor: HealthMonitor | null; actions: Actions }>) {
  return <TableRow><TableCell><SourceIdentity connection={connection} /></TableCell><TableCell><Tag>{groupTypeLabel(connection.groupType)}</Tag></TableCell><TableCell><TargetAccount connection={connection} /></TableCell><TableCell><TargetGroups names={connection.targetGroupNames} /></TableCell><TableCell><ConnectionStatusTag connection={connection} /></TableCell><TableCell><Tag tone={connection.pricingMappingEnabled ? "success" : "neutral"}>{connection.pricingMappingEnabled ? "已映射" : "未映射"}</Tag></TableCell><TableCell><HealthStatus monitor={monitor} /></TableCell><TableCell><ProbeDetail monitor={monitor} /></TableCell><TableCell className="sticky-action-cell"><ConnectionActions connection={connection} monitor={monitor} actions={actions} /></TableCell></TableRow>;
}

function ConnectionCard({ connection, monitor, actions }: Readonly<{ connection: ConnectionView; monitor: HealthMonitor | null; actions: Actions }>) {
  return <article className="rounded-lg border border-border bg-surface p-3.5"><div className="flex items-start justify-between gap-3"><SourceIdentity connection={connection} /><ConnectionStatusTag connection={connection} /></div><div className="mt-2.5 flex flex-wrap gap-1.5"><Tag>{groupTypeLabel(connection.groupType)}</Tag><Tag tone={connection.pricingMappingEnabled ? "success" : "neutral"}>{connection.pricingMappingEnabled ? "已用于调价" : "未用于调价"}</Tag><HealthStatus monitor={monitor} /></div><dl className="mt-3 grid gap-3 border-t border-border pt-2.5 text-sm sm:grid-cols-2"><Info label="目标转发账号"><TargetAccount connection={connection} /></Info><Info label="目标分组"><TargetGroups names={connection.targetGroupNames} /></Info><Info label="最后探测"><ProbeDetail monitor={monitor} /></Info></dl><div className="mt-3 flex justify-end border-t border-border pt-2.5"><ConnectionActions connection={connection} monitor={monitor} actions={actions} /></div></article>;
}

function ConnectionActions({ connection, monitor, actions }: Readonly<{ connection: ConnectionView; monitor: HealthMonitor | null; actions: Actions }>) {
  const active = connection.status === "active";
  const busy = connectionBusy(actions.pendingKeys, connection.id);
  const probing = actions.pendingKeys.has(`probe:${connection.id}`);
  const acting = actions.pendingKeys.has(`action:${connection.id}`);
  const disconnecting = actions.pendingKeys.has(`disconnect:${connection.id}`);
  const suspended = monitor?.state === "suspended";
  return <div className="flex justify-end gap-1"><IconAction label="分配健康策略" icon={<Settings2 className="size-3.5" />} disabled={!active || busy} onClick={() => actions.onPolicy(connection)} /><IconAction label="立即探测" icon={probing ? <Loader2 className="size-3.5 animate-spin" /> : <Activity className="size-3.5" />} disabled={!active || !monitor || busy} onClick={() => actions.onProbe(connection)} /><IconAction label={suspended ? "恢复调度" : "暂停调度"} icon={acting ? <Loader2 className="size-3.5 animate-spin" /> : <Power className="size-3.5" />} disabled={!active || !monitor || busy} onClick={() => actions.onAction(connection, suspended ? "restore" : "suspend")} /><IconAction label="查看连接事件" icon={<History className="size-3.5" />} disabled={false} onClick={() => actions.onEvents(connection)} /><IconAction label="断开真实连接" icon={disconnecting ? <Loader2 className="size-3.5 animate-spin" /> : <Unplug className="size-3.5" />} disabled={(connection.status === "disconnected" && !connection.canDeleteRemote) || busy} danger onClick={() => actions.onDisconnect(connection)} /></div>;
}

function IconAction({ label, icon, disabled, danger = false, onClick }: Readonly<{ label: string; icon: React.ReactNode; disabled: boolean; danger?: boolean; onClick: () => void }>) { return <Button type="button" variant="ghost" size="icon-sm" aria-label={label} title={label} disabled={disabled} className={danger ? "text-danger" : ""} onClick={onClick}>{icon}</Button>; }
function SourceIdentity({ connection }: Readonly<{ connection: ConnectionView }>) { return <div className="min-w-0"><p className="font-medium">{connection.sourceGroupName}</p><p className="mt-1 text-xs text-muted">{connection.sourceSiteName} · #{connection.sourceGroupId}</p></div>; }
function TargetAccount({ connection }: Readonly<{ connection: ConnectionView }>) { return connection.targetAccountId ? <div><p className="text-sm font-medium">{connection.targetAccountName}</p><p className="mt-1 font-mono text-xs text-muted">#{connection.targetAccountId}</p></div> : <span className="text-muted">尚未创建</span>; }
function TargetGroups({ names }: Readonly<{ names: readonly string[] }>) { return <span className="flex max-w-56 flex-wrap gap-1">{names.map((name) => <Tag key={name}>{name}</Tag>)}</span>; }
function ConnectionStatusTag({ connection }: Readonly<{ connection: ConnectionView }>) { const value = CONNECTION_STATUS[connection.status]; return <Tag tone={value.tone} title={connection.lastError ?? undefined}>{value.label}</Tag>; }
function HealthStatus({ monitor }: Readonly<{ monitor: HealthMonitor | null }>) { if (!monitor) return <Tag>未监控</Tag>; const value = HEALTH_STATUS[monitor.state]; const label = monitor.state === "suspended" ? monitor.suspensionReason === "manual" ? "人工暂停" : "自动暂停" : value.label; return <Tag tone={value.tone} title={monitor.lastMessage ?? undefined}>{label}</Tag>; }
function ProbeDetail({ monitor }: Readonly<{ monitor: HealthMonitor | null }>) { return monitor?.lastProbeAt ? <div className="text-xs"><p>{formatTime(monitor.lastProbeAt)}</p><p className="mt-1 font-mono text-muted">{monitor.lastLatencyMs ?? "-"}ms{monitor.lastModel ? ` · ${monitor.lastModel}` : ""}</p></div> : <span className="text-xs text-muted">未探测</span>; }
function Info({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) { return <div><dt className="mb-1 text-xs text-muted">{label}</dt><dd>{children}</dd></div>; }

function filterConnections(connections: readonly ConnectionView[], search: string, status: string) { const query = search.trim().toLowerCase(); return connections.filter((item) => matchesStatus(item, status) && [item.sourceSiteName, item.sourceGroupName, item.sourceGroupId, item.targetAccountName, item.groupType].some((value) => value.toLowerCase().includes(query))); }
function matchesStatus(connection: ConnectionView, status: string) { if (status === "all") return true; if (status === "open") return connection.status !== "disconnected"; if (status === "problem") return ["error", "provisioning", "disconnecting"].includes(connection.status); return connection.status === status; }
function groupTypeLabel(value: string) { return value === "openai" ? "OpenAI" : value === "anthropic" ? "Anthropic" : value === "gemini" ? "Gemini" : "Antigravity"; }
function formatTime(value: string) { return new Date(value).toLocaleString("zh-CN"); }
const CONNECTION_STATUS: Record<ConnectionView["status"], { label: string; tone: TagTone }> = { provisioning: { label: "创建中", tone: "info" }, active: { label: "有效", tone: "success" }, disconnecting: { label: "断开中", tone: "warning" }, disconnected: { label: "已断开", tone: "neutral" }, error: { label: "异常", tone: "danger" } };
const HEALTH_STATUS: Record<HealthMonitor["state"], { label: string; tone: TagTone }> = { unknown: { label: "待探测", tone: "neutral" }, healthy: { label: "健康", tone: "success" }, degraded: { label: "降级", tone: "warning" }, suspended: { label: "已暂停", tone: "danger" }, observing: { label: "观察中", tone: "info" } };
function connectionBusy(pendingKeys: ReadonlySet<string>, connectionId: string) { return [...pendingKeys].some((key) => key.endsWith(`:${connectionId}`)); }
type Actions = Readonly<{ pendingKeys: ReadonlySet<string>; monitorMap: ReadonlyMap<string, HealthMonitor>; onPolicy: (connection: ConnectionView) => void; onProbe: (connection: ConnectionView) => void; onAction: (connection: ConnectionView, action: "suspend" | "restore") => void; onEvents: (connection: ConnectionView) => void; onDisconnect: (connection: ConnectionView) => void }>;
