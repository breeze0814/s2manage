import { PlatformLabel } from "../platform-icon";
import { EffectiveRateValue } from "../ui/effective-rate-value";
import { Tag } from "../ui/tag";
import type { SourceBinding, SourceRateOption } from "./types";

export function BindingSelector({ rates, names, selected, platform, onChange }: Readonly<{
  rates: readonly SourceRateOption[];
  names: ReadonlyMap<number, string>;
  selected: readonly SourceBinding[];
  platform?: string | null;
  onChange: (bindings: SourceBinding[]) => void;
}>) {
  const keys = new Set(selected.map(bindingKey));
  return <fieldset>
    <legend className="flex items-center gap-2 text-sm font-semibold">
      绑定采集分组 <Tag><PlatformLabel platform={platform} fallback="未知平台" /></Tag>
      <Tag tone="primary">已选 {selected.length}</Tag>
    </legend>
    <div className="mt-3 max-h-[25rem] overflow-y-auto rounded-xl border border-border bg-surface">
      {rates.length === 0 ? <p className="p-3 text-sm text-muted">没有相同平台的采集倍率。</p>
        : rates.map((rate) => <BindingRow key={rateKey(rate)} rate={rate} siteName={names.get(rate.sourceSiteId)}
          checked={keys.has(rateKey(rate))} onChange={() => onChange(toggleBinding(selected, toBinding(rate), keys.has(rateKey(rate))))} />)}
    </div>
  </fieldset>;
}

function BindingRow({ rate, siteName, checked, onChange }: Readonly<{
  rate: SourceRateOption;
  siteName?: string;
  checked: boolean;
  onChange: () => void;
}>) {
  const displaySite = siteName ?? `#${rate.sourceSiteId}`;
  return <label className={`flex min-h-10 cursor-pointer items-center gap-2 border-t border-border px-3 py-1.5 first:border-t-0 ${checked ? "bg-primary/10" : "hover:bg-surface-muted/60"}`}>
    <input className="size-4 shrink-0 accent-primary" type="checkbox" checked={checked} onChange={onChange} />
    <strong className="min-w-0 flex-1 truncate text-sm font-medium" title={rate.groupName}>{rate.groupName}</strong>
    <Tag title={displaySite} className="hidden sm:inline-flex"><span className="max-w-24 truncate">{displaySite}</span></Tag>
    <Tag tone="rate" className="shrink-0 font-mono tabular-nums">原 ×{formatRate(rate.rawRate)}</Tag>
    <EffectiveRateValue className="shrink-0 text-xs">有效 ×{formatRate(rate.effectiveRate)}</EffectiveRateValue>
  </label>;
}

function toggleBinding(current: readonly SourceBinding[], binding: SourceBinding, checked: boolean) {
  return checked ? current.filter((item) => bindingKey(item) !== bindingKey(binding)) : [...current, binding];
}

function toBinding(rate: SourceRateOption) {
  return { sourceSiteId: rate.sourceSiteId, sourceGroupId: rate.groupId };
}

function rateKey(rate: SourceRateOption) { return `${rate.sourceSiteId}:${rate.groupId}`; }
function bindingKey(binding: SourceBinding) { return `${binding.sourceSiteId}:${binding.sourceGroupId}`; }
function formatRate(value: number | null) { return value === null ? "-" : Number(value.toFixed(4)).toString(); }
