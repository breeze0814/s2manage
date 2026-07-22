"use client";

import { Loader2, Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import { SourceRatesTable } from "./source-rates-table";
import { SourceSiteDialog } from "./source-site-dialog";
import { SourceSiteTable } from "./source-site-table";
import { useSourcesDashboard } from "./use-sources-dashboard";

export function SourcesDashboard() {
  const view = useSourcesDashboard();
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null);
  if (view.loading) return <LoadingDashboard />;
  const selectedSite = view.sites.find((site) => site.id === selectedSiteId);
  const activeSiteId = selectedSite?.id ?? null;
  return (
    <section className="page-stack">
      <DashboardHeader actions={<SourceActions bulkPending={view.bulkPending} onCreate={() => view.openDialog(null)} onRefreshAll={view.refreshAll} />} />
      <div data-source-split-layout className="grid items-start gap-5 xl:grid-cols-[minmax(360px,0.8fr)_minmax(0,1.7fr)]">
        <section className="panel min-w-0 overflow-hidden" aria-labelledby="source-sites-title">
          <div className="panel-header"><div><h2 id="source-sites-title" className="panel-title">采集站</h2><p className="panel-description">管理认证、运行状态和单站刷新。</p></div><span className="whitespace-nowrap text-xs text-muted">共 {view.sites.length} 个站点</span></div>
          <div className="p-3 sm:p-4"><SourceSiteTable sites={view.sites} selectedSiteId={activeSiteId} pendingId={view.pendingId} onSelect={setSelectedSiteId} onRefresh={view.refreshSite} onEdit={view.openDialog} onDelete={view.deleteSite} /></div>
        </section>
        <SourceRatesTable rates={view.rates} sites={view.sites} selectedSiteId={activeSiteId} platformPending={view.platformPending} search={view.search} onSearch={view.setSearch} onPlatformChange={view.setRatePlatform} onShowAll={() => setSelectedSiteId(null)} />
      </div>
      <SourceSiteDialog open={view.dialog.open} site={view.dialog.site} pending={view.dialogPending} onOpenChange={view.setDialogOpen} onSave={view.saveSite} />
    </section>
  );
}

function DashboardHeader({ actions }: Readonly<{ actions: React.ReactNode }>) {
  return <header className="page-header"><div className="min-w-0"><h1 className="page-heading">倍率采集</h1><p className="page-description">管理采集站与最近一次成功倍率快照</p></div>{actions}</header>;
}

function SourceActions({ bulkPending, onCreate, onRefreshAll }: Readonly<{ bulkPending: boolean; onCreate: () => void; onRefreshAll: () => void }>) {
  return <div className="page-actions"><Action primary icon={<Plus className="size-3.5" />} label="添加采集站" text="添加站点" onClick={onCreate} /><Action icon={bulkPending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} label="重新请求全部远端" text="刷新全部" onClick={onRefreshAll} disabled={bulkPending} /></div>;
}

function Action({ icon, label, text, primary, ...button }: Readonly<{ icon: React.ReactNode; label: string; text: string; primary?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>>) {
  return <button type="button" aria-label={label} title={label} {...button} className={primary ? "primary-button" : "secondary-button"}>{icon}{text}</button>;
}

function LoadingDashboard() {
  return <div className="loading-state"><Loader2 className="size-4 animate-spin" />正在读取采集数据...</div>;
}
