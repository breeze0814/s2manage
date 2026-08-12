"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "../ui/button";
import { DataLoadError } from "../ui/data-load-error";
import { GroupRuleTable } from "./group-rule-table";
import { useGroupsDashboard } from "./use-groups-dashboard";

export function GroupsDashboard() {
  const view = useGroupsDashboard();
  return (
    <section className="page-stack">
      <header className="page-header"><div className="min-w-0"><h1 className="page-heading">分组倍率</h1><p className="page-description">配置目标分组绑定、计算规则与应用状态</p></div><Button type="button" variant="secondary" onClick={view.refresh} disabled={view.loading} className="shrink-0 self-start lg:self-auto">{view.loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}刷新分组</Button></header>
      {view.loading && view.groups.length === 0 ? <LoadingGroups />
        : view.loadError && view.groups.length === 0 ? <DataLoadError message={`分组数据加载失败：${view.loadError}`} onRetry={view.refresh} pending={view.loading} className="min-h-36 justify-center" />
          : <>{view.loadError ? <DataLoadError message={`分组数据刷新失败：${view.loadError}`} onRetry={view.refresh} pending={view.loading} /> : null}{view.groups.length === 0 ? <EmptyGroups /> : <GroupRuleTable groups={view.groups} sites={view.sites} rates={view.rates} pending={view.pending} onRefresh={view.refreshOne} onSave={view.save} onApply={view.apply} />}</>}
    </section>
  );
}

function LoadingGroups() { return <div className="loading-state"><Loader2 className="size-4 animate-spin" />正在读取本地分组快照...</div>; }
function EmptyGroups() { return <p className="empty-state">本地尚无分组快照，请点击右上角刷新按钮从目标站同步。</p>; }
