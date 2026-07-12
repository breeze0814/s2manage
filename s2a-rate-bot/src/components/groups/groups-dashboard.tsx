"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { GroupRuleTable } from "./group-rule-table";
import { useGroupsDashboard } from "./use-groups-dashboard";

export function GroupsDashboard() {
  const view = useGroupsDashboard();
  return (
    <section className="page-stack">
      <header className="flex items-start justify-between gap-4"><div><h1 className="page-heading">Rate Groups</h1><p className="page-description">分组倍率</p></div><button type="button" onClick={view.refresh} disabled={view.loading} className="secondary-button shrink-0">{view.loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}刷新分组</button></header>
      {view.loading ? <LoadingGroups /> : view.groups.length === 0 ? <EmptyGroups /> : <GroupRuleTable groups={view.groups} sites={view.sites} rates={view.rates} pending={view.pending} onRefresh={view.refreshOne} onSave={view.save} onApply={view.apply} />}
    </section>
  );
}

function LoadingGroups() { return <div className="flex items-center gap-2 text-sm text-muted"><Loader2 className="size-4 animate-spin" />正在读取本地分组快照...</div>; }
function EmptyGroups() { return <p className="rounded-xl border border-dashed border-border-strong bg-surface-muted p-8 text-center text-sm text-muted">本地尚无分组快照，请点击右上角刷新按钮从目标站同步。</p>; }
