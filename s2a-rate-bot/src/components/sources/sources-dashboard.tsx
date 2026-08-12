"use client";

import { ChevronDown, History, Loader2, Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/button";
import { OverflowAction, OverflowActions } from "../ui/overflow-actions";
import { ConnectionCreateDialog } from "../connections/connection-create-dialog";
import { SourceBindingDialog } from "./source-binding-dialog";
import { SourceRatesTable } from "./source-rates-table";
import { SourceSiteDialog } from "./source-site-dialog";
import { SourceSiteTable } from "./source-site-table";
import { SourceCollectionRunsDialog, SourceRateHistoryDialog } from "./source-history-dialog";
import type { SourceRateHistoryTarget } from "./types";
import { useSourcesDashboard } from "./use-sources-dashboard";

export function SourcesDashboard() {
  const view = useSourcesDashboard();
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null);
  const [sitesExpanded, setSitesExpanded] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<SourceRateHistoryTarget | null>(null);
  const [bindingTarget, setBindingTarget] = useState<SourceRateHistoryTarget | null>(null);
  const [connectionTarget, setConnectionTarget] = useState<SourceRateHistoryTarget | null>(null);
  const [runsOpen, setRunsOpen] = useState(false);
  if (view.loading) return <LoadingDashboard />;
  const selectedSite = view.sites.find((site) => site.id === selectedSiteId);
  const activeSiteId = selectedSite?.id ?? null;
  return (
    <section className="page-stack">
      <DashboardHeader actions={<SourceActions bulkPending={view.bulkPending} bulkProgress={view.bulkProgress} onCreate={() => view.openDialog(null)} onRefreshAll={view.refreshAll} onShowRuns={() => setRunsOpen(true)} />} />
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
                  pendingIds={view.pendingSiteIds}
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
              pendingIds={view.pendingSiteIds}
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
          selectedSiteId={activeSiteId}
          platformPending={view.platformPending}
          groupTypePending={view.groupTypePending}
          search={view.search}
          onSearch={view.setSearch}
          onPlatformChange={view.setRatePlatform}
          onGroupTypeChange={view.setRateGroupType}
          onBindings={setBindingTarget}
          onConnect={setConnectionTarget}
          onHistory={setHistoryTarget}
          onShowAll={() => setSelectedSiteId(null)}
        />
      </div>
      <SourceSiteDialog open={view.dialog.open} site={view.dialog.site} pending={view.dialogPending} onOpenChange={view.setDialogOpen} onSave={view.saveSite} />
      <SourceRateHistoryDialog target={historyTarget} onOpenChange={setHistoryTarget} />
      <SourceBindingDialog target={bindingTarget} onOpenChange={setBindingTarget} onSaved={view.setRateMappingStatus} />
      <ConnectionCreateDialog
        open={connectionTarget !== null}
        preset={connectionTarget ? { siteId: connectionTarget.siteId, groupId: connectionTarget.groupId, groupType: connectionTarget.groupType ?? connectionTarget.platform } : null}
        onOpenChange={(open) => { if (!open) setConnectionTarget(null); }}
        onCreated={(connection) => {
          if (connectionTarget) view.setRateConnectionStatus(connectionTarget, connection);
        }}
      />
      <SourceCollectionRunsDialog open={runsOpen} siteId={activeSiteId} onOpenChange={setRunsOpen} />
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
          {selectedName ? `当前筛选：${selectedName}` : "全部采集站"}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {expanded ? "收起站点列表，优先查看倍率" : `展开选择站点（共 ${sitesCount} 个）`}
        </p>
      </div>
      <ChevronDown className={`size-4 shrink-0 text-muted transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
    </Button>
  );
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

function SourceActions({ bulkPending, bulkProgress, onCreate, onRefreshAll, onShowRuns }: Readonly<{ bulkPending: boolean; bulkProgress: { readonly completed: number; readonly total: number } | null; onCreate: () => void; onRefreshAll: () => void; onShowRuns: () => void }>) {
  return (
    <div className="page-actions">
      <div className="page-actions-primary"><Action primary icon={<Plus className="size-3.5" />} label="添加采集站" text="添加站点" onClick={onCreate} /></div>
      <div className="page-actions-secondary"><Action icon={<History className="size-3.5" />} label="查看采集记录" text="采集记录" onClick={onShowRuns} /><RefreshAllAction bulkPending={bulkPending} bulkProgress={bulkProgress} onRefreshAll={onRefreshAll} /></div>
      <OverflowActions className="page-actions-overflow"><OverflowAction onClick={onShowRuns}><History />采集记录</OverflowAction><OverflowAction disabled={bulkPending} onClick={onRefreshAll}>{bulkPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}{bulkProgress && bulkProgress.total > 0 ? `刷新 ${bulkProgress.completed}/${bulkProgress.total}` : "刷新全部"}</OverflowAction></OverflowActions>
    </div>
  );
}

function RefreshAllAction({ bulkPending, bulkProgress, onRefreshAll }: Readonly<{ bulkPending: boolean; bulkProgress: { readonly completed: number; readonly total: number } | null; onRefreshAll: () => void }>) {
  return <Action icon={bulkPending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} label="重新请求全部远端" text="刷新全部" activeText={bulkProgress && bulkProgress.total > 0 ? `刷新 ${bulkProgress.completed}/${bulkProgress.total}` : undefined} onClick={onRefreshAll} disabled={bulkPending} />;
}

function Action({ icon, label, text, activeText, primary, ...button }: Readonly<{ icon: React.ReactNode; label: string; text: string; activeText?: string; primary?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>>) {
  return (
    <Button type="button" variant={primary ? "default" : "secondary"} aria-label={label} title={label} {...button}>
      {icon}
      {activeText ?? text}
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
