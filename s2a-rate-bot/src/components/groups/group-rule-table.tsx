"use client";
import { Loader2, Play, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../ui/button";
import { TableCell, TableRow } from "../ui/table";
import { GroupRuleDialog } from "./group-rule-dialog";
import { BindingCell, GroupCell, RateChangeCell, RuleCell, StatusBadge } from "./group-rule-presentations";
import { GroupTableShell } from "./group-rule-table-layouts";
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
const BINDING_PREVIEW_LIMIT = 2;
const BINDING_PREVIEW_LIMIT_WIDE = 3;
export function GroupRuleTable(props: GroupRuleTableProps) {
  const { groups, sites, rates, pending, onRefresh, onSave, onApply } = props;
  const rateMap = useMemo(() => new Map(rates.map((rate) => [`${rate.sourceSiteId}:${rate.groupId}`, rate])), [rates]);
  const siteNames = useMemo(() => new Map(sites.map((site) => [site.id, site.name])), [sites]);
  const [selectedId, setSelectedId] = useState<number | null>(groups[0]?.id ?? null);
  useEffect(() => {
    if (selectedId !== null && groups.some((group) => group.id === selectedId)) return;
    setSelectedId(groups[0]?.id ?? null);
  }, [groups, selectedId]);
  const selected = groups.find((group) => group.id === selectedId) ?? null;
  const rowProps = (group: TargetGroupView) => ({
    group,
    sites,
    rates,
    rateMap,
    siteNames,
    pending,
    selected: selectedId === group.id,
    onSelect: setSelectedId,
    onRefresh,
    onSave,
    onApply,
  });

  const detail = selected ? <GroupDetailPanel {...rowProps(selected)} />
    : <p className="empty-state-inline">请选择左侧分组查看详情。</p>;
  return <GroupTableShell
    count={groups.length}
    mobileRows={groups.map((group) => <GroupCard key={group.id} {...rowProps(group)} />)}
    tabletRows={groups.map((group) => <GroupRow key={group.id} {...rowProps(group)} />)}
    masterRows={groups.map((group) => <MasterGroupRow key={group.id} {...rowProps(group)} />)}
    detail={detail}
  />;
}

type GroupRowProps = Readonly<{
  group: TargetGroupView;
  sites: readonly SourceSiteOption[];
  rates: readonly SourceRateOption[];
  rateMap: ReadonlyMap<string, SourceRateOption>;
  siteNames: ReadonlyMap<number, string>;
  pending: string;
  selected: boolean;
  onSelect: (groupId: number) => void;
  onRefresh: GroupRuleTableProps["onRefresh"];
  onSave: GroupRuleTableProps["onSave"];
  onApply: GroupRuleTableProps["onApply"];
}>;

function GroupRow(props: GroupRowProps) {
  const { group, sites, rates, rateMap, siteNames, pending, onRefresh, onSave, onApply } = props;
  const busy = pending.endsWith(`:${group.id}`);
  return (
    <TableRow>
      <TableCell className="py-3.5 sm:px-5"><GroupCell group={group} /></TableCell>
      <TableCell className="py-3.5"><StatusBadge enabled={group.rule.enabled} /></TableCell>
      <TableCell className="py-3.5"><BindingCell group={group} rateMap={rateMap} siteNames={siteNames} limit={BINDING_PREVIEW_LIMIT} /></TableCell>
      <TableCell className="py-3.5"><RuleCell group={group} /></TableCell>
      <TableCell className="py-3.5"><RateChangeCell rule={group.rule} /></TableCell>
      <TableCell className="sticky-action-cell py-3.5 sm:px-5">
        <GroupActions group={group} sites={sites} rates={rates} pending={pending} busy={busy} onRefresh={onRefresh} onSave={onSave} onApply={onApply} />
      </TableCell>
    </TableRow>
  );
}

function MasterGroupRow(props: GroupRowProps) {
  const { group, sites, rates, rateMap, siteNames, pending, selected, onSelect, onRefresh, onSave, onApply } = props;
  const busy = pending.endsWith(`:${group.id}`);
  return (
    <TableRow
      data-selected={selected ? "true" : undefined}
      className="cursor-pointer"
      onClick={() => onSelect(group.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(group.id);
        }
      }}
      tabIndex={0}
      aria-selected={selected}
    >
      <TableCell className="py-3.5 sm:px-5"><GroupCell group={group} wideName /></TableCell>
      <TableCell className="py-3.5"><StatusBadge enabled={group.rule.enabled} /></TableCell>
      <TableCell className="py-3.5"><BindingCell group={group} rateMap={rateMap} siteNames={siteNames} limit={BINDING_PREVIEW_LIMIT_WIDE} /></TableCell>
      <TableCell className="py-3.5"><RateChangeCell rule={group.rule} compact /></TableCell>
      <TableCell className="sticky-action-cell py-3.5 sm:px-5" onClick={(event) => event.stopPropagation()}>
        <GroupActions group={group} sites={sites} rates={rates} pending={pending} busy={busy} onRefresh={onRefresh} onSave={onSave} onApply={onApply} />
      </TableCell>
    </TableRow>
  );
}

function GroupDetailPanel(props: GroupRowProps) {
  const { group, sites, rates, rateMap, siteNames, pending, onRefresh, onSave, onApply } = props;
  const busy = pending.endsWith(`:${group.id}`);
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <GroupCell group={group} wideName />
        <StatusBadge enabled={group.rule.enabled} />
      </div>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase text-muted">绑定分组</h3>
        <BindingCell group={group} rateMap={rateMap} siteNames={siteNames} limit={Number.POSITIVE_INFINITY} />
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase text-muted">计算规则</h3>
        <RuleCell group={group} />
      </section>

      <section className="space-y-1">
        <h3 className="text-xs font-semibold uppercase text-muted">最近倍率变化</h3>
        <RateChangeCell rule={group.rule} />
      </section>

      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <span className="text-sm text-muted">操作</span>
        <GroupActions group={group} sites={sites} rates={rates} pending={pending} busy={busy} onRefresh={onRefresh} onSave={onSave} onApply={onApply} />
      </div>
    </div>
  );
}

function GroupCard(props: GroupRowProps) {
  const { group, sites, rates, rateMap, siteNames, pending, onRefresh, onSave, onApply } = props;
  const busy = pending.endsWith(`:${group.id}`);
  return (
    <article className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <GroupCell group={group} />
        <StatusBadge enabled={group.rule.enabled} />
      </div>
      <dl className="mt-4 grid gap-3 border-t border-border pt-3 text-sm">
        <div>
          <dt className="mb-1 text-xs text-muted">绑定分组</dt>
          <dd><BindingCell group={group} rateMap={rateMap} siteNames={siteNames} limit={BINDING_PREVIEW_LIMIT} /></dd>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <dt className="mb-1 text-xs text-muted">计算规则</dt>
            <dd><RuleCell group={group} compact /></dd>
          </div>
          <div>
            <dt className="mb-1 text-xs text-muted">最近倍率变化</dt>
            <dd><RateChangeCell rule={group.rule} compact /></dd>
          </div>
        </div>
      </dl>
      <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
        <span className="text-sm text-muted">操作</span>
        <GroupActions group={group} sites={sites} rates={rates} pending={pending} busy={busy} onRefresh={onRefresh} onSave={onSave} onApply={onApply} />
      </div>
    </article>
  );
}

function GroupActions({
  group,
  sites,
  rates,
  pending,
  busy,
  onRefresh,
  onSave,
  onApply,
}: Readonly<{
  group: TargetGroupView;
  sites: readonly SourceSiteOption[];
  rates: readonly SourceRateOption[];
  pending: string;
  busy: boolean;
  onRefresh: GroupRuleTableProps["onRefresh"];
  onSave: GroupRuleTableProps["onSave"];
  onApply: GroupRuleTableProps["onApply"];
}>) {
  return (
    <div className="flex justify-end gap-1.5">
      <IconAction
        label="刷新此分组"
        pending={pending === `refresh:${group.id}`}
        disabled={busy}
        onClick={() => onRefresh(group.id)}
        icon={<RefreshCw className="size-3" />}
      />
      <GroupRuleDialog group={group} sites={sites} rates={rates} pending={pending} onSave={onSave} />
      <IconAction
        label="立即应用"
        primary
        pending={pending === `apply:${group.id}`}
        disabled={busy || !group.rule.enabled}
        onClick={() => onApply(group.id)}
        icon={<Play className="size-3" />}
      />
    </div>
  );
}

function IconAction({
  label,
  icon,
  pending,
  primary = false,
  ...button
}: Readonly<{ label: string; icon: React.ReactNode; pending: boolean; primary?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>>) {
  return (
    <Button type="button" variant={primary ? "default" : "ghost"} size="icon-sm" aria-label={label} title={label} {...button} className={primary ? "compact-icon-button-primary" : "compact-icon-button"}>
      {pending ? <Loader2 className="size-3 animate-spin" /> : icon}
      <span className="sr-only">{label}</span>
    </Button>
  );
}
