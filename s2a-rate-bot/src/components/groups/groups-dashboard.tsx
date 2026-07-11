"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { Tag } from "../ui/tag";
import { GroupRuleTable } from "./group-rule-table";
import { useGroupsDashboard } from "./use-groups-dashboard";

export function GroupsDashboard() {
  const view = useGroupsDashboard();
  return (
    <section className="page-stack">
      <header className="flex items-start justify-between gap-4"><div><h1 className="page-heading">分组倍率</h1><p className="page-description">页面读取本地分组快照；点击刷新后才请求目标站并更新本地数据。</p><div className="mt-2 flex flex-wrap gap-1.5"><Tag>规则版本 v1</Tag><Tag>按采集分组绑定</Tag></div></div><button type="button" aria-label="刷新目标站全部分组" title="刷新目标站全部分组" onClick={view.refresh} disabled={view.loading} className="icon-button shrink-0">{view.loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}<span className="sr-only">刷新目标站全部分组</span></button></header>
      {view.message ? <p role="status" aria-live="polite" className="rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm text-foreground">{view.message}</p> : null}
      {view.loading ? <LoadingGroups /> : view.groups.length === 0 ? <EmptyGroups /> : <GroupRuleTable groups={view.groups} sites={view.sites} rates={view.rates} pending={view.pending} onRefresh={view.refreshOne} onSave={view.save} onPreview={view.preview} onApply={view.apply} />}
    </section>
  );
}

function LoadingGroups() { return <div className="flex items-center gap-2 text-sm text-muted"><Loader2 className="size-4 animate-spin" />正在读取本地分组快照...</div>; }
function EmptyGroups() { return <p className="rounded-xl border border-dashed border-border-strong bg-surface-muted p-8 text-center text-sm text-muted">本地尚无分组快照，请点击右上角刷新按钮从目标站同步。</p>; }
