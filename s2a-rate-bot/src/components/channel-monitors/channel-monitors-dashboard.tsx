"use client";

import { Activity, Database, Loader2, RefreshCw, Settings2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SourceChannelMonitorsView } from "../sources/source-channel-monitors-view";
import type { SourceSiteView } from "../sources/types";
import { Button } from "../ui/button";
import { OverflowAction, OverflowActions } from "../ui/overflow-actions";
import { Tag } from "../ui/tag";

export function ChannelMonitorsDashboard() {
  const [sites, setSites] = useState<SourceSiteView[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSites = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await loadSourceSites();
      setSites(next);
      setSelectedSiteId((current) => next.some((site) => site.id === current) ? current : next[0]?.id ?? null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadSites(); }, [loadSites]);

  const selectedSite = sites.find((site) => site.id === selectedSiteId) ?? null;
  return (
    <section className="page-stack">
      <header className="page-header">
        <div className="min-w-0">
          <h1 className="page-heading">渠道监控</h1>
          <p className="page-description">按采集站查看渠道可用率、状态与延迟趋势</p>
        </div>
        <div className="page-actions">
          <div className="page-actions-primary"><Button type="button" variant="secondary" onClick={() => void loadSites()} disabled={loading}>
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}刷新站点
          </Button></div>
          <div className="page-actions-secondary"><Button asChild variant="secondary"><Link href="/sources"><Settings2 className="size-3.5" />管理采集站</Link></Button></div>
          <OverflowActions className="page-actions-overflow"><Link role="menuitem" className="overflow-action" href="/sources"><Settings2 />管理采集站</Link></OverflowActions>
        </div>
      </header>

      {loading && sites.length === 0 ? <PageLoading /> : error ? <PageError message={error} onRetry={() => void loadSites()} /> : sites.length === 0 ? <NoSites /> : (
        <div className="min-w-0">
          <SiteTabs sites={sites} selectedSiteId={selectedSiteId} onSelect={setSelectedSiteId} />
          <div id="site-monitor-panel" role="tabpanel" aria-labelledby={selectedSite ? `site-monitor-tab-${selectedSite.id}` : undefined} className="pt-5 sm:pt-6">
            <SiteMonitorContent site={selectedSite} />
          </div>
        </div>
      )}
    </section>
  );
}

function SiteTabs({ sites, selectedSiteId, onSelect }: Readonly<{
  sites: readonly SourceSiteView[];
  selectedSiteId: number | null;
  onSelect: (siteId: number) => void;
}>) {
  return (
    <div className="overflow-x-auto border-b border-border" aria-label="采集站渠道监控">
      <div role="tablist" aria-label="采集站" aria-orientation="horizontal" className="flex min-w-max items-end gap-1 px-1">
        {sites.map((site, index) => {
          const selected = site.id === selectedSiteId;
          return (
            <Button
              key={site.id}
              id={`site-monitor-tab-${site.id}`}
              type="button"
              variant="ghost"
              role="tab"
              aria-selected={selected}
              aria-controls="site-monitor-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => onSelect(site.id)}
              onKeyDown={(event) => selectTabWithKeyboard(event, index, sites, onSelect)}
              className={`flex min-h-12 max-w-72 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary ${selected ? "border-primary text-primary-strong" : "border-transparent text-muted hover:border-border-strong hover:text-foreground"}`}
            >
              <span className={`size-2 shrink-0 rounded-full ${site.enabled ? "bg-success" : "bg-muted"}`} aria-hidden="true" />
              <span className="truncate" title={site.name}>{site.name}</span>
              <Tag tone={site.siteType === "sub2api" ? "primary" : "neutral"}>{site.siteType === "sub2api" ? "Sub2" : "New API"}</Tag>
            </Button>
          );
        })}
      </div>
    </div>
  );
}

function selectTabWithKeyboard(
  event: React.KeyboardEvent<HTMLButtonElement>,
  index: number,
  sites: readonly SourceSiteView[],
  onSelect: (siteId: number) => void,
) {
  const nextIndex = event.key === "ArrowRight" ? (index + 1) % sites.length
    : event.key === "ArrowLeft" ? (index - 1 + sites.length) % sites.length
      : event.key === "Home" ? 0
        : event.key === "End" ? sites.length - 1
          : null;
  if (nextIndex === null) return;
  event.preventDefault();
  const next = sites[nextIndex];
  if (!next) return;
  onSelect(next.id);
  document.getElementById(`site-monitor-tab-${next.id}`)?.focus();
}

function SiteMonitorContent({ site }: Readonly<{ site: SourceSiteView | null }>) {
  if (!site) return null;
  if (!site.enabled) return <UnavailableState icon={<Database className="size-5" />} title="采集站已停用" detail={site.name} />;
  if (site.siteType !== "sub2api") return <UnavailableState icon={<Activity className="size-5" />} title="该站点暂无渠道监控" detail="渠道监控接口仅由 Sub2API 提供" />;
  return <SourceChannelMonitorsView key={site.id} site={site} />;
}

function UnavailableState({ icon, title, detail }: Readonly<{ icon: React.ReactNode; title: string; detail: string }>) {
  return <div className="empty-state-inline min-h-60 border-y border-dashed border-border bg-surface-muted/30"><span className="text-muted">{icon}</span><p className="mt-2 font-medium text-foreground">{title}</p><p className="mt-1 text-xs text-muted">{detail}</p></div>;
}

function PageLoading() { return <div className="loading-state min-h-72"><Loader2 className="size-4 animate-spin" />正在读取采集站...</div>; }
function PageError({ message, onRetry }: Readonly<{ message: string; onRetry: () => void }>) { return <div className="flex min-h-72 flex-col items-center justify-center gap-3 border-y border-danger/25 bg-danger/10 px-5 text-center text-sm text-danger"><p>{message}</p><Button type="button" variant="secondary" size="sm" onClick={onRetry}><RefreshCw className="size-3.5" />重新请求</Button></div>; }
function NoSites() { return <div className="empty-state-inline min-h-72 border-y border-dashed border-border bg-surface-muted/30"><Database className="size-5 text-muted" /><p className="mt-2">暂无采集站。</p><Button asChild variant="secondary" size="sm" className="mt-3"><Link href="/sources">管理采集站</Link></Button></div>; }

async function loadSourceSites() {
  const response = await fetch("/api/sources", { cache: "no-store" });
  const body = await response.json() as { sites?: SourceSiteView[]; error?: string };
  if (!response.ok) throw new Error(body.error ?? `请求失败 HTTP ${response.status}`);
  if (!Array.isArray(body.sites)) throw new Error("采集站响应无效");
  return body.sites;
}
