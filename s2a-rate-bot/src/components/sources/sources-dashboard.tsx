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
    <section className="space-y-5">
      <DashboardHeader sites={view.sites.length} enabled={view.enabledCount} rates={view.rates.length} />
      <SourceActions bulkPending={view.bulkPending} onCreate={() => view.openDialog(null)} onReload={view.reload} onRefreshAll={view.refreshAll} />
      {view.message ? <p role="status" className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{view.message}</p> : null}
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div><h2 className="font-semibold">采集站</h2><p className="mt-1 text-sm text-slate-600">管理认证信息和单站远端刷新。</p></div>
        <SourceSiteTable sites={view.sites} pendingId={view.pendingId} onRefresh={view.refreshSite} onEdit={view.openDialog} onDelete={view.deleteSite} />
      </div>
      <SourceRatesTable rates={view.rates} sites={view.sites} search={view.search} onSearch={view.setSearch} />
      <SourceSiteDialog open={view.dialog.open} site={view.dialog.site} pending={view.dialogPending} error={view.dialogError} onOpenChange={view.setDialogOpen} onSave={view.saveSite} />
    </section>
  );
}

function DashboardHeader({ sites, enabled, rates }: Readonly<{ sites: number; enabled: number; rates: number }>) {
  return <header><h1 className="text-xl font-semibold tracking-tight">倍率采集</h1><p className="mt-1 text-sm text-slate-600">管理 Sub2API 与 New API 采集站，并查看最近成功倍率。</p><div className="mt-4 grid grid-cols-3 gap-3"><Metric label="采集站" value={sites} /><Metric label="已启用" value={enabled} /><Metric label="分组倍率" value={rates} /></div></header>;
}

function Metric({ label, value }: Readonly<{ label: string; value: number }>) {
  return <div className="rounded-lg border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>;
}

function SourceActions({ bulkPending, onCreate, onReload, onRefreshAll }: Readonly<{ bulkPending: boolean; onCreate: () => void; onReload: () => void; onRefreshAll: () => void }>) {
  return <div className="grid gap-2 sm:grid-cols-3"><Action icon={<Plus className="size-4" />} label="添加采集站" onClick={onCreate} /><Action icon={<DatabaseZap className="size-4" />} label="重新读取页面数据" onClick={onReload} /><Action icon={bulkPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} label="重新请求全部远端" onClick={onRefreshAll} disabled={bulkPending} /></div>;
}

function Action({ icon, label, ...button }: Readonly<{ icon: React.ReactNode; label: string } & React.ButtonHTMLAttributes<HTMLButtonElement>>) {
  return <button type="button" {...button} className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">{icon}{label}</button>;
}

function LoadingDashboard() {
  return <div className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="size-4 animate-spin" />正在读取采集数据...</div>;
}
