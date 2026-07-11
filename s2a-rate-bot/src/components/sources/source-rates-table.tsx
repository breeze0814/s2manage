import { Search } from "lucide-react";
import { PlatformLabel } from "../platform-icon";
import { Tag } from "../ui/tag";
import type { SourceRateView, SourceSiteView } from "./types";

export function SourceRatesTable({ rates, sites, search, onSearch }: Readonly<{
  rates: readonly SourceRateView[];
  sites: readonly SourceSiteView[];
  search: string;
  onSearch: (value: string) => void;
}>) {
  const names = new Map(sites.map((site) => [site.id, site.name]));
  const query = search.trim().toLowerCase();
  const filtered = rates.filter((rate) => [names.get(rate.sourceSiteId), rate.groupName, rate.groupId, rate.platform].some((value) => value?.toLowerCase().includes(query)));
  return (
    <section className="panel min-w-0 overflow-hidden" aria-labelledby="source-rates-title">
      <div className="panel-header"><div><h2 id="source-rates-title" className="font-semibold">采集分组倍率</h2><p className="mt-1 text-sm text-muted">汇总所有采集站最近一次成功快照。</p></div><label className="relative block w-full sm:max-w-xs"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" /><span className="sr-only">搜索采集倍率</span><input aria-label="搜索采集倍率" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="搜索站点、分组或平台" className="form-control pl-9" /></label></div>
      <div className="p-4 sm:p-5">{filtered.length === 0 ? <p className="rounded-xl border border-dashed border-border-strong bg-surface-muted p-6 text-center text-sm text-muted">没有匹配的分组倍率。</p> : <RateRecords rates={filtered} names={names} />}</div>
    </section>
  );
}

function RateRecords({ rates, names }: Readonly<{ rates: readonly SourceRateView[]; names: ReadonlyMap<number, string> }>) {
  return (
    <>
      <div className="space-y-3 md:hidden">{rates.map((rate) => <RateCard key={rateKey(rate)} rate={rate} siteName={names.get(rate.sourceSiteId) ?? `#${rate.sourceSiteId}`} />)}</div>
      <div className="hidden overflow-x-auto md:block"><div className="table-shell min-w-[680px]"><table className="data-table"><thead><tr><th>分组 / 采集站</th><th>平台</th><th>原始倍率</th><th>有效倍率</th><th>最后采集</th></tr></thead><tbody>{rates.map((rate) => <RateRow key={rateKey(rate)} rate={rate} siteName={names.get(rate.sourceSiteId) ?? `#${rate.sourceSiteId}`} />)}</tbody></table></div></div>
    </>
  );
}

function RateRow({ rate, siteName }: Readonly<{ rate: SourceRateView; siteName: string }>) {
  return <tr><td><span className="font-medium">{rate.groupName}</span><div className="mt-1.5 flex items-center gap-2"><SiteTag name={siteName} /><span className="text-xs text-muted">ID {rate.groupId}</span></div></td><td><Tag><PlatformLabel platform={rate.platform} /></Tag></td><td className="font-mono tabular-nums">{formatRate(rate.rawRate)}</td><td><Tag tone="primary" className="font-mono tabular-nums">×{formatRate(rate.effectiveRate)}</Tag></td><td className="whitespace-nowrap text-xs text-muted">{formatTime(rate.collectedAt)}</td></tr>;
}

function RateCard({ rate, siteName }: Readonly<{ rate: SourceRateView; siteName: string }>) {
  return <article className="rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-muted/35"><div className="flex justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-medium" title={rate.groupName}>{rate.groupName}</h3><div className="mt-1 flex flex-wrap items-center gap-1.5"><SiteTag name={siteName} /><Tag><PlatformLabel platform={rate.platform} fallback="未知平台" /></Tag></div></div><strong className="inline-flex shrink-0 items-center gap-1.5 font-mono text-lg tabular-nums text-foreground"><span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />×{formatRate(rate.effectiveRate)}</strong></div><dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm"><div><dt className="text-xs text-muted">原始倍率</dt><dd className="mt-1 font-mono tabular-nums">{formatRate(rate.rawRate)}</dd></div><div><dt className="text-xs text-muted">最后采集</dt><dd className="mt-1 text-xs leading-5">{formatTime(rate.collectedAt)}</dd></div></dl></article>;
}

function SiteTag({ name }: Readonly<{ name: string }>) {
  return <Tag title={name} tone="info"><span className="max-w-36 truncate">{name}</span></Tag>;
}

function rateKey(rate: SourceRateView) { return `${rate.sourceSiteId}:${rate.groupId}`; }
function formatRate(value: number | null) { return value === null ? "-" : Number(value.toFixed(4)).toString(); }
function formatTime(value: string) { return new Date(value).toLocaleString("zh-CN"); }
