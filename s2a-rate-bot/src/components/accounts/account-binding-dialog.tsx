"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as Switch from "@radix-ui/react-switch";
import { Loader2, Pencil, Save, Unlink, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Select, type SelectOption } from "../ui/select";
import type { AccountSourceBinding, AccountSourceRate, AccountSourceSite, TargetAccountView } from "./types";

const UNSELECTED = "unselected";

type BindingDialogProps = Readonly<{
  account: TargetAccountView;
  rates: readonly AccountSourceRate[];
  sites: readonly AccountSourceSite[];
  pending: boolean;
  disabled: boolean;
  onSave: (binding: AccountSourceBinding | null) => Promise<boolean>;
}>;

type BindingDraft = Readonly<{ sourceSiteId: string; sourceGroupId: string; autoManageSchedulable: boolean }>;

export function AccountBindingDialog(input: BindingDialogProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<BindingDraft>(() => draftFromBinding(input.account.binding));
  const triggerTitle = `配置 ${input.account.name} 的倍率采集绑定`;
  const selectedRates = ratesForSite(input.rates, draft.sourceSiteId);
  const binding = bindingFromDraft(draft, selectedRates);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (binding && await input.onSave(binding)) setOpen(false);
  };
  const clear = async () => {
    if (input.account.binding && await input.onSave(null)) setOpen(false);
  };
  const changeOpen = (next: boolean) => {
    if (input.pending) return;
    if (next) setDraft(draftFromBinding(input.account.binding));
    setOpen(next);
  };
  return (
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      <Dialog.Trigger asChild>
        <button type="button" disabled={input.disabled} aria-label={triggerTitle} title={triggerTitle} className="icon-button">
          <Pencil className="size-4" aria-hidden="true" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-sm data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="dialog-content-motion fixed left-1/2 top-1/2 z-50 flex max-h-[92dvh] w-[min(94vw,560px)] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
          <BindingHeader accountName={input.account.name} pending={input.pending} />
          <BindingForm input={input} draft={draft} selectedRates={selectedRates} binding={binding}
            onDraftChange={setDraft} onSubmit={(event) => void save(event)} onClear={() => void clear()} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function AccountBindingSummary({ account, rates, sites }: Readonly<{
  account: TargetAccountView;
  rates: readonly AccountSourceRate[];
  sites: readonly AccountSourceSite[];
}>) {
  if (!account.binding) return <span className="text-sm text-muted">未绑定</span>;
  const display = bindingDisplay(account.binding, rates, sites);
  return <div className="min-w-0">
    <p className="truncate text-sm font-medium" title={display.primary}>{display.primary}</p>
    <p className="truncate text-xs text-muted" title={display.secondary}>{display.secondary}</p>
  </div>;
}

function BindingHeader({ accountName, pending }: Readonly<{ accountName: string; pending: boolean }>) {
  return <div className="shrink-0 border-b border-border px-5 py-4 pr-16 sm:px-6">
    <Dialog.Title className="text-lg font-semibold">绑定倍率采集分组</Dialog.Title>
    <Dialog.Description className="mt-1 truncate text-sm text-muted" title={accountName}>账号 {accountName} · 配置倍率采集来源</Dialog.Description>
    <Dialog.Close disabled={pending} aria-label="关闭倍率采集绑定弹窗"
      className="absolute right-3 top-3 flex size-11 items-center justify-center rounded-xl text-muted hover:bg-surface-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50">
      <X className="size-4" />
    </Dialog.Close>
  </div>;
}

function BindingForm({ input, draft, selectedRates, binding, onDraftChange, onSubmit, onClear }: Readonly<{
  input: BindingDialogProps;
  draft: BindingDraft;
  selectedRates: readonly AccountSourceRate[];
  binding: AccountSourceBinding | null;
  onDraftChange: (draft: BindingDraft) => void;
  onSubmit: (event: FormEvent) => void;
  onClear: () => void;
}>) {
  const unchanged = sameBinding(binding, input.account.binding);
  return <form className="flex min-h-0 flex-1 flex-col" onSubmit={onSubmit}>
    <div className="space-y-5 overflow-y-auto bg-background/40 px-5 py-5 sm:px-6">
      <BindingField step="1" label="采集渠道">
        <Select ariaLabel="采集渠道" value={draft.sourceSiteId} options={siteOptions(input.sites, input.account.binding)}
          disabled={input.pending} onValueChange={(sourceSiteId) => onDraftChange({ ...draft, sourceSiteId, sourceGroupId: UNSELECTED })} />
      </BindingField>
      <BindingField step="2" label="采集分组">
        <Select ariaLabel="采集分组" value={draft.sourceGroupId} options={groupOptions(selectedRates, draft.sourceSiteId)}
          disabled={input.pending || draft.sourceSiteId === UNSELECTED || selectedRates.length === 0}
          onValueChange={(sourceGroupId) => onDraftChange({ ...draft, sourceGroupId })} />
      </BindingField>
      <BindingAutomationField accountId={input.account.id} enabled={draft.autoManageSchedulable}
        onChange={(autoManageSchedulable) => onDraftChange({ ...draft, autoManageSchedulable })} />
    </div>
    <BindingActions bound={Boolean(input.account.binding)} pending={input.pending} saveDisabled={!binding || unchanged}
      onClear={onClear} />
  </form>;
}

function BindingAutomationField({ accountId, enabled, onChange }: Readonly<{ accountId: number; enabled: boolean; onChange: (value: boolean) => void }>) {
  const controlId = `account-test-scheduling-${accountId}`;
  return <label htmlFor={controlId} className="flex min-h-12 cursor-pointer items-center justify-between gap-4 rounded-xl border border-border bg-surface-muted/40 px-3">
    <div>
      <p className="text-sm font-medium">测试失败禁用，成功启用</p>
      <p className="mt-0.5 text-xs font-normal text-muted">请求错误按失败处理</p>
    </div>
    <Switch.Root id={controlId} aria-label="测试结果自动启停调度" checked={enabled} onCheckedChange={onChange}
      className="h-6 w-11 shrink-0 rounded-full bg-border-strong p-0.5 data-[state=checked]:bg-primary">
      <Switch.Thumb className="block size-5 rounded-full bg-surface shadow transition-transform data-[state=checked]:translate-x-5" />
    </Switch.Root>
  </label>;
}

function BindingField({ step, label, children }: Readonly<{ step: string; label: string; children: React.ReactNode }>) {
  return <label className="block space-y-2 text-sm font-medium">
    <span className="flex items-center gap-2"><span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{step}</span>{label}</span>
    {children}
  </label>;
}

function BindingActions({ bound, pending, saveDisabled, onClear }: Readonly<{
  bound: boolean;
  pending: boolean;
  saveDisabled: boolean;
  onClear: () => void;
}>) {
  return <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-surface-muted/60 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
    {bound ? <button type="button" disabled={pending} onClick={onClear} className="secondary-button border-red-200 text-red-700 dark:border-red-900 dark:text-red-300">
      <Unlink className="size-4" />解除绑定
    </button> : <span />}
    <div className="flex flex-col-reverse gap-2 sm:ml-auto sm:flex-row">
      <Dialog.Close type="button" disabled={pending} className="secondary-button">取消</Dialog.Close>
      <button type="submit" disabled={pending || saveDisabled} className="primary-button min-w-32">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}{pending ? "保存中..." : "保存绑定"}
      </button>
    </div>
  </div>;
}

function siteOptions(sites: readonly AccountSourceSite[], current: AccountSourceBinding | null): SelectOption[] {
  const options: SelectOption[] = [{ value: UNSELECTED, label: "请选择采集渠道" }, ...sites.map((site) => ({ value: String(site.id), label: site.name }))];
  if (current && !sites.some((site) => site.id === current.sourceSiteId)) {
    options.push({ value: String(current.sourceSiteId), label: `渠道 #${current.sourceSiteId}（已失效）` });
  }
  return options;
}

function groupOptions(rates: readonly AccountSourceRate[], sourceSiteId: string): SelectOption[] {
  const emptyLabel = sourceSiteId === UNSELECTED ? "请先选择采集渠道" : rates.length ? "请选择采集分组" : "该渠道暂无采集分组";
  return [{ value: UNSELECTED, label: emptyLabel }, ...rates.map((rate) => ({
    value: rate.groupId,
    label: `${rate.groupName} · ×${formatRate(rate.effectiveRate)}`,
  }))];
}

function bindingDisplay(binding: AccountSourceBinding | null, rates: readonly AccountSourceRate[], sites: readonly AccountSourceSite[]) {
  if (!binding) return { primary: "未绑定", secondary: "" };
  const rate = rates.find((item) => item.sourceSiteId === binding.sourceSiteId && item.groupId === binding.sourceGroupId);
  const siteName = sites.find((site) => site.id === binding.sourceSiteId)?.name ?? `渠道 #${binding.sourceSiteId}`;
  return rate
    ? { primary: rate.groupName, secondary: `${siteName} · ×${formatRate(rate.effectiveRate)}${automationLabel(binding)}` }
    : { primary: binding.sourceGroupId, secondary: `${siteName} · 已失效${automationLabel(binding)}` };
}

function automationLabel(binding: AccountSourceBinding) {
  return binding.autoManageSchedulable ? " · 自动启停" : "";
}

function ratesForSite(rates: readonly AccountSourceRate[], sourceSiteId: string) {
  const siteId = Number(sourceSiteId);
  return Number.isInteger(siteId) ? rates.filter((rate) => rate.sourceSiteId === siteId) : [];
}

function bindingFromDraft(draft: BindingDraft, rates: readonly AccountSourceRate[]): AccountSourceBinding | null {
  const sourceSiteId = Number(draft.sourceSiteId);
  if (!Number.isInteger(sourceSiteId) || !rates.some((rate) => rate.groupId === draft.sourceGroupId)) return null;
  return { sourceSiteId, sourceGroupId: draft.sourceGroupId, autoManageSchedulable: draft.autoManageSchedulable };
}

function draftFromBinding(binding: AccountSourceBinding | null): BindingDraft {
  return binding
    ? { sourceSiteId: String(binding.sourceSiteId), sourceGroupId: binding.sourceGroupId, autoManageSchedulable: binding.autoManageSchedulable }
    : { sourceSiteId: UNSELECTED, sourceGroupId: UNSELECTED, autoManageSchedulable: false };
}

function sameBinding(left: AccountSourceBinding | null, right: AccountSourceBinding | null) {
  return left?.sourceSiteId === right?.sourceSiteId && left?.sourceGroupId === right?.sourceGroupId
    && left?.autoManageSchedulable === right?.autoManageSchedulable;
}

function formatRate(value: number) { return Number(value.toFixed(4)).toString(); }
