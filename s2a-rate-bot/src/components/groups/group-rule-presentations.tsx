import { PlatformLabel } from "../platform-icon";
import { EffectiveRateValue } from "../ui/effective-rate-value";
import { Tag } from "../ui/tag";
import type { SourceRateOption, TargetGroupView } from "./types";

const RULE_LABELS = { first: "首个倍率", average: "平均值", min: "最小值", max: "最大值", avg_formula: "平均公式" } as const;
const PERCENT_FACTOR = 100;

export function GroupCell({ group, wideName = false }: Readonly<{ group: TargetGroupView; wideName?: boolean }>) {
  return <div>
    <div className="flex items-center gap-2">
      <p className={`truncate font-medium ${wideName ? "max-w-48 2xl:max-w-64" : "max-w-36"}`} title={group.name}>{group.name}</p>
      <span className="text-xs tabular-nums text-muted">#{group.id}</span>
    </div>
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <Tag><PlatformLabel platform={group.platform} fallback="未知平台" /></Tag>
      <p className="inline-flex items-center gap-1.5 font-mono text-base font-semibold tabular-nums text-rate">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-rate" />
        {formatRate(group.rate_multiplier)}
      </p>
    </div>
  </div>;
}

export function BindingCell({ group, rateMap, siteNames, limit }: Readonly<{
  group: TargetGroupView;
  rateMap: ReadonlyMap<string, SourceRateOption>;
  siteNames: ReadonlyMap<number, string>;
  limit: number;
}>) {
  if (group.bindings.length === 0) return <span className="text-sm text-muted">尚未绑定</span>;
  const visible = Number.isFinite(limit) ? group.bindings.slice(0, limit) : group.bindings;
  const rest = group.bindings.length - visible.length;
  return <div className="flex max-w-md flex-col items-start gap-1.5 2xl:max-w-lg">
    {visible.map((binding) => <BindingItem key={`${binding.sourceSiteId}:${binding.sourceGroupId}`}
      binding={binding} rateMap={rateMap} siteNames={siteNames} />)}
    {rest > 0 ? <Tag title={`另有 ${rest} 个绑定，可在右侧详情或编辑规则中查看`}>+{rest}</Tag> : null}
  </div>;
}

function BindingItem({ binding, rateMap, siteNames }: Readonly<{
  binding: TargetGroupView["bindings"][number];
  rateMap: ReadonlyMap<string, SourceRateOption>;
  siteNames: ReadonlyMap<number, string>;
}>) {
  const rate = rateMap.get(`${binding.sourceSiteId}:${binding.sourceGroupId}`);
  const siteName = siteNames.get(binding.sourceSiteId) ?? `#${binding.sourceSiteId}`;
  return <div title={`${siteName} · ${rate?.groupName ?? binding.sourceGroupId}`} className="flex w-full items-center justify-between gap-3 text-xs">
    <span className="min-w-0 truncate text-foreground">
      <span className="text-muted">{siteName}</span><span className="mx-1.5 text-border-strong">/</span>
      {rate?.groupName ?? binding.sourceGroupId}
    </span>
    <EffectiveRateValue className="shrink-0">×{rate?.effectiveRate ?? "-"}</EffectiveRateValue>
  </div>;
}

export function RuleCell({ group, compact = false }: Readonly<{ group: TargetGroupView; compact?: boolean }>) {
  const parameters = group.rule.parameters;
  return <div>
    <Tag tone="primary">{RULE_LABELS[group.rule.ruleType]}</Tag>
    {!compact ? <>
      <p className="mt-1.5 font-mono text-xs tabular-nums text-rate">
        {parameters.adjustmentMode === "percentage" ? "百分比" : "固定值"} {formatAdjustment(parameters.adjustmentMode, parameters.adjustmentValue)}
      </p>
      <p className="mt-1 font-mono text-xs tabular-nums text-rate">固定下限 {parameters.minimum}</p>
      {group.rule.ruleType === "avg_formula" ? <p className="mt-1 max-w-48 truncate font-mono text-xs 2xl:max-w-none 2xl:whitespace-normal" title={parameters.formula}>{parameters.formula}</p> : null}
    </> : null}
    {group.rule.lastError ? <p className="mt-1 max-w-48 truncate text-xs text-danger 2xl:max-w-none" title={group.rule.lastError}>{group.rule.lastError}</p> : null}
  </div>;
}

export function StatusBadge({ enabled }: Readonly<{ enabled: boolean }>) {
  return <Tag tone={enabled ? "success" : "neutral"}>{enabled ? "已启用" : "已停用"}</Tag>;
}

export function formatAppliedAt(value: string | null) {
  return value ? new Date(value).toLocaleString("zh-CN") : "尚未应用";
}

export function RateChangeCell({ rule, compact = false }: Readonly<{
  rule: TargetGroupView["rule"];
  compact?: boolean;
}>) {
  const from = rule.lastAppliedFromRate;
  const to = rule.lastAppliedToRate;
  if (from === null || to === null) return <span className="text-xs text-muted">尚未应用</span>;
  const percentage = from === 0 ? null : ((to - from) / from) * PERCENT_FACTOR;
  return <div className="space-y-1 whitespace-nowrap">
    <p className="font-mono text-xs font-semibold tabular-nums text-rate">×{from} → ×{to}</p>
    <p className="text-xs text-muted">
      {percentage === null ? "变化率不可计算" : `${percentage >= 0 ? "+" : ""}${percentage.toFixed(2)}%`}
      {!compact ? ` · ${formatAppliedAt(rule.lastAppliedAt)}` : null}
    </p>
  </div>;
}

function formatAdjustment(mode: TargetGroupView["rule"]["parameters"]["adjustmentMode"], value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value}${mode === "percentage" ? "%" : "×"}`;
}

function formatRate(value: number | null | undefined) {
  return value === null || value === undefined ? "-" : String(value);
}
