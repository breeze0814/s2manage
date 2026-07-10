"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { GroupRuleCard } from "./group-rule-card";
import { useGroupsDashboard } from "./use-groups-dashboard";

export function GroupsDashboard() {
  const view = useGroupsDashboard();
  return (
    <section className="space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h1 className="text-xl font-semibold tracking-tight">分组倍率</h1><p className="mt-1 text-sm text-muted">目标分组始终从远端 API 获取；本地仅保存倍率规则和采集源绑定。</p><p className="mt-1 text-xs text-muted">规则契约：ruleVersion 1；绑定键：sourceSiteId + sourceGroupId。</p></div><button type="button" onClick={view.refresh} disabled={view.loading} className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border-strong bg-surface px-4 text-sm font-medium disabled:opacity-50">{view.loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}刷新目标站分组</button></header>
      {view.message ? <p role="status" className="rounded-lg bg-surface-muted px-3 py-2 text-sm text-foreground">{view.message}</p> : null}
      {view.loading ? <LoadingGroups /> : view.groups.length === 0 ? <EmptyGroups /> : <div className="space-y-4">{view.groups.map((group) => <GroupRuleCard key={group.id} group={group} sites={view.sites} rates={view.rates} pending={view.pending} onSave={view.save} onPreview={view.preview} onApply={view.apply} />)}</div>}
    </section>
  );
}

function LoadingGroups() { return <div className="flex items-center gap-2 text-sm text-muted"><Loader2 className="size-4 animate-spin" />正在请求目标站分组...</div>; }
function EmptyGroups() { return <p className="rounded-lg bg-surface-muted p-5 text-sm text-muted">目标站没有返回分组，或尚未完成全局配置。</p>; }
