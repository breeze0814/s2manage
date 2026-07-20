"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Loader2, Pencil, Save, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { TARGET_RULE_VERSION } from "../../core/rule-version";
import { BindingSelector } from "./group-binding-selector";
import { EnabledField, RuleFields, StepHeading } from "./group-rule-fields";
import { PreviewRate, type PreviewState } from "./group-rule-preview";
import type { RuleDraft, SourceRateOption, SourceSiteOption, TargetGroupView } from "./types";

type DialogProps = Readonly<{
  group: TargetGroupView;
  sites: readonly SourceSiteOption[];
  rates: readonly SourceRateOption[];
  pending: string;
  onSave: (groupId: number, draft: RuleDraft) => Promise<boolean>;
}>;

export function GroupRuleDialog({ group, sites, rates, pending, onSave }: DialogProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => draftFromGroup(group));
  const [preview, setPreview] = useState<PreviewState>({ rate: null });
  useEffect(() => {
    if (!open) return;
    setDraft(draftFromGroup(group));
    setPreview({ rate: null });
  }, [group, open]);
  const names = useMemo(() => new Map(sites.map((site) => [site.id, site.name])), [sites]);
  const platformRates = useMemo(
    () => rates.filter((rate) => samePlatform(rate.platform, group.platform)),
    [group.platform, rates],
  );
  const update = <K extends keyof RuleDraft>(key: K, value: RuleDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const save = async () => {
    if (await onSave(group.id, draft)) setOpen(false);
  };
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button type="button" aria-label={`编辑 ${group.name} 规则`} title="编辑规则" className="compact-icon-button">
          <Pencil className="size-3" />
          <span className="sr-only">编辑规则</span>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-sm data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="dialog-content-motion fixed left-1/2 top-1/2 z-50 flex max-h-[92dvh] w-[min(94vw,920px)] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
          <DialogHeader name={group.name} />
          <div className="space-y-5 overflow-y-auto p-5 sm:p-6">
            <RuleEditor
              group={group}
              names={names}
              rates={platformRates}
              draft={draft}
              preview={preview}
              update={update}
              setPreview={setPreview}
            />
          </div>
          <DialogActions saving={pending === `save:${group.id}`} onSave={() => void save()} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function RuleEditor(input: Readonly<{
  group: TargetGroupView;
  names: ReadonlyMap<number, string>;
  rates: readonly SourceRateOption[];
  draft: RuleDraft;
  preview: PreviewState;
  update: <K extends keyof RuleDraft>(key: K, value: RuleDraft[K]) => void;
  setPreview: (value: PreviewState) => void;
}>) {
  return <>
    <section>
      <StepHeading step="1" title="选择采集分组" description="先选择参与倍率计算的同平台采集分组。" />
      <div className="mt-3">
        <BindingSelector rates={input.rates} names={input.names} selected={input.draft.bindings}
          platform={input.group.platform} onChange={(bindings) => input.update("bindings", bindings)} />
      </div>
    </section>
    <section>
      <StepHeading step="2" title="配置与预览" description="设置计算规则并确认预览结果。" />
      <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.7fr)]">
        <div className="rounded-xl border border-border p-4"><RuleFields draft={input.draft} update={input.update} /></div>
        <aside className="space-y-3">
          <EnabledField name={input.group.name} enabled={input.draft.enabled} onChange={(value) => input.update("enabled", value)} />
          <PreviewRate draft={input.draft} rates={input.rates} currentRate={input.group.rate_multiplier}
            preview={input.preview} setPreview={input.setPreview} />
          {input.group.rule.lastError ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{input.group.rule.lastError}</p> : null}
        </aside>
      </div>
    </section>
  </>;
}

function DialogHeader({ name }: Readonly<{ name: string }>) {
  return <div className="shrink-0 border-b border-border px-5 py-4 pr-16 sm:px-6">
    <Dialog.Title className="text-lg font-semibold">编辑 {name}</Dialog.Title>
    <Dialog.Description className="mt-1 text-sm text-muted">配置计算规则和参与计算的采集分组。</Dialog.Description>
    <Dialog.Close aria-label="关闭编辑规则弹窗" className="absolute right-3 top-3 flex size-11 items-center justify-center rounded-xl text-muted hover:bg-surface-muted hover:text-foreground"><X className="size-4" /></Dialog.Close>
  </div>;
}

function DialogActions({ saving, onSave }: Readonly<{ saving: boolean; onSave: () => void }>) {
  return <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-surface-muted/60 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
    <Dialog.Close className="secondary-button">取消</Dialog.Close>
    <button type="button" disabled={saving} onClick={onSave} className="primary-button min-w-32">
      {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}保存规则
    </button>
  </div>;
}

function samePlatform(source?: string | null, target?: string | null) {
  return Boolean(source && target && source.trim().toLowerCase() === target.trim().toLowerCase());
}

function draftFromGroup(group: TargetGroupView): RuleDraft {
  return {
    enabled: group.rule.enabled,
    ruleVersion: TARGET_RULE_VERSION,
    ruleType: group.rule.ruleType,
    offset: String(group.rule.parameters.offset),
    minimum: String(group.rule.parameters.minimum),
    formula: group.rule.parameters.formula,
    bindings: group.bindings,
  };
}
