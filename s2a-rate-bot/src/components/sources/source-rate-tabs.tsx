"use client";

import type { KeyboardEvent } from "react";
import { Button } from "../ui/button";
import type { SourceSiteView } from "./types";

export function SourceRateTabs({ sites, activeSiteId, onChange }: Readonly<{
  sites: readonly SourceSiteView[];
  activeSiteId: number | null;
  onChange: (siteId: number) => void;
}>) {
  if (sites.length === 0) {
    return <div className="border-b border-border px-4 py-3 text-sm text-muted lg:px-5">暂无采集站</div>;
  }

  return <div role="tablist" aria-label="采集站倍率" aria-orientation="horizontal" className="flex min-w-0 gap-1 overflow-x-auto border-b border-border bg-surface-muted/20 px-3 py-2 lg:px-4">{sites.map((site, index) => <RateTab key={site.id} site={site} index={index} active={site.id === activeSiteId} sites={sites} onChange={onChange} />)}</div>;
}

function RateTab({ site, index, active, sites, onChange }: Readonly<{ site: SourceSiteView; index: number; active: boolean; sites: readonly SourceSiteView[]; onChange: (siteId: number) => void }>) {
  return <Button id={sourceRateTabId(site.id)} type="button" role="tab" aria-selected={active} aria-controls={sourceRatePanelId()} tabIndex={active ? 0 : -1} variant={active ? "default" : "ghost"} size="sm" className="min-w-0 max-w-56 shrink-0 justify-start px-3" title={site.name} onClick={() => onChange(site.id)} onKeyDown={(event) => handleTabKey({ event, index, sites, onChange })}><span className="max-w-36 truncate">{site.name}</span><span className="text-[11px] opacity-75">{siteStatusText(site)}</span></Button>;
}

function handleTabKey({ event, index, sites, onChange }: Readonly<{ event: KeyboardEvent<HTMLButtonElement>; index: number; sites: readonly SourceSiteView[]; onChange: (siteId: number) => void }>) {
  if (sites.length < 2) return;
  const nextIndex = nextTabIndex(event.key, index, sites.length);
  if (nextIndex === null) return;
  event.preventDefault();
  const nextSite = sites[nextIndex];
  onChange(nextSite.id);
  document.getElementById(sourceRateTabId(nextSite.id))?.focus();
}

function nextTabIndex(key: string, index: number, count: number): number | null {
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === "ArrowRight" || key === "ArrowDown") return (index + 1) % count;
  if (key === "ArrowLeft" || key === "ArrowUp") return (index - 1 + count) % count;
  return null;
}

export function sourceRateTabId(siteId: number) { return `source-rate-tab-${siteId}`; }
export function sourceRatePanelId() { return "source-rate-panel"; }

function siteStatusText(site: SourceSiteView) { if (!site.enabled) return "已停用"; if (site.lastStatus === "failed") return "采集失败"; return "已启用"; }
