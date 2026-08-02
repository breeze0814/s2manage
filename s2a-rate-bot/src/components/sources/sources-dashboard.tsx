"use client";

import { ChevronDown, Loader2, Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/button";
import { SourceRatesTable } from "./source-rates-table";
import { SourceSiteDialog } from "./source-site-dialog";
import { SourceSiteTable } from "./source-site-table";
import { useSourcesDashboard } from "./use-sources-dashboard";

export function SourcesDashboard() {
  const view = useSourcesDashboard();
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null);
  const [sitesExpanded, setSitesExpanded] = useState(false);
  if (view.loading) return <LoadingDashboard />;
  const activeSiteId = resolveActiveSiteId(view.sites, selectedSiteId);
  const selectedSite = view.sites.find((site) => site.id === activeSiteId);
  return (
    <section className="page-stack">
      <DashboardHeader actions={<SourceActions bulkPending={view.bulkPending} onCreate={() => view.openDialog(null)} onRefreshAll={view.refreshAll} />} />
      <div data-source-split-layout className="source-split">
        <section className="source-side-rail min-w-0" aria-labelledby="source-sites-title" id="source-sites">
          <div className="mb-3 flex min-h-10 items-start justify-between gap-4">
            <div>
              <h2 id="source-sites-title" className="panel-title">采集站</h2>
              <p className="panel-description">管理认证、运行状态和单站刷新。</p>
            </div>
            <span className="whitespace-nowrap pt-1 text-xs text-muted">共 {view.sites.length} 个站点</span>
          </div>

          <div className="lg:hidden">
            <MobileSiteSummary
          sitesCount={view.sites.length}
          selectedName={selectedSite?.name ?? null}
              expanded={sitesExpanded}
              onToggle={() => setSitesExpanded((value) => !value)}
            />
            {sitesExpanded ? (
              <div className="mt-3">
                <SourceSiteTable
                  sites={view.sites}
                  selectedSiteId={activeSiteId}
                  pendingId={view.pendingId}
                  onSelect={(siteId) => {
                    setSelectedSiteId(siteId);
                    setSitesExpanded(false);
                  }}
                  onRefresh={view.refreshSite}
                  onEdit={view.openDialog}
                  onDelete={view.deleteSite}
                />
              </div>
            ) : null}
          </div>

          <div className="hidden lg:block">
            <SourceSiteTable
              sites={view.sites}
              selectedSiteId={activeSiteId}
              pendingId={view.pendingId}
              onSelect={setSelectedSiteId}
              onRefresh={view.refreshSite}
              onEdit={view.openDialog}
              onDelete={view.deleteSite}
            />
          </div>
        </section>
        <SourceRatesTable
          rates={view.rates}
          sites={view.sites}
          activeSiteId={activeSiteId}
          platformPending={view.platformPending}
          search={view.search}
          onSearch={view.setSearch}
          onPlatformChange={view.setRatePlatform}
          onSiteChange={setSelectedSiteId}
        />
      </div>
      <SourceSiteDialog open={view.dialog.open} site={view.dialog.site} pending={view.dialogPending} onOpenChange={view.setDialogOpen} onSave={view.saveSite} />
    </section>
  );
}

function MobileSiteSummary({
  sitesCount,
  selectedName,
  expanded,
  onToggle,
}: Readonly<{
  sitesCount: number;
  selectedName: string | null;
  expanded: boolean;
  onToggle: () => void;
}>) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onToggle}
      aria-expanded={expanded}
      className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-left shadow-panel transition-colors hover:border-primary/40 hover:bg-surface-muted/50"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium">
          {selectedName ? `当前站点：${selectedName}` : "暂无采集站"}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {expanded ? "收起站点列表，优先查看倍率" : `展开选择站点（共 ${sitesCount} 个）`}
        </p>
      </div>
      <ChevronDown className={`size-4 shrink-0 text-muted transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
    </Button>
  );
}

function resolveActiveSiteId(sites: readonly { id: number }[], selectedSiteId: number | null) {
  if (selectedSiteId !== null && sites.some((site) => site.id === selectedSiteId)) return selectedSiteId;
  return sites[0]?.id ?? null;
}

function DashboardHeader({ actions }: Readonly<{ actions: React.ReactNode }>) {
  return (
    <header className="page-header">
      <div className="min-w-0">
        <h1 className="page-heading">倍率采集</h1>
        <p className="page-description">管理采集站与最近一次成功倍率快照</p>
      </div>
      {actions}
    </header>
  );
}

function SourceActions({ bulkPending, onCreate, onRefreshAll }: Readonly<{ bulkPending: boolean; onCreate: () => void; onRefreshAll: () => void }>) {
  return (
    <div className="page-actions">
      <Action primary icon={<Plus className="size-3.5" />} label="添加采集站" text="添加站点" onClick={onCreate} />
      <Action icon={bulkPending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} label="重新请求全部远端" text="刷新全部" onClick={onRefreshAll} disabled={bulkPending} />
    </div>
  );
}

function Action({ icon, label, text, primary, ...button }: Readonly<{ icon: React.ReactNode; label: string; text: string; primary?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>>) {
  return (
    <Button type="button" variant={primary ? "default" : "secondary"} aria-label={label} title={label} {...button}>
      {icon}
      {text}
    </Button>
  );
}

function LoadingDashboard() {
  return (
    <div className="loading-state">
      <Loader2 className="size-4 animate-spin" />
      正在读取采集数据...
    </div>
  );
}
