"use client";

import { ArrowDownNarrowWide, ArrowUpNarrowWide, Cable, ChevronLeft, ChevronRight, History, Link2, List, Search, Settings2, Tags } from "lucide-react";
import { useEffect, useState } from "react";
import { PlatformLabel } from "../platform-icon";
import { Button } from "../ui/button";
import { EffectiveRateValue } from "../ui/effective-rate-value";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Tag } from "../ui/tag";
import type { SourceRateHistoryTarget, SourceRateView, SourceSiteView } from "./types";

const PLATFORM_OPTIONS = [
  { value: "auto", label: "自动识别" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "gemini", label: "Gemini" },
  { value: "new-api", label: "New API" },
] as const;
const PLATFORM_LABELS: Readonly<Record<string, string>> = { openai: "OpenAI", anthropic: "Anthropic", gemini: "Gemini", "new-api": "New API" };
const GROUP_TYPE_OPTIONS = [
  { value: "unset", label: "未设置" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "gemini", label: "Gemini" },
  { value: "antigravity", label: "Antigravity" },
] as const;

export function SourceRatesTable({ rates, sites, selectedSiteId, platformPending, groupTypePending, search, onSearch, onPlatformChange, onGroupTypeChange, onBindings, onConnect, onHistory, onShowAll }: Readonly<{
  rates: readonly SourceRateView[];
  sites: readonly SourceSiteView[];
  selectedSiteId: number | null;
  platformPending: string;
  groupTypePending: string;
  search: string;
  onSearch: (value: string) => void;
  onPlatformChange: (rate: SourceRateView, platform: string | null) => void;
  onGroupTypeChange: (rate: SourceRateView, groupType: string | null) => void;
  onBindings: (target: SourceRateHistoryTarget) => void;
  onConnect: (target: SourceRateHistoryTarget) => void;
  onHistory: (target: SourceRateHistoryTarget) => void;
  onShowAll: () => void;
}>) {
  const [rateOrder, setRateOrder] = useState<RateOrder>("desc");
  const [status, setStatus] = useState<RateStatus>("all");
  const [platform, setPlatform] = useState("all");
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);
  const [pageSizeReady, setPageSizeReady] = useState(false);
  const names = new Map(sites.map((site) => [site.id, site.name]));
  const query = search.trim().toLowerCase();
  const selectedSiteName = selectedSiteId === null ? null : names.get(selectedSiteId) ?? `#${selectedSiteId}`;
  const siteRates = rates.filter((rate) => matchesSite(rate, selectedSiteId));
  const platformOptions = ratePlatformOptions(siteRates);
  const selectedPlatform = platformOptions.some((option) => option.value === platform) ? platform : "all";
  const statusScope = siteRates.filter((rate) => matchesPlatform(rate, selectedPlatform) && matchesSearch(rate, names, query));
  const statusOptions = rateStatusOptions(statusScope);
  const filtered = sortRates(statusScope.filter((rate) => matchesStatus(rate, status)), rateOrder);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleRates = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  useEffect(() => setPage(1), [platform, rateOrder, search, selectedSiteId, status]);
  useEffect(() => {
    if (pageSizeReady || typeof window === "undefined") return;
    const wide = window.matchMedia("(min-width: 1280px)").matches;
    const ultra = window.matchMedia("(min-width: 1536px)").matches;
    setPageSize(ultra ? 20 : wide ? 15 : DEFAULT_PAGE_SIZE);
    setPageSizeReady(true);
  }, [pageSizeReady]);
  return (
    <section className="panel min-w-0 overflow-hidden" aria-labelledby="source-rates-title">
      <div className="panel-header"><div><h2 id="source-rates-title" className="panel-title">采集分组倍率</h2><p className="panel-description">{selectedSiteName ? `当前仅展示「${selectedSiteName}」` : "汇总所有采集站最近一次成功快照。"}</p></div><Tag>{filtered.length} 条</Tag></div>
      <RateToolbar rateOrder={rateOrder} platform={selectedPlatform} platformOptions={platformOptions} status={status} statusOptions={statusOptions} selected={selectedSiteId !== null} search={search} onOrderChange={() => setRateOrder(nextRateOrder(rateOrder))} onPlatformChange={setPlatform} onStatusChange={(value) => setStatus(value as RateStatus)} onSearch={onSearch} onShowAll={onShowAll} />
      <div className="p-3 sm:p-4">{filtered.length === 0 ? <p className="empty-state">没有匹配的分组倍率。</p> : <><RateRecords rates={visibleRates} names={names} platformPending={platformPending} groupTypePending={groupTypePending} onPlatformChange={onPlatformChange} onGroupTypeChange={onGroupTypeChange} onBindings={onBindings} onConnect={onConnect} onHistory={onHistory} /><Pagination total={filtered.length} page={currentPage} pageCount={pageCount} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} /></>}</div>
    </section>
  );
}

function RateToolbar(input: Readonly<{ rateOrder: RateOrder; platform: string; platformOptions: readonly SelectOption[]; status: RateStatus; statusOptions: readonly SelectOption[]; selected: boolean; search: string; onOrderChange: () => void; onPlatformChange: (value: string) => void; onStatusChange: (value: string) => void; onSearch: (value: string) => void; onShowAll: () => void }>) {
  return <div role="group" aria-label="倍率筛选与排序" className="flex flex-col gap-2 border-b border-border bg-surface-muted/35 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center lg:px-5"><Label className="relative block min-w-0 flex-1 sm:min-w-56"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" /><span className="sr-only">搜索采集倍率</span><Input aria-label="搜索采集倍率" value={input.search} onChange={(event) => input.onSearch(event.target.value)} placeholder="搜索站点、分组或平台" className="pl-9" /></Label><div className="grid grid-cols-2 gap-2 sm:contents"><div className="min-w-0 sm:w-36 sm:shrink-0"><Select ariaLabel="平台筛选" value={input.platform} options={input.platformOptions} onValueChange={input.onPlatformChange} /></div><div className="min-w-0 sm:w-40 sm:shrink-0"><Select ariaLabel="映射状态" value={input.status} options={input.statusOptions} onValueChange={input.onStatusChange} /></div></div><div className="grid grid-cols-2 gap-2 sm:contents"><Button type="button" variant="secondary" onClick={input.onOrderChange} className="min-w-0 px-3">{input.rateOrder === "desc" ? <ArrowDownNarrowWide className="size-3.5" /> : <ArrowUpNarrowWide className="size-3.5" />}{rateOrderLabel(input.rateOrder)}</Button><Button type="button" variant="secondary" disabled={!input.selected} onClick={input.onShowAll} className="min-w-0 px-3"><List className="size-3.5" />展示全部</Button></div></div>;
}

function RateRecords({ rates, names, platformPending, groupTypePending, onPlatformChange, onGroupTypeChange, onBindings, onConnect, onHistory }: Readonly<{ rates: readonly SourceRateView[]; names: ReadonlyMap<number, string>; platformPending: string; groupTypePending: string; onPlatformChange: (rate: SourceRateView, platform: string | null) => void; onGroupTypeChange: (rate: SourceRateView, groupType: string | null) => void; onBindings: (target: SourceRateHistoryTarget) => void; onConnect: (target: SourceRateHistoryTarget) => void; onHistory: (target: SourceRateHistoryTarget) => void }>) {
  return (
    <>
      <div className="divide-y divide-border md:hidden">{rates.map((rate) => <RateCard key={rateKey(rate)} rate={rate} siteName={names.get(rate.sourceSiteId) ?? `#${rate.sourceSiteId}`} platformPending={platformPending === rateKey(rate)} groupTypePending={groupTypePending === rateKey(rate)} onPlatformChange={onPlatformChange} onGroupTypeChange={onGroupTypeChange} onBindings={onBindings} onConnect={onConnect} onHistory={onHistory} />)}</div>
      <div className="table-shell embedded-table-viewport hidden md:block"><Table aria-label="采集分组倍率" className="data-table data-table-sticky min-w-[1120px]"><TableHeader><TableRow><TableHead>分组</TableHead><TableHead>ID / 采集站</TableHead><TableHead>平台</TableHead><TableHead>分组类型</TableHead><TableHead className="text-right">原始倍率</TableHead><TableHead className="text-right">有效倍率</TableHead><TableHead className="text-right">变化</TableHead><TableHead>最后采集</TableHead><TableHead className="sticky-action-header">操作</TableHead></TableRow></TableHeader><TableBody>{rates.map((rate) => <RateRow key={rateKey(rate)} rate={rate} siteName={names.get(rate.sourceSiteId) ?? `#${rate.sourceSiteId}`} platformPending={platformPending === rateKey(rate)} groupTypePending={groupTypePending === rateKey(rate)} onPlatformChange={onPlatformChange} onGroupTypeChange={onGroupTypeChange} onBindings={onBindings} onConnect={onConnect} onHistory={onHistory} />)}</TableBody></Table></div>
    </>
  );
}

function RateRow({ rate, siteName, platformPending, groupTypePending, onPlatformChange, onGroupTypeChange, onBindings, onConnect, onHistory }: RateRecordProps) {
  return <TableRow><TableCell><span className="font-medium">{rate.groupName}</span></TableCell><TableCell><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs tabular-nums text-muted">#{rate.groupId}</span><SiteTag name={siteName} /><ConnectionTags rate={rate} /></div></TableCell><TableCell><Tag><PlatformLabel platform={rate.platform} fallback="未知平台" /></Tag></TableCell><TableCell><GroupTypeTag groupType={rate.groupType} /></TableCell><TableCell className="text-right font-mono tabular-nums text-rate">{formatRate(rate.rawRate)}</TableCell><TableCell className="text-right">{rate.deleted ? <Tag tone="danger">已删除</Tag> : <EffectiveRateValue>×{formatRate(rate.effectiveRate)}</EffectiveRateValue>}</TableCell><TableCell className="text-right font-mono text-xs tabular-nums"><DeltaValue rate={rate} /></TableCell><TableCell className="whitespace-nowrap text-xs text-muted">{formatTime(rate.collectedAt)}</TableCell><TableCell className="sticky-action-cell"><RateActions rate={rate} siteName={siteName} platformPending={platformPending} groupTypePending={groupTypePending} onPlatformChange={onPlatformChange} onGroupTypeChange={onGroupTypeChange} onBindings={onBindings} onConnect={onConnect} onHistory={onHistory} /></TableCell></TableRow>;
}

function RateCard(props: RateRecordProps) {
  const { rate, siteName } = props;
  return <article className="py-3 transition-colors hover:bg-surface-muted/35"><div className="flex justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-medium" title={rate.groupName}>{rate.groupName}</h3><div className="mt-1 flex flex-wrap items-center gap-1.5"><Tag>#{rate.groupId}</Tag><SiteTag name={siteName} /><ConnectionTags rate={rate} /><Tag><PlatformLabel platform={rate.platform} fallback="未知平台" /></Tag><GroupTypeTag groupType={rate.groupType} /></div></div>{rate.deleted ? <Tag tone="danger">已删除</Tag> : <EffectiveRateValue className="shrink-0 text-lg">×{formatRate(rate.effectiveRate)}</EffectiveRateValue>}</div><dl className="mt-2.5 grid grid-cols-2 gap-2.5 border-t border-border pt-2.5 text-sm"><div><dt className="text-xs text-muted">原始倍率</dt><dd className="mt-1 font-mono tabular-nums text-rate">{formatRate(rate.rawRate)}</dd></div><div><dt className="text-xs text-muted">变化</dt><dd className="mt-1 font-mono text-xs tabular-nums"><DeltaValue rate={rate} /></dd></div><div className="col-span-2"><dt className="text-xs text-muted">最后采集</dt><dd className="mt-1 text-xs leading-5">{formatTime(rate.collectedAt)}</dd></div></dl><div className="mt-2.5 flex justify-end gap-1"><RateActions {...props} /></div></article>;
}

function RateActions(props: RateRecordProps) {
  if (props.rate.deleted) return <HistoryButton rate={props.rate} siteName={props.siteName} onHistory={props.onHistory} />;
  return <div className="flex justify-end gap-1"><ConnectButton rate={props.rate} siteName={props.siteName} onConnect={props.onConnect} /><BindingButton rate={props.rate} siteName={props.siteName} onBindings={props.onBindings} /><HistoryButton rate={props.rate} siteName={props.siteName} onHistory={props.onHistory} /><GroupTypeAction rate={props.rate} pending={props.groupTypePending} onChange={props.onGroupTypeChange} /><PlatformAction rate={props.rate} pending={props.platformPending} onChange={props.onPlatformChange} /></div>;
}

function HistoryButton({ rate, siteName, onHistory }: Readonly<{ rate: SourceRateView; siteName: string; onHistory: (target: SourceRateHistoryTarget) => void }>) {
  return <Button type="button" variant="ghost" size="icon-sm" aria-label="查看倍率历史" title="查看倍率历史" className="compact-icon-button" onClick={() => onHistory(rateTarget(rate, siteName))}><History className="size-3.5" /></Button>;
}

function BindingButton({ rate, siteName, onBindings }: Readonly<{ rate: SourceRateView; siteName: string; onBindings: (target: SourceRateHistoryTarget) => void }>) {
  return <Button type="button" variant="ghost" size="icon-sm" aria-label="管理目标分组关联" title="管理目标分组关联" className="compact-icon-button" onClick={() => onBindings(rateTarget(rate, siteName))}><Link2 className="size-3.5" /></Button>;
}

function ConnectButton({ rate, siteName, onConnect }: Readonly<{ rate: SourceRateView; siteName: string; onConnect: (target: SourceRateHistoryTarget) => void }>) {
  const label = connectionActionLabel(rate);
  const title = rate.connectionError ? `${label}：${rate.connectionError}` : label;
  return <Button type="button" variant="ghost" size="icon-sm" aria-label={label} title={title} disabled={hasOpenConnection(rate)} className="compact-icon-button" onClick={() => onConnect(rateTarget(rate, siteName))}><Cable className="size-3.5" /></Button>;
}

function GroupTypeAction({ rate, pending, onChange }: Readonly<{ rate: SourceRateView; pending: boolean; onChange: (rate: SourceRateView, groupType: string | null) => void }>) {
  return <Select ariaLabel={`${rate.groupName}设置分组类型`} value={rate.groupType ?? "unset"} options={GROUP_TYPE_OPTIONS} disabled={pending || hasOpenConnection(rate)} triggerIcon={<Tags className={`size-3 ${pending ? "animate-pulse" : ""}`} />} onValueChange={(value) => onChange(rate, value === "unset" ? null : value)} />;
}

function PlatformAction({ rate, pending, onChange }: Readonly<{ rate: SourceRateView; pending: boolean; onChange: (rate: SourceRateView, platform: string | null) => void }>) {
  return <Select ariaLabel={`${rate.groupName}设置展示平台`} value={rate.platformOverride ?? "auto"} options={PLATFORM_OPTIONS} disabled={pending} triggerIcon={<Settings2 className={`size-3 ${pending ? "animate-spin" : ""}`} />} onValueChange={(value) => onChange(rate, value === "auto" ? null : value)} />;
}

function SiteTag({ name }: Readonly<{ name: string }>) {
  return <Tag title={name} tone="info"><span className="max-w-36 truncate 2xl:max-w-48">{name}</span></Tag>;
}

function ConnectionTags({ rate }: Readonly<{ rate: SourceRateView }>) {
  if (rate.deleted) return <Tag tone="danger">已删除</Tag>;
  if (!hasOpenConnection(rate) && !rate.pricingMapped) return <Tag>未配置</Tag>;
  return <>{rate.connectionStatus ? <Tag tone={connectionTone(rate.connectionStatus)} title={rate.connectionError ?? undefined}>{connectionStatusLabel(rate.connectionStatus)}</Tag> : null}{rate.pricingMapped ? <Tag tone="warning">已用于调价</Tag> : null}</>;
}

function GroupTypeTag({ groupType }: Readonly<{ groupType?: string | null }>) { return <Tag tone={groupType ? "info" : "neutral"}>{GROUP_TYPE_OPTIONS.find((option) => option.value === groupType)?.label ?? "未设置"}</Tag>; }

function DeltaValue({ rate }: Readonly<{ rate: SourceRateView }>) {
  if (rate.deleted) return <span className="text-danger">—</span>;
  if (rate.delta === null || rate.delta === undefined) return <span className="text-muted">—</span>;
  const sign = rate.delta > 0 ? "+" : "";
  return <span className={rate.delta > 0 ? "text-danger" : rate.delta < 0 ? "text-success" : "text-muted"}>{sign}{formatRate(rate.delta)}{rate.deltaPercent === null || rate.deltaPercent === undefined ? "" : ` (${sign}${Number(rate.deltaPercent.toFixed(2))}%)`}</span>;
}

function Pagination({ total, page, pageCount, pageSize, onPageChange, onPageSizeChange }: Readonly<{ total: number; page: number; pageCount: number; pageSize: number; onPageChange: (value: number) => void; onPageSizeChange: (value: number) => void }>) {
  return <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2 text-sm text-muted"><span>共 {total} 条</span><span>每页</span><div className="w-20"><Select ariaLabel="每页展示条数" value={String(pageSize)} options={PAGE_SIZE_OPTIONS} onValueChange={(value) => onPageSizeChange(Number(value))} /></div></div><div className="flex items-center justify-between gap-2 sm:justify-end"><span className="mr-1 text-sm tabular-nums text-muted">第 {page} / {pageCount} 页</span><Button type="button" variant="ghost" size="icon-sm" aria-label="上一页" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="compact-icon-button"><ChevronLeft className="size-3.5" /></Button><Button type="button" variant="ghost" size="icon-sm" aria-label="下一页" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)} className="compact-icon-button"><ChevronRight className="size-3.5" /></Button></div></div>;
}

function matchesSite(rate: SourceRateView, selectedSiteId: number | null) { return selectedSiteId === null || rate.sourceSiteId === selectedSiteId; }
function matchesPlatform(rate: SourceRateView, platform: string) { return platform === "all" || rate.platform === platform; }
function matchesStatus(rate: SourceRateView, status: RateStatus) {
  if (status === "deleted") return rate.deleted === true;
  if (rate.deleted) return false;
  if (status === "connected") return rate.connected === true;
  if (status === "connection") return hasOpenConnection(rate) && rate.connectionStatus !== "active";
  if (status === "pricing") return rate.pricingMapped === true;
  if (status === "unmapped") return !hasOpenConnection(rate) && !rate.pricingMapped;
  return status === "all";
}
function matchesSearch(rate: SourceRateView, names: ReadonlyMap<number, string>, query: string) { return [names.get(rate.sourceSiteId), rate.groupName, rate.groupId, rate.platform, rate.groupType].some((value) => value?.toLowerCase().includes(query)); }

function rateKey(rate: SourceRateView) { return `${rate.sourceSiteId}:${rate.groupId}`; }
function rateTarget(rate: SourceRateView, siteName: string): SourceRateHistoryTarget { return { siteId: rate.sourceSiteId, siteName, groupId: rate.groupId, groupName: rate.groupName, platform: rate.platform, groupType: rate.groupType }; }
function ratePlatformOptions(rates: readonly SourceRateView[]): SelectOption[] {
  const platforms = [...new Set(rates.map((rate) => rate.platform).filter((value): value is string => Boolean(value)))].sort();
  return [{ value: "all", label: "全部平台" }, ...platforms.map((value) => ({ value, label: PLATFORM_LABELS[value] ?? value }))];
}
function rateStatusOptions(rates: readonly SourceRateView[]): SelectOption[] {
  const active = rates.filter((rate) => !rate.deleted);
  return [
    { value: "all", label: `全部 (${active.length})` },
    { value: "connected", label: `已对接 (${active.filter((rate) => rate.connected).length})` },
    { value: "connection", label: `对接处理中 / 异常 (${active.filter((rate) => hasOpenConnection(rate) && rate.connectionStatus !== "active").length})` },
    { value: "pricing", label: `已用于调价 (${active.filter((rate) => rate.pricingMapped).length})` },
    { value: "unmapped", label: `未配置 (${active.filter((rate) => !hasOpenConnection(rate) && !rate.pricingMapped).length})` },
    { value: "deleted", label: `已删除 (${rates.filter((rate) => rate.deleted).length})` },
  ];
}
function formatRate(value: number | null) { return value === null ? "-" : Number(value.toFixed(4)).toString(); }
function formatTime(value: string) { return new Date(value).toLocaleString("zh-CN"); }
function nextRateOrder(order: RateOrder): RateOrder { return order === "asc" ? "desc" : "asc"; }
function rateOrderLabel(order: RateOrder) { return order === "desc" ? "有效倍率：高到低" : "有效倍率：低到高"; }
function sortRates(rates: readonly SourceRateView[], order: RateOrder) { return [...rates].sort((left, right) => compareRates(left.effectiveRate, right.effectiveRate, order)); }
function compareRates(left: number | null, right: number | null, order: RateOrder) { if (left === null) return right === null ? 0 : 1; if (right === null) return -1; return (order === "asc" ? 1 : -1) * (left - right); }
type RateOrder = "asc" | "desc";
function hasOpenConnection(rate: SourceRateView) { return Boolean(rate.connectionId && rate.connectionStatus); }
function connectionActionLabel(rate: SourceRateView) {
  return rate.connectionStatus ? connectionStatusLabel(rate.connectionStatus) : "创建真实对接";
}
function connectionStatusLabel(status: NonNullable<SourceRateView["connectionStatus"]>) {
  return { provisioning: "对接创建中", active: "已完成真实对接", disconnecting: "对接断开中", error: "真实对接异常" }[status];
}
function connectionTone(status: NonNullable<SourceRateView["connectionStatus"]>) {
  return ({ provisioning: "info", active: "success", disconnecting: "warning", error: "danger" } as const)[status];
}
type RateStatus = "all" | "connected" | "connection" | "pricing" | "unmapped" | "deleted";
type RateRecordProps = Readonly<{ rate: SourceRateView; siteName: string; platformPending: boolean; groupTypePending: boolean; onPlatformChange: (rate: SourceRateView, platform: string | null) => void; onGroupTypeChange: (rate: SourceRateView, groupType: string | null) => void; onBindings: (target: SourceRateHistoryTarget) => void; onConnect: (target: SourceRateHistoryTarget) => void; onHistory: (target: SourceRateHistoryTarget) => void }>;
type SelectOption = { readonly value: string; readonly label: string };
const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [{ value: "10", label: "10" }, { value: "15", label: "15" }, { value: "20", label: "20" }] as const;
