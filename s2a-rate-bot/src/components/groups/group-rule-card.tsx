"use client";

import * as Switch from "@radix-ui/react-switch";
import { Calculator, Loader2, Play, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { RuleDraft, RuleType, SourceBinding, SourceRateOption, SourceSiteOption, TargetGroupView } from "./types";

export function GroupRuleCard({ group, sites, rates, pending, onSave, onPreview, onApply }: Readonly<{
  group: TargetGroupView;
  sites: readonly SourceSiteOption[];
  rates: readonly SourceRateOption[];
  pending: string;
  onSave: (groupId: number, draft: RuleDraft) => void;
  onPreview: (groupId: number) => void;
  onApply: (groupId: number) => void;
}>) {
  const [draft, setDraft] = useState(() => draftFromGroup(group));
  useEffect(() => setDraft(draftFromGroup(group)), [group]);
  const siteNames = useMemo(() => new Map(sites.map((site) => [site.id, site.name])), [sites]);
  const update = <K extends keyof RuleDraft>(key: K, value: RuleDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  return (
    <article className="space-y-5 rounded-xl border border-border bg-surface p-5 shadow-sm">
      <GroupHeader group={group} enabled={draft.enabled} onEnabled={(value) => update("enabled", value)} />
      <RuleFields draft={draft} update={update} />
      <BindingSelector rates={rates} names={siteNames} selected={draft.bindings} onChange={(bindings) => update("bindings", bindings)} />
      {group.rule.lastError ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:text-red-300">{group.rule.lastError}</p> : null}
      <RuleActions groupId={group.id} pending={pending} enabled={draft.enabled} onSave={() => onSave(group.id, draft)} onPreview={() => onPreview(group.id)} onApply={() => onApply(group.id)} />
    </article>
  );
}

function GroupHeader({ group, enabled, onEnabled }: Readonly<{ group: TargetGroupView; enabled: boolean; onEnabled: (value: boolean) => void }>) {
  return <div className="flex items-start justify-between gap-4"><div><h2 className="font-semibold">{group.name}</h2><p className="mt-1 text-sm text-muted">当前倍率 <span className="font-mono">{formatRate(group.rate_multiplier)}</span> · ID {group.id}</p></div><div className="flex items-center gap-2 text-sm"><span>{enabled ? "已启动" : "已暂停"}</span><Switch.Root checked={enabled} onCheckedChange={onEnabled} className="h-6 w-11 rounded-full bg-border-strong p-0.5 data-[state=checked]:bg-primary"><Switch.Thumb className="block size-5 rounded-full bg-surface shadow transition-transform data-[state=checked]:translate-x-5" /></Switch.Root></div></div>;
}

function RuleFields({ draft, update }: Readonly<{ draft: RuleDraft; update: UpdateDraft }>) {
  return <div className="grid gap-4 md:grid-cols-3"><Field label="规则类型"><select value={draft.ruleType} onChange={(event) => update("ruleType", event.target.value as RuleType)} className={controlClass()}><option value="first">首个倍率</option><option value="average">平均值</option><option value="min">最小值</option><option value="max">最大值</option><option value="avg_formula">平均公式</option></select></Field><Field label="乘数"><NumberField value={draft.multiplier} onChange={(value) => update("multiplier", value)} /></Field><Field label="偏移"><NumberField value={draft.offset} onChange={(value) => update("offset", value)} /></Field>{draft.ruleType === "avg_formula" ? <div className="md:col-span-3"><Field label="公式（仅支持 avg、数字、四则运算和括号）"><input value={draft.formula} onChange={(event) => update("formula", event.target.value)} className={controlClass()} /></Field></div> : null}</div>;
}

function BindingSelector({ rates, names, selected, onChange }: Readonly<{ rates: readonly SourceRateOption[]; names: ReadonlyMap<number, string>; selected: readonly SourceBinding[]; onChange: (bindings: SourceBinding[]) => void }>) {
  const selectedKeys = new Set(selected.map(bindingKey));
  return <fieldset className="space-y-3"><legend className="text-sm font-medium text-foreground">绑定采集源分组</legend><div className="grid max-h-56 gap-2 overflow-y-auto rounded-lg border border-border p-3 sm:grid-cols-2">{rates.length === 0 ? <p className="text-sm text-muted">尚无采集倍率，请先刷新采集站。</p> : rates.map((rate) => { const binding = { sourceSiteId: rate.sourceSiteId, sourceGroupId: rate.groupId }; const checked = selectedKeys.has(bindingKey(binding)); return <label key={bindingKey(binding)} className="flex items-start gap-2 rounded-lg p-2 hover:bg-surface-muted"><input type="checkbox" checked={checked} onChange={() => onChange(toggleBinding(selected, binding, checked))} /><span className="text-sm"><strong>{rate.groupName}</strong><span className="block text-xs text-muted">{names.get(rate.sourceSiteId) ?? `#${rate.sourceSiteId}`} · {rate.effectiveRate}</span></span></label>; })}</div></fieldset>;
}

function RuleActions({ groupId, pending, enabled, onSave, onPreview, onApply }: Readonly<{ groupId: number; pending: string; enabled: boolean; onSave: () => void; onPreview: () => void; onApply: () => void }>) {
  const busy = pending.endsWith(`:${groupId}`);
  return <div className="grid gap-2 sm:grid-cols-3"><Button label="保存规则" icon={<Save className="size-4" />} pending={pending === `save:${groupId}`} disabled={busy} onClick={onSave} /><Button label="计算预览" icon={<Calculator className="size-4" />} pending={pending === `preview:${groupId}`} disabled={busy || !enabled} onClick={onPreview} /><Button label="立即应用" icon={<Play className="size-4" />} pending={pending === `apply:${groupId}`} disabled={busy || !enabled} onClick={onApply} primary /></div>;
}

function Button({ label, icon, pending, primary, ...button }: Readonly<{ label: string; icon: React.ReactNode; pending: boolean; primary?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>>) { return <button type="button" {...button} className={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium disabled:opacity-50 ${primary ? "bg-primary text-primary-foreground" : "border border-border-strong bg-surface"}`}>{pending ? <Loader2 className="size-4 animate-spin" /> : icon}{label}</button>; }
function Field({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) { return <label className="block space-y-2 text-sm font-medium text-foreground"><span>{label}</span>{children}</label>; }
function NumberField({ value, onChange }: Readonly<{ value: string; onChange: (value: string) => void }>) { return <input required type="number" step="any" value={value} onChange={(event) => onChange(event.target.value)} className={controlClass()} />; }
function controlClass() { return "min-h-11 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:ring-2"; }
function formatRate(value: number | null | undefined) { return value === null || value === undefined ? "-" : String(value); }
function bindingKey(binding: SourceBinding) { return `${binding.sourceSiteId}:${binding.sourceGroupId}`; }
function toggleBinding(current: readonly SourceBinding[], binding: SourceBinding, checked: boolean) { return checked ? current.filter((item) => bindingKey(item) !== bindingKey(binding)) : [...current, binding]; }
function draftFromGroup(group: TargetGroupView): RuleDraft { return { enabled: group.rule.enabled, ruleVersion: 1, ruleType: group.rule.ruleType, offset: String(group.rule.parameters.offset), multiplier: String(group.rule.parameters.multiplier), formula: group.rule.parameters.formula, bindings: group.bindings }; }
type UpdateDraft = <K extends keyof RuleDraft>(key: K, value: RuleDraft[K]) => void;
