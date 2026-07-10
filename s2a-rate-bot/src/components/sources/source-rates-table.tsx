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
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">采集分组倍率</h2><p className="mt-1 text-sm text-slate-600">汇总所有采集站最近一次成功快照。</p></div><input aria-label="搜索采集倍率" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="搜索站点、分组或平台" className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none focus:ring-2" /></div>
      {filtered.length === 0 ? <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">没有匹配的分组倍率。</p> : <RateRecords rates={filtered} names={names} />}
    </div>
  );
}

function RateRecords({ rates, names }: Readonly<{ rates: readonly SourceRateView[]; names: ReadonlyMap<number, string> }>) {
  return (
    <>
      <div className="space-y-3 md:hidden">{rates.map((rate) => <RateCard key={rateKey(rate)} rate={rate} siteName={names.get(rate.sourceSiteId) ?? `#${rate.sourceSiteId}`} />)}</div>
      <div className="hidden overflow-hidden rounded-lg border border-slate-200 md:block"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-slate-600"><tr><th className="p-3">采集站</th><th className="p-3">分组</th><th className="p-3">平台</th><th className="p-3">原始倍率</th><th className="p-3">有效倍率</th><th className="p-3">最后采集</th></tr></thead><tbody>{rates.map((rate) => <RateRow key={rateKey(rate)} rate={rate} siteName={names.get(rate.sourceSiteId) ?? `#${rate.sourceSiteId}`} />)}</tbody></table></div>
    </>
  );
}

function RateRow({ rate, siteName }: Readonly<{ rate: SourceRateView; siteName: string }>) {
  return <tr className="border-t border-slate-200"><td className="p-3 font-medium">{siteName}</td><td className="p-3">{rate.groupName}<p className="text-xs text-slate-500">{rate.groupId}</p></td><td className="p-3">{rate.platform ?? "-"}</td><td className="p-3 font-mono">{formatRate(rate.rawRate)}</td><td className="p-3 font-mono font-medium">{formatRate(rate.effectiveRate)}</td><td className="p-3 text-xs text-slate-600">{formatTime(rate.collectedAt)}</td></tr>;
}

function RateCard({ rate, siteName }: Readonly<{ rate: SourceRateView; siteName: string }>) {
  return <article className="rounded-lg border border-slate-200 p-4"><div className="flex justify-between gap-3"><div><h3 className="font-medium">{rate.groupName}</h3><p className="text-xs text-slate-500">{siteName} · {rate.platform ?? "未知平台"}</p></div><strong className="font-mono">{formatRate(rate.effectiveRate)}</strong></div><dl className="mt-3 grid grid-cols-2 gap-2 text-sm"><div><dt className="text-xs text-slate-500">原始倍率</dt><dd className="font-mono">{formatRate(rate.rawRate)}</dd></div><div><dt className="text-xs text-slate-500">最后采集</dt><dd>{formatTime(rate.collectedAt)}</dd></div></dl></article>;
}

function rateKey(rate: SourceRateView) { return `${rate.sourceSiteId}:${rate.groupId}`; }
function formatRate(value: number | null) { return value === null ? "-" : Number(value.toFixed(4)).toString(); }
function formatTime(value: string) { return new Date(value).toLocaleString("zh-CN"); }
