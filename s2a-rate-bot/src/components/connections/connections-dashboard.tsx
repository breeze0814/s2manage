"use client";

import { AlertCircle, Cable, History, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/button";
import { OverflowAction, OverflowActions } from "../ui/overflow-actions";
import { ConnectionCreateDialog } from "./connection-create-dialog";
import { ConnectionDisconnectDialog } from "./connection-disconnect-dialog";
import { ConnectionPolicyDialog } from "./connection-policy-dialog";
import { ConnectionsTable } from "./connections-table";
import { HealthEventsDialog } from "./health-events-dialog";
import { HealthPoliciesDialog } from "./health-policies-dialog";
import type { ConnectionView } from "./types";
import { useConnectionsDashboard } from "./use-connections-dashboard";

export function ConnectionsDashboard() {
  const view = useConnectionsDashboard();
  const [createOpen, setCreateOpen] = useState(false);
  const [policiesOpen, setPoliciesOpen] = useState(false);
  const [policyTarget, setPolicyTarget] = useState<ConnectionView | null>(null);
  const [disconnectTarget, setDisconnectTarget] = useState<ConnectionView | null>(null);
  const [eventsTarget, setEventsTarget] = useState<ConnectionView | null>(null);
  const [eventsOpen, setEventsOpen] = useState(false);
  if (view.loading) return <div className="loading-state"><Loader2 className="size-4 animate-spin" />正在读取真实连接...</div>;
  const targetMonitor = policyTarget ? view.monitorMap.get(policyTarget.id) ?? null : null;
  return <section className="page-stack"><PageHeader pending={view.isPending("reload")} onCreate={() => setCreateOpen(true)} onPolicies={() => setPoliciesOpen(true)} onEvents={() => { setEventsTarget(null); setEventsOpen(true); }} onReload={() => void view.reload()} />{view.loadError ? <LoadErrorNotice message={view.loadError} pending={view.isPending("reload")} onRetry={() => void view.reload()} /> : null}<HealthSummary connections={view.connections} monitorMap={view.monitorMap} /><ConnectionsTable connections={view.connections} monitorMap={view.monitorMap} pendingKeys={view.pendingKeys} onPolicy={setPolicyTarget} onProbe={(connection) => void view.probe(connection)} onAction={(connection, action) => void view.act(connection, action)} onEvents={(connection) => { setEventsTarget(connection); setEventsOpen(true); }} onDisconnect={setDisconnectTarget} /><ConnectionCreateDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={view.connectionCreated} /><HealthPoliciesDialog open={policiesOpen} policies={view.policies} pendingKeys={view.pendingKeys} onOpenChange={setPoliciesOpen} onSave={view.savePolicy} onDelete={view.deletePolicy} /><ConnectionPolicyDialog connection={policyTarget} monitor={targetMonitor} policies={view.policies} pending={policyTarget ? view.isPending(`policy:${policyTarget.id}`) : false} onOpenChange={setPolicyTarget} onSave={view.assignPolicy} /><ConnectionDisconnectDialog connection={disconnectTarget} pending={disconnectTarget ? view.isPending(`disconnect:${disconnectTarget.id}`) : false} onOpenChange={setDisconnectTarget} onDisconnect={view.disconnect} /><HealthEventsDialog open={eventsOpen} connection={eventsTarget} onOpenChange={setEventsOpen} /></section>;
}

function LoadErrorNotice({ message, pending, onRetry }: Readonly<{ message: string; pending: boolean; onRetry: () => void }>) {
  return <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger"><AlertCircle className="size-4 shrink-0" /><p className="min-w-0 flex-1 break-words">对接治理数据加载失败：{message}</p><Button type="button" variant="secondary" size="sm" disabled={pending} onClick={onRetry}>{pending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}重试</Button></div>;
}

function PageHeader({ pending, onCreate, onPolicies, onEvents, onReload }: Readonly<{ pending: boolean; onCreate: () => void; onPolicies: () => void; onEvents: () => void; onReload: () => void }>) {
  return (
    <header className="page-header">
      <div className="min-w-0"><h1 className="page-heading">对接治理</h1><p className="page-description">真实连接、健康策略和远端资源生命周期</p></div>
      <div className="page-actions">
        <div className="page-actions-primary"><Button type="button" onClick={onCreate}><Cable className="size-3.5" />创建对接</Button></div>
        <div className="page-actions-secondary"><Button type="button" variant="secondary" onClick={onPolicies}><ShieldCheck className="size-3.5" />健康策略</Button><Button type="button" variant="secondary" onClick={onEvents}><History className="size-3.5" />事件记录</Button><RefreshAction pending={pending} onReload={onReload} /></div>
        <OverflowActions className="page-actions-overflow"><OverflowAction onClick={onPolicies}><ShieldCheck />健康策略</OverflowAction><OverflowAction onClick={onEvents}><History />事件记录</OverflowAction><OverflowAction disabled={pending} onClick={onReload}>{pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}刷新</OverflowAction></OverflowActions>
      </div>
    </header>
  );
}

function RefreshAction({ pending, onReload }: Readonly<{ pending: boolean; onReload: () => void }>) {
  return <Button type="button" variant="secondary" disabled={pending} onClick={onReload}>{pending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}刷新</Button>;
}

function HealthSummary({ connections, monitorMap }: Readonly<{ connections: readonly ConnectionView[]; monitorMap: ReadonlyMap<string, { readonly state: string }> }>) {
  const active = connections.filter((item) => item.status === "active");
  const values = [
    ["有效连接", active.length, "text-primary-strong"],
    ["健康", active.filter((item) => monitorMap.get(item.id)?.state === "healthy").length, "text-success"],
    ["降级", active.filter((item) => monitorMap.get(item.id)?.state === "degraded").length, "text-warning"],
    ["已暂停", active.filter((item) => monitorMap.get(item.id)?.state === "suspended").length, "text-danger"],
    ["未监控", active.filter((item) => !monitorMap.has(item.id)).length, "text-muted"],
  ] as const;
  return <dl className="grid overflow-hidden rounded-lg border border-border bg-surface shadow-panel sm:grid-cols-5">{values.map(([label, value, tone]) => <div key={label} className="border-b border-border px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><dt className="text-xs font-medium text-muted">{label}</dt><dd className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${tone}`}>{value}</dd></div>)}</dl>;
}
