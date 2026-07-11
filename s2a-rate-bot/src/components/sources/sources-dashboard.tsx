"use client";

import { DatabaseZap, Loader2, Plus, RefreshCw } from "lucide-react";
import { SourceRatesTable } from "./source-rates-table";
import { SourceSiteDialog } from "./source-site-dialog";
import { SourceSiteTable } from "./source-site-table";
import { useSourcesDashboard } from "./use-sources-dashboard";

export function SourcesDashboard() {
  const view = useSourcesDashboard();
  if (view.loading) return <LoadingDashboard />;
  return (
    <section className="page-stack">
      <DashboardHeader sites={view.sites.length} enabled={view.enabledCount} rates={view.rates.length} actions={<SourceActions bulkPending={view.bulkPending} onCreate={() => view.openDialog(null)} onReload={view.reload} onRefreshAll={view.refreshAll} />} />
      {view.message ? <p role="status" aria-live="polite" className="rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm text-foreground">{view.message}</p> : null}
      <div data-source-split-layout className="grid items-start gap-6 lg:grid-cols-[minmax(320px,0.85fr)_minmax(0,1.65fr)]">
        <section className="panel min-w-0 overflow-hidden" aria-labelledby="source-sites-title">
          <div className="panel-header"><div><h2 id="source-sites-title" className="font-semibold">采集站</h2><p className="mt-1 text-sm text-muted">管理认证、运行状态和单站刷新。</p></div><span className="whitespace-nowrap text-xs text-muted">共 {view.sites.length} 个站点</span></div>
          <div className="p-3 sm:p-4"><SourceSiteTable sites={view.sites} pendingId={view.pendingId} onRefresh={view.refreshSite} onEdit={view.openDialog} onDelete={view.deleteSite} /></div>
        </section>
        <SourceRatesTable rates={view.rates} sites={view.sites} search={view.search} onSearch={view.setSearch} />
      </div>
      <SourceSiteDialog open={view.dialog.open} site={view.dialog.site} pending={view.dialogPending} error={view.dialogError} onOpenChange={view.setDialogOpen} onSave={view.saveSite} />
    </section>
  );
}

function DashboardHeader({ sites, enabled, rates, actions }: Readonly<{ sites: number; enabled: number; rates: number; actions: React.ReactNode }>) {
  return <header className="space-y-5"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><h1 className="page-heading">倍率采集</h1><p className="page-description">管理 Sub2API 与 New API 采集站，并查看最近一次成功采集的倍率快照。</p></div>{actions}</div><div className="grid grid-cols-3 gap-2 sm:gap-3"><Metric label="采集站" value={sites} /><Metric label="已启用" value={enabled} /><Metric label="分组倍率" value={rates} /></div></header>;
}

function Metric({ label, value }: Readonly<{ label: string; value: number }>) {
  return <div className="panel px-3 py-3.5 sm:px-4"><p className="text-xs font-medium text-muted">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</p></div>;
}

function SourceActions({ bulkPending, onCreate, onReload, onRefreshAll }: Readonly<{ bulkPending: boolean; onCreate: () => void; onReload: () => void; onRefreshAll: () => void }>) {
  return <div className="flex shrink-0 items-center gap-2"><Action primary icon={<Plus className="size-4" />} label="添加采集站" onClick={onCreate} /><Action icon={<DatabaseZap className="size-4" />} label="重新读取页面数据" onClick={onReload} /><Action icon={bulkPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} label="重新请求全部远端" onClick={onRefreshAll} disabled={bulkPending} /></div>;
}

function Action({ icon, label, primary, ...button }: Readonly<{ icon: React.ReactNode; label: string; primary?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>>) {
  return <button type="button" aria-label={label} title={label} {...button} className={primary ? "icon-button-primary" : "icon-button"}>{icon}<span className="sr-only">{label}</span></button>;
}

function LoadingDashboard() {
  return <div className="flex items-center gap-2 text-sm text-muted"><Loader2 className="size-4 animate-spin" />正在读取采集数据...</div>;
}
