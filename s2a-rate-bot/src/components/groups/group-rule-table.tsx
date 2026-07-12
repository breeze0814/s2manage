"use client";

import { Loader2, Play, RefreshCw } from "lucide-react";
import { useMemo } from "react";
import { PlatformLabel } from "../platform-icon";
import { Tag } from "../ui/tag";
import { GroupRuleDialog } from "./group-rule-dialog";
import type { RuleDraft, SourceRateOption, SourceSiteOption, TargetGroupView } from "./types";

type GroupRuleTableProps = Readonly<{
  groups: readonly TargetGroupView[];
  sites: readonly SourceSiteOption[];
  rates: readonly SourceRateOption[];
  pending: string;
  onRefresh: (groupId: number) => void;
  onSave: (groupId: number, draft: RuleDraft) => Promise<boolean>;
  onApply: (groupId: number) => void;
}>;

const RULE_LABELS = { first: "首个倍率", average: "平均值", min: "最小值", max: "最大值", avg_formula: "平均公式" } as const;

export function GroupRuleTable(props: GroupRuleTableProps) {
  const { groups, sites, rates, pending, onRefresh, onSave, onApply } = props;
  const rateMap = useMemo(() => new Map(rates.map((rate) => [`${rate.sourceSiteId}:${rate.groupId}`, rate])), [rates]);
  const siteNames = useMemo(() => new Map(sites.map((site) => [site.id, site.name])), [sites]);
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm" aria-label="分组倍率列表">
      <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 sm:px-5"><p className="text-sm"><span className="font-semibold">共 {groups.length} 个分组</span><span className="ml-2 text-muted">本地 SQL 快照</span></p><span className="hidden text-xs text-muted sm:inline">通过操作列刷新、编辑和应用</span></div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1050px] text-left text-sm">
          <TableHead />
          <tbody>{groups.map((group) => <GroupRow key={group.id} group={group} sites={sites} rates={rates} rateMap={rateMap} siteNames={siteNames} pending={pending} onRefresh={onRefresh} onSave={onSave} onApply={onApply} />)}</tbody>
        </table>
      </div>
    </section>
  );
}

function TableHead() {
  return <thead className="bg-surface-muted/70 text-xs font-medium text-muted"><tr><th className="w-56 px-4 py-3 sm:px-5">分组 / 倍率</th><th className="w-24 px-4 py-3">状态</th><th className="px-4 py-3">绑定分组</th><th className="w-56 px-4 py-3">计算规则</th><th className="w-40 px-4 py-3">最近应用</th><th className="w-44 px-4 py-3 text-right sm:px-5">操作</th></tr></thead>;
}

function GroupRow(props: Readonly<{ group: TargetGroupView; sites: readonly SourceSiteOption[]; rates: readonly SourceRateOption[]; rateMap: ReadonlyMap<string, SourceRateOption>; siteNames: ReadonlyMap<number, string>; pending: string; onRefresh: GroupRuleTableProps["onRefresh"]; onSave: GroupRuleTableProps["onSave"]; onApply: GroupRuleTableProps["onApply"] }>) {
  const { group, sites, rates, rateMap, siteNames, pending, onRefresh, onSave, onApply } = props;
  const busy = pending.endsWith(`:${group.id}`);
  return <tr className="border-t border-border transition-colors hover:bg-surface-muted/45"><td className="px-4 py-3.5 sm:px-5"><GroupCell group={group} /></td><td className="px-4 py-3.5"><StatusBadge enabled={group.rule.enabled} /></td><td className="px-4 py-3.5"><BindingCell group={group} rateMap={rateMap} siteNames={siteNames} /></td><td className="px-4 py-3.5"><RuleCell group={group} /></td><td className="whitespace-nowrap px-4 py-3.5 text-xs text-muted">{formatAppliedAt(group.rule.lastAppliedAt)}</td><td className="px-4 py-3.5 sm:px-5"><div className="flex justify-end gap-1.5"><IconAction label="刷新此分组" pending={pending === `refresh:${group.id}`} disabled={busy} onClick={() => onRefresh(group.id)} icon={<RefreshCw className="size-3" />} /><GroupRuleDialog group={group} sites={sites} rates={rates} pending={pending} onSave={onSave} /><IconAction label="立即应用" primary pending={pending === `apply:${group.id}`} disabled={busy || !group.rule.enabled} onClick={() => onApply(group.id)} icon={<Play className="size-3" />} /></div></td></tr>;
}

function GroupCell({ group }: Readonly<{ group: TargetGroupView }>) {
  return <div><div className="flex items-center gap-2"><p className="max-w-36 truncate font-medium" title={group.name}>{group.name}</p><span className="text-xs tabular-nums text-muted">#{group.id}</span></div><div className="mt-1.5 flex flex-wrap items-center gap-1.5"><Tag><PlatformLabel platform={group.platform} fallback="未知平台" /></Tag><p className="inline-flex items-center gap-1.5 font-mono text-base font-semibold tabular-nums text-rate"><span aria-hidden="true" className="size-1.5 rounded-full bg-rate" />{formatRate(group.rate_multiplier)}</p></div></div>;
}

function BindingCell({ group, rateMap, siteNames }: Readonly<{ group: TargetGroupView; rateMap: ReadonlyMap<string, SourceRateOption>; siteNames: ReadonlyMap<number, string> }>) {
  if (group.bindings.length === 0) return <span className="text-sm text-muted">尚未绑定</span>;
  return <div className="flex max-w-md flex-col items-start gap-1.5">{group.bindings.map((binding) => { const rate = rateMap.get(`${binding.sourceSiteId}:${binding.sourceGroupId}`); const siteName = siteNames.get(binding.sourceSiteId) ?? `#${binding.sourceSiteId}`; return <Tag key={`${binding.sourceSiteId}:${binding.sourceGroupId}`} title={`${siteName} · ${rate?.groupName ?? binding.sourceGroupId}`} className="w-full justify-between"><span className="min-w-0 truncate text-foreground"><span className="text-muted">{siteName}</span><span className="mx-1.5 text-border-strong">/</span>{rate?.groupName ?? binding.sourceGroupId}</span><span className="shrink-0 font-mono font-semibold tabular-nums text-rate">×{rate?.effectiveRate ?? "-"}</span></Tag>; })}</div>;
}

function RuleCell({ group }: Readonly<{ group: TargetGroupView }>) {
  const parameters = group.rule.parameters;
  return <div><Tag tone="primary">{RULE_LABELS[group.rule.ruleType]}</Tag><p className="mt-1.5 font-mono text-xs tabular-nums text-rate">偏移 {parameters.offset}</p><p className="mt-1 font-mono text-xs tabular-nums text-rate">固定下限 {parameters.minimum}</p>{group.rule.ruleType === "avg_formula" ? <p className="mt-1 max-w-48 truncate font-mono text-xs" title={parameters.formula}>{parameters.formula}</p> : null}{group.rule.lastError ? <p className="mt-1 max-w-48 truncate text-xs text-red-600 dark:text-red-400" title={group.rule.lastError}>{group.rule.lastError}</p> : null}</div>;
}

function IconAction({ label, icon, pending, primary = false, ...button }: Readonly<{ label: string; icon: React.ReactNode; pending: boolean; primary?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>>) {
  return <button type="button" aria-label={label} title={label} {...button} className={primary ? "compact-icon-button-primary" : "compact-icon-button"}>{pending ? <Loader2 className="size-3 animate-spin" /> : icon}<span className="sr-only">{label}</span></button>;
}

function StatusBadge({ enabled }: Readonly<{ enabled: boolean }>) { return <Tag tone={enabled ? "success" : "neutral"}>{enabled ? "已启用" : "已停用"}</Tag>; }
function formatRate(value: number | null | undefined) { return value === null || value === undefined ? "-" : String(value); }
function formatAppliedAt(value: string | null) { return value ? new Date(value).toLocaleString("zh-CN") : "尚未应用"; }
