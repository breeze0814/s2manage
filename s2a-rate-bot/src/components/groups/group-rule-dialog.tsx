"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as Switch from "@radix-ui/react-switch";
import { Calculator, Loader2, Pencil, Save, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { evaluateRateRule } from "../../core/rate-rule";
import { PlatformLabel } from "../platform-icon";
import { CompactNumberInput } from "../ui/compact-number-input";
import { EffectiveRateValue } from "../ui/effective-rate-value";
import { Select } from "../ui/select";
import { Tag } from "../ui/tag";
import type {
  RuleDraft,
  RuleType,
  SourceBinding,
  SourceRateOption,
  SourceSiteOption,
  TargetGroupView,
} from "./types";

export function GroupRuleDialog({
  group,
  sites,
  rates,
  pending,
  onSave,
}: Readonly<{
  group: TargetGroupView;
  sites: readonly SourceSiteOption[];
  rates: readonly SourceRateOption[];
  pending: string;
  onSave: (groupId: number, draft: RuleDraft) => Promise<boolean>;
}>) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => draftFromGroup(group));
  const [preview, setPreview] = useState<PreviewState>({ rate: null });
  useEffect(() => {
    if (open) {
      setDraft(draftFromGroup(group));
      setPreview({ rate: null });
    }
  }, [group, open]);
  const names = useMemo(
    () => new Map(sites.map((site) => [site.id, site.name])),
    [sites],
  );
  const platformRates = useMemo(
    () => rates.filter((rate) => samePlatform(rate.platform, group.platform)),
    [group.platform, rates],
  );
  const update = <K extends keyof RuleDraft>(key: K, value: RuleDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const saving = pending === `save:${group.id}`;
  const save = async () => {
    if (await onSave(group.id, draft)) setOpen(false);
  };
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label={`编辑 ${group.name} 规则`}
          title="编辑规则"
          className="compact-icon-button"
        >
          <Pencil className="size-3" />
          <span className="sr-only">编辑规则</span>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-sm data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="dialog-content-motion fixed left-1/2 top-1/2 z-50 flex max-h-[92dvh] w-[min(94vw,920px)] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
          <DialogHeader name={group.name} />
          <div className="space-y-5 overflow-y-auto p-5 sm:p-6">
            <section>
              <StepHeading
                step="1"
                title="选择采集分组"
                description="先选择参与倍率计算的同平台采集分组。"
              />
              <div className="mt-3">
                <BindingSelector
                  rates={platformRates}
                  names={names}
                  selected={draft.bindings}
                  platform={group.platform}
                  onChange={(bindings) => update("bindings", bindings)}
                />
              </div>
            </section>
            <section>
              <StepHeading
                step="2"
                title="配置与预览"
                description="设置计算规则并确认预览结果。"
              />
              <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.7fr)]">
                <div className="rounded-xl border border-border p-4">
                  <RuleFields draft={draft} update={update} />
                </div>
                <aside className="space-y-3">
                  <EnabledField
                    name={group.name}
                    enabled={draft.enabled}
                    onChange={(value) => update("enabled", value)}
                  />
                  <PreviewRate
                    draft={draft}
                    rates={platformRates}
                    currentRate={group.rate_multiplier}
                    preview={preview}
                    setPreview={setPreview}
                  />
                  {group.rule.lastError ? (
                    <p
                      role="alert"
                      className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
                    >
                      {group.rule.lastError}
                    </p>
                  ) : null}
                </aside>
              </div>
            </section>
          </div>
          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-surface-muted/60 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
            <Dialog.Close className="secondary-button">取消</Dialog.Close>
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="primary-button min-w-32"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              保存规则
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DialogHeader({ name }: Readonly<{ name: string }>) {
  return (
    <div className="shrink-0 border-b border-border px-5 py-4 pr-16 sm:px-6">
      <Dialog.Title className="text-lg font-semibold">编辑 {name}</Dialog.Title>
      <Dialog.Description className="mt-1 text-sm text-muted">
        配置计算规则和参与计算的采集分组。
      </Dialog.Description>
      <Dialog.Close
        aria-label="关闭编辑规则弹窗"
        className="absolute right-3 top-3 flex size-11 items-center justify-center rounded-xl text-muted hover:bg-surface-muted hover:text-foreground"
      >
        <X className="size-4" />
      </Dialog.Close>
    </div>
  );
}
function StepHeading({
  step,
  title,
  description,
}: Readonly<{ step: string; title: string; description: string }>) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {step}
      </span>
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-0.5 text-xs text-muted">{description}</p>
      </div>
    </div>
  );
}
function EnabledField({
  name,
  enabled,
  onChange,
}: Readonly<{
  name: string;
  enabled: boolean;
  onChange: (value: boolean) => void;
}>) {
  return (
    <div className="flex min-h-12 items-center justify-between rounded-xl border border-border bg-surface-muted/40 px-3">
      <div>
        <p className="text-sm font-medium">启用倍率规则</p>
        <p className="text-xs text-muted">关闭后将无法预览或应用此规则。</p>
      </div>
      <Switch.Root
        aria-label={`${name}规则启用状态`}
        checked={enabled}
        onCheckedChange={onChange}
        className="h-6 w-11 rounded-full bg-border-strong p-0.5 data-[state=checked]:bg-primary"
      >
        <Switch.Thumb className="block size-5 rounded-full bg-surface shadow transition-transform data-[state=checked]:translate-x-5" />
      </Switch.Root>
    </div>
  );
}
function RuleFields({
  draft,
  update,
}: Readonly<{ draft: RuleDraft; update: UpdateDraft }>) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold">计算规则</legend>
      <div className="mt-3 grid items-start gap-4 sm:grid-cols-3">
        <div>
          <Field label="规则类型">
            <Select
              ariaLabel="规则类型"
              value={draft.ruleType}
              options={RULE_TYPE_OPTIONS}
              onValueChange={(value) => update("ruleType", value as RuleType)}
            />
          </Field>
        </div>
        <Field label="偏移">
          <CompactNumberInput
            required
            step="any"
            tone="rate"
            value={draft.offset}
            onChange={(value) => update("offset", value)}
          />
        </Field>
        <Field label="计算最小值" hint="计算结果低于该固定值时，直接使用此值。">
          <CompactNumberInput
            required
            min="0"
            step="any"
            width="medium"
            tone="rate"
            value={draft.minimum}
            onChange={(value) => update("minimum", value)}
          />
        </Field>
        {draft.ruleType === "avg_formula" ? (
          <div className="sm:col-span-3">
            <Field label="自定义公式">
              <input
                value={draft.formula}
                onChange={(event) => update("formula", event.target.value)}
                className={controlClass()}
              />
            </Field>
          </div>
        ) : null}
      </div>
    </fieldset>
  );
}
function BindingSelector({
  rates,
  names,
  selected,
  platform,
  onChange,
}: Readonly<{
  rates: readonly SourceRateOption[];
  names: ReadonlyMap<number, string>;
  selected: readonly SourceBinding[];
  platform?: string | null;
  onChange: (bindings: SourceBinding[]) => void;
}>) {
  const keys = new Set(selected.map(bindingKey));
  return (
    <fieldset>
      <legend className="flex items-center gap-2 text-sm font-semibold">
        绑定采集分组{" "}
        <Tag>
          <PlatformLabel platform={platform} fallback="未知平台" />
        </Tag>
        <Tag tone="primary">已选 {selected.length}</Tag>
      </legend>
      <div className="mt-3 max-h-[25rem] overflow-y-auto rounded-xl border border-border bg-surface">
        {rates.length === 0 ? (
          <p className="p-3 text-sm text-muted">没有相同平台的采集倍率。</p>
        ) : (
          rates.map((rate) => {
            const binding = {
              sourceSiteId: rate.sourceSiteId,
              sourceGroupId: rate.groupId,
            };
            const checked = keys.has(bindingKey(binding));
            const siteName =
              names.get(rate.sourceSiteId) ?? `#${rate.sourceSiteId}`;
            return (
              <label
                key={bindingKey(binding)}
                className={`flex min-h-10 cursor-pointer items-center gap-2 border-t border-border px-3 py-1.5 first:border-t-0 ${checked ? "bg-primary/10" : "hover:bg-surface-muted/60"}`}
              >
                <input
                  className="size-4 shrink-0 accent-primary"
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    onChange(toggleBinding(selected, binding, checked))
                  }
                />
                <strong
                  className="min-w-0 flex-1 truncate text-sm font-medium"
                  title={rate.groupName}
                >
                  {rate.groupName}
                </strong>
                <Tag title={siteName} className="hidden sm:inline-flex">
                  <span className="max-w-24 truncate">{siteName}</span>
                </Tag>
                <Tag tone="rate" className="shrink-0 font-mono tabular-nums">
                  原 ×{formatRate(rate.rawRate)}
                </Tag>
                <EffectiveRateValue className="shrink-0 text-xs">
                  有效 ×{formatRate(rate.effectiveRate)}
                </EffectiveRateValue>
              </label>
            );
          })
        )}
      </div>
    </fieldset>
  );
}
function PreviewRate({
  draft,
  rates,
  currentRate,
  preview,
  setPreview,
}: Readonly<{
  draft: RuleDraft;
  rates: readonly SourceRateOption[];
  currentRate?: number | null;
  preview: PreviewState;
  setPreview: (value: PreviewState) => void;
}>) {
  const calculate = () => {
    try {
      setPreview({ rate: calculatePreview(draft, rates, currentRate) });
    } catch (error) {
      setPreview({ rate: null });
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-muted/40 p-3">
      <div>
        <p className="text-sm font-medium">预览倍率</p>
        <p className="mt-1 text-xs text-muted">
          {preview.rate === null ? (
            "使用当前草稿计算，不会保存或应用。"
          ) : (
            <>
              计算结果：
              <strong className="font-mono text-rate">×{preview.rate}</strong>
            </>
          )}
        </p>
      </div>
      <button
        type="button"
        onClick={calculate}
        disabled={!draft.enabled || draft.bindings.length === 0}
        className="secondary-button w-full"
      >
        <Calculator className="size-4" />
        预览倍率
      </button>
    </div>
  );
}

function calculatePreview(
  draft: RuleDraft,
  rates: readonly SourceRateOption[],
  currentRate?: number | null,
) {
  const index = new Map(
    rates.map((rate) => [
      bindingKey({
        sourceSiteId: rate.sourceSiteId,
        sourceGroupId: rate.groupId,
      }),
      rate.effectiveRate,
    ]),
  );
  const sourceRates = draft.bindings
    .map((binding) => index.get(bindingKey(binding)))
    .filter((rate): rate is number => rate !== undefined);
  if (sourceRates.length !== draft.bindings.length)
    throw new Error("部分已绑定分组不属于当前平台或已不存在");
  return evaluateRateRule({
    rule: {
      enabled: draft.enabled,
      mode: draft.ruleType,
      offset: draftNumber(draft.offset, "偏移"),
      minimum: draftNumber(draft.minimum, "计算最小值"),
      formula: draft.formula,
    },
    sourceRates,
    currentRate: currentRate ?? null,
  });
}

function draftNumber(value: string, label: string) {
  const number = Number(value);
  if (!value.trim() || !Number.isFinite(number))
    throw new Error(`${label}必须是有效数字`);
  return number;
}
function formatRate(value: number | null) {
  return value === null ? "-" : Number(value.toFixed(4)).toString();
}
function Field({
  label,
  hint,
  children,
}: Readonly<{ label: string; hint?: string; children: React.ReactNode }>) {
  return (
    <label className="block space-y-2 text-sm font-medium">
      <span>{label}</span>
      {children}
      {hint ? (
        <span className="block text-xs font-normal leading-5 text-muted">
          {hint}
        </span>
      ) : null}
    </label>
  );
}
function controlClass() {
  return "form-control";
}
function bindingKey(binding: SourceBinding) {
  return `${binding.sourceSiteId}:${binding.sourceGroupId}`;
}
function samePlatform(source?: string | null, target?: string | null) {
  return Boolean(
    source &&
    target &&
    source.trim().toLowerCase() === target.trim().toLowerCase(),
  );
}
function toggleBinding(
  current: readonly SourceBinding[],
  binding: SourceBinding,
  checked: boolean,
) {
  return checked
    ? current.filter((item) => bindingKey(item) !== bindingKey(binding))
    : [...current, binding];
}
function draftFromGroup(group: TargetGroupView): RuleDraft {
  return {
    enabled: group.rule.enabled,
    ruleVersion: 1,
    ruleType: group.rule.ruleType,
    offset: String(group.rule.parameters.offset),
    minimum: String(group.rule.parameters.minimum),
    formula: group.rule.parameters.formula,
    bindings: group.bindings,
  };
}
type UpdateDraft = <K extends keyof RuleDraft>(
  key: K,
  value: RuleDraft[K],
) => void;
type PreviewState = { readonly rate: number | null };
const RULE_TYPE_OPTIONS = [
  { value: "first", label: "首个倍率" },
  { value: "average", label: "平均值" },
  { value: "min", label: "最小值" },
  { value: "max", label: "最大值" },
  { value: "avg_formula", label: "自定义公式" },
] as const;
