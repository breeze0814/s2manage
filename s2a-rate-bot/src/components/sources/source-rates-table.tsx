"use client";

import { ArrowDownNarrowWide, ArrowUpNarrowWide, ChevronLeft, ChevronRight, Search, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import { PlatformLabel } from "../platform-icon";
import { Button } from "../ui/button";
import { EffectiveRateValue } from "../ui/effective-rate-value";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Tag, type TagTone } from "../ui/tag";
import { SourceRateTabs, sourceRatePanelId, sourceRateTabId } from "./source-rate-tabs";
import type { SourceRateView, SourceSiteView } from "./types";

const PLATFORM_OPTIONS = [
  { value: "auto", label: "自动识别" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "gemini", label: "Gemini" },
  { value: "new-api", label: "New API" },
] as const;

export function SourceRatesTable({ rates, sites, activeSiteId, platformPending, search, onSearch, onPlatformChange, onSiteChange }: Readonly<{
  rates: readonly SourceRateView[];
  sites: readonly SourceSiteView[];
  activeSiteId: number | null;
  platformPending: string;
  search: string;
  onSearch: (value: string) => void;
  onPlatformChange: (rate: SourceRateView, platform: string | null) => void;
  onSiteChange: (siteId: number) => void;
}>) {
  const [rateOrder, setRateOrder] = useState<RateOrder>("desc");
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);
  const [pageSizeReady, setPageSizeReady] = useState(false);
  const activeSite = sites.find((site) => site.id === activeSiteId) ?? null;
  const query = search.trim().toLowerCase();
  const filtered = sortRates(
    rates.filter((rate) => rate.sourceSiteId === activeSiteId && matchesSearch(rate, query)),
    rateOrder,
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleRates = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => setPage(1), [rateOrder, search, activeSiteId]);
  useEffect(() => {
    if (pageSizeReady || typeof window === "undefined") return;
    const wide = window.matchMedia("(min-width: 1280px)").matches;
    const ultra = window.matchMedia("(min-width: 1536px)").matches;
    setPageSize(ultra ? 20 : wide ? 15 : DEFAULT_PAGE_SIZE);
    setPageSizeReady(true);
  }, [pageSizeReady]);

  return (
    <section className="panel min-w-0 overflow-hidden" aria-labelledby="source-rates-title">
      <RateHeader activeSite={activeSite} rateCount={filtered.length} />
      <SourceRateTabs sites={sites} activeSiteId={activeSiteId} onChange={onSiteChange} />
      {activeSite ? <SiteSummary site={activeSite} /> : null}
      <RateToolbar rateOrder={rateOrder} search={search} onOrderChange={() => setRateOrder(nextRateOrder(rateOrder))} onSearch={onSearch} />
      <div
        id={activeSiteId === null ? undefined : sourceRatePanelId()}
        role="tabpanel"
        aria-labelledby={activeSiteId === null ? undefined : sourceRateTabId(activeSiteId)}
        className="p-3 sm:p-4"
      >
        {filtered.length === 0 ? <p className="empty-state">{emptyMessage(activeSite, query)}</p> : <RateContent rates={visibleRates} total={filtered.length} page={currentPage} pageCount={pageCount} pageSize={pageSize} platformPending={platformPending} onPlatformChange={onPlatformChange} onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} />}
      </div>
    </section>
  );
}

function RateHeader({ activeSite, rateCount }: Readonly<{ activeSite: SourceSiteView | null; rateCount: number }>) {
  return <div className="panel-header"><div><h2 id="source-rates-title" className="panel-title">采集分组倍率</h2><p className="panel-description">{activeSite ? `当前展示「${activeSite.name}」的最近一次成功快照。` : "请先添加采集站，倍率快照将在采集成功后显示。"}</p></div><Tag>{activeSite ? `${rateCount} 条` : "暂无"}</Tag></div>;
}

function SiteSummary({ site }: Readonly<{ site: SourceSiteView }>) {
  return <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3 text-xs text-muted lg:px-5"><Tag tone={siteStatusTone(site)}>{siteStatusText(site)}</Tag><span>余额：{formatBalance(site.balance)}</span><span>充值：×{formatRate(site.rechargeRatio)}</span><span>最近成功：{site.lastSuccessAt ? formatTime(site.lastSuccessAt) : "暂无"}</span></div>;
}

function RateToolbar(input: Readonly<{ rateOrder: RateOrder; search: string; onOrderChange: () => void; onSearch: (value: string) => void }>) {
  return <div role="group" aria-label="倍率筛选与排序" className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-muted/35 px-4 py-3 lg:px-5"><Label className="relative block min-w-64 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" /><span className="sr-only">搜索采集倍率</span><Input aria-label="搜索采集倍率" value={input.search} onChange={(event) => input.onSearch(event.target.value)} placeholder="搜索分组或平台" className="pl-9" /></Label><Button type="button" variant="secondary" onClick={input.onOrderChange} className="shrink-0 px-3">{input.rateOrder === "desc" ? <ArrowDownNarrowWide className="size-3.5" /> : <ArrowUpNarrowWide className="size-3.5" />}{rateOrderLabel(input.rateOrder)}</Button></div>;
}

function RateContent({ rates, total, page, pageCount, pageSize, platformPending, onPlatformChange, onPageChange, onPageSizeChange }: Readonly<{ rates: readonly SourceRateView[]; total: number; page: number; pageCount: number; pageSize: number; platformPending: string; onPlatformChange: (rate: SourceRateView, platform: string | null) => void; onPageChange: (value: number) => void; onPageSizeChange: (value: number) => void }>) {
  return <><RateRecords rates={rates} platformPending={platformPending} onPlatformChange={onPlatformChange} /><Pagination total={total} page={page} pageCount={pageCount} pageSize={pageSize} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} /></>;
}

function RateRecords({ rates, platformPending, onPlatformChange }: Readonly<{ rates: readonly SourceRateView[]; platformPending: string; onPlatformChange: (rate: SourceRateView, platform: string | null) => void }>) {
  return <><div className="divide-y divide-border md:hidden">{rates.map((rate) => <RateCard key={rateKey(rate)} rate={rate} pending={platformPending === rateKey(rate)} onPlatformChange={onPlatformChange} />)}</div><div className="table-shell embedded-table-viewport hidden md:block"><Table aria-label="采集分组倍率" className="data-table data-table-sticky min-w-[780px]"><TableHeader><TableRow><TableHead>分组 ID</TableHead><TableHead>平台</TableHead><TableHead className="text-right">原始倍率</TableHead><TableHead className="text-right">有效倍率</TableHead><TableHead>最后采集</TableHead><TableHead className="sticky-action-header">操作</TableHead></TableRow></TableHeader><TableBody>{rates.map((rate) => <RateRow key={rateKey(rate)} rate={rate} pending={platformPending === rateKey(rate)} onPlatformChange={onPlatformChange} />)}</TableBody></Table></div></>;
}

function RateRow({ rate, pending, onPlatformChange }: Readonly<{ rate: SourceRateView; pending: boolean; onPlatformChange: (rate: SourceRateView, platform: string | null) => void }>) {
  return <TableRow><TableCell><div className="min-w-0"><span className="block truncate font-medium" title={rate.groupName}>{rate.groupName}</span><span className="font-mono text-xs tabular-nums text-muted">#{rate.groupId}</span></div></TableCell><TableCell><Tag><PlatformLabel platform={rate.platform} fallback="未知平台" /></Tag></TableCell><TableCell className="text-right font-mono tabular-nums text-rate">{formatRate(rate.rawRate)}</TableCell><TableCell className="text-right"><EffectiveRateValue>×{formatRate(rate.effectiveRate)}</EffectiveRateValue></TableCell><TableCell className="whitespace-nowrap text-xs text-muted">{formatTime(rate.collectedAt)}</TableCell><TableCell className="sticky-action-cell"><div className="flex justify-end"><PlatformAction rate={rate} pending={pending} onChange={onPlatformChange} /></div></TableCell></TableRow>;
}

function RateCard({ rate, pending, onPlatformChange }: Readonly<{ rate: SourceRateView; pending: boolean; onPlatformChange: (rate: SourceRateView, platform: string | null) => void }>) {
  return <article className="py-4 transition-colors hover:bg-surface-muted/35"><div className="flex justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-medium" title={rate.groupName}>{rate.groupName}</h3><div className="mt-1 flex flex-wrap items-center gap-1.5"><Tag>#{rate.groupId}</Tag><Tag><PlatformLabel platform={rate.platform} fallback="未知平台" /></Tag></div></div><EffectiveRateValue className="shrink-0 text-lg">×{formatRate(rate.effectiveRate)}</EffectiveRateValue></div><dl className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm"><div><dt className="text-xs text-muted">原始倍率</dt><dd className="mt-1 font-mono tabular-nums text-rate">{formatRate(rate.rawRate)}</dd></div><div><dt className="text-xs text-muted">最后采集</dt><dd className="mt-1 text-xs leading-5">{formatTime(rate.collectedAt)}</dd></div></dl><div className="mt-3 flex justify-end"><PlatformAction rate={rate} pending={pending} onChange={onPlatformChange} /></div></article>;
}

function PlatformAction({ rate, pending, onChange }: Readonly<{ rate: SourceRateView; pending: boolean; onChange: (rate: SourceRateView, platform: string | null) => void }>) {
  return <Select ariaLabel={`${rate.groupName}设置展示平台`} value={rate.platformOverride ?? "auto"} options={PLATFORM_OPTIONS} disabled={pending} triggerIcon={<Settings2 className={`size-3 ${pending ? "animate-spin" : ""}`} />} onValueChange={(value) => onChange(rate, value === "auto" ? null : value)} />;
}

function Pagination({ total, page, pageCount, pageSize, onPageChange, onPageSizeChange }: Readonly<{ total: number; page: number; pageCount: number; pageSize: number; onPageChange: (value: number) => void; onPageSizeChange: (value: number) => void }>) {
  return <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2 text-sm text-muted"><span>共 {total} 条</span><span>每页</span><div className="w-20"><Select ariaLabel="每页展示条数" value={String(pageSize)} options={PAGE_SIZE_OPTIONS} onValueChange={(value) => onPageSizeChange(Number(value))} /></div></div><div className="flex items-center justify-between gap-2 sm:justify-end"><span className="mr-1 text-sm tabular-nums text-muted">第 {page} / {pageCount} 页</span><Button type="button" variant="ghost" size="icon-sm" aria-label="上一页" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="compact-icon-button"><ChevronLeft className="size-3.5" /></Button><Button type="button" variant="ghost" size="icon-sm" aria-label="下一页" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)} className="compact-icon-button"><ChevronRight className="size-3.5" /></Button></div></div>;
}

function matchesSearch(rate: SourceRateView, query: string) { return [rate.groupName, rate.groupId, rate.platform].some((value) => value?.toLowerCase().includes(query)); }
function emptyMessage(site: SourceSiteView | null, query: string) { if (!site) return "暂无采集站，请先添加采集站。"; return query ? "没有匹配的分组倍率。" : "该采集站暂无成功倍率快照。"; }
function siteStatusText(site: SourceSiteView) { if (!site.enabled) return "已停用"; if (site.lastStatus === "failed") return "最近采集失败"; return "采集正常"; }
function siteStatusTone(site: SourceSiteView): TagTone { if (!site.enabled) return "neutral"; return site.lastStatus === "failed" ? "danger" : "success"; }
function formatBalance(value: number | null) { return value === null ? "未同步" : value.toFixed(2); }
function rateKey(rate: SourceRateView) { return `${rate.sourceSiteId}:${rate.groupId}`; }
function formatRate(value: number | null) { return value === null ? "-" : Number(value.toFixed(4)).toString(); }
function formatTime(value: string) { return new Date(value).toLocaleString("zh-CN"); }
function nextRateOrder(order: RateOrder): RateOrder { return order === "asc" ? "desc" : "asc"; }
function rateOrderLabel(order: RateOrder) { return order === "desc" ? "有效倍率：高到低" : "有效倍率：低到高"; }
function sortRates(rates: readonly SourceRateView[], order: RateOrder) { return [...rates].sort((left, right) => compareRates(left.effectiveRate, right.effectiveRate, order)); }
function compareRates(left: number | null, right: number | null, order: RateOrder) { if (left === null) return right === null ? 0 : 1; if (right === null) return -1; return (order === "asc" ? 1 : -1) * (left - right); }
type RateOrder = "asc" | "desc";
const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [{ value: "10", label: "10" }, { value: "15", label: "15" }, { value: "20", label: "20" }] as const;
