"use client";

import { Cable, Loader2, Save, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { TargetGroupView } from "../groups/types";
import type { SourceRateView, SourceSiteView } from "../sources/types";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog";
import { Label } from "../ui/label";
import { Select } from "../ui/select";
import { Tag } from "../ui/tag";
import { apiRequest, errorMessage, jsonRequest } from "./api";
import { ExistingResourceFields, ProvisioningModeField } from "./connection-resource-fields";
import type {
  ConnectionCreatePreset, ConnectionGroupType, ConnectionProvisioningMode, ConnectionView,
} from "./types";
import { useConnectionResources } from "./use-connection-resources";

const GROUP_TYPES = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "gemini", label: "Gemini" },
  { value: "antigravity", label: "Antigravity" },
] as const;

export function ConnectionCreateDialog({ open, preset, onOpenChange, onCreated }: Readonly<{
  open: boolean;
  preset?: ConnectionCreatePreset | null;
  onOpenChange: (open: boolean) => void;
  onCreated: (connection: ConnectionView) => Promise<void> | void;
}>) {
  const [options, setOptions] = useState<ConnectionOptions>({ sites: [], rates: [], groups: [] });
  const [form, setForm] = useState<CreateForm>(() => initialForm(preset));
  const [selectedGroups, setSelectedGroups] = useState<ReadonlySet<number>>(new Set());
  const [operationId, setOperationId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resources = useConnectionResources({
    open,
    mode: form.mode,
    sourceSiteId: form.siteId,
    sourceGroupId: form.groupId,
    groupType: form.groupType,
    targetGroupIds: selectedGroups,
  });
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true); setError(null); setSelectedGroups(new Set()); setOperationId(crypto.randomUUID());
    void loadOptions().then((loaded) => {
      if (!active) return;
      setOptions(loaded);
      setForm(resolveInitialForm(loaded, preset));
    }).catch((reason) => { if (active) setError(errorMessage(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, preset]);
  const siteRates = useMemo(() => options.rates.filter((rate) => !rate.deleted && String(rate.sourceSiteId) === form.siteId), [form.siteId, options.rates]);
  const selectedRate = siteRates.find((rate) => rate.groupId === form.groupId) ?? null;
  const compatibleGroups = options.groups.filter((group) => !group.platform || normalize(group.platform) === form.groupType);
  const submit = async () => {
    if (!form.siteId || !form.groupId || selectedGroups.size === 0) { setError("请选择采集站、采集分组和目标分组"); return; }
    if (form.mode === "existing" && (!form.sourceCredentialId || !form.targetAccountId)) {
      setError("请选择现有采集站凭据和目标账号");
      return;
    }
    setSaving(true); setError(null);
    try {
      const body = await apiRequest<{ connection: ConnectionView }>("/api/connections", jsonRequest("POST", {
        sourceSiteId: Number(form.siteId), sourceGroupId: form.groupId, targetGroupIds: [...selectedGroups],
        groupType: form.groupType, addToPricingMapping: form.addToPricingMapping, operationId,
        mode: form.mode,
        ...(form.mode === "existing" ? {
          sourceCredentialId: form.sourceCredentialId,
          targetAccountId: Number(form.targetAccountId),
        } : {}),
      }));
      await onCreated(body.connection);
      onOpenChange(false);
      toast.success("真实对接创建成功");
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setSaving(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next); }}>
      <DialogContent className="flex max-h-[90dvh] w-[min(96vw,760px)] flex-col overflow-hidden">
        <CreateHeader rate={selectedRate} />
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {loading ? <Loading /> : <CreateFormFields form={form} setForm={setForm} options={options} siteRates={siteRates} groups={compatibleGroups} selectedGroups={selectedGroups} setSelectedGroups={setSelectedGroups} resources={resources} error={error ?? resources.error} />}
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-surface-muted/60 px-5 py-4">
          <DialogClose asChild><Button type="button" variant="secondary" disabled={saving}>取消</Button></DialogClose>
          <Button type="button" disabled={loading || saving || resources.loading || Boolean((error ?? resources.error) && !options.sites.length)} onClick={() => void submit()}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}创建对接</Button>
        </div>
        <DialogClose asChild><Button type="button" variant="ghost" size="icon-sm" aria-label="关闭" disabled={saving} className="absolute right-4 top-4 text-muted"><X className="size-3.5" /></Button></DialogClose>
      </DialogContent>
    </Dialog>
  );
}

function CreateHeader({ rate }: Readonly<{ rate: SourceRateView | null }>) {
  return <div className="shrink-0 border-b border-border bg-surface-muted/30 px-5 py-4 pr-16 sm:px-6"><DialogTitle className="flex items-center gap-2 text-lg font-semibold"><Cable className="size-4 text-primary" />创建真实对接</DialogTitle><DialogDescription className="mt-1 text-sm text-muted">{rate ? `${rate.groupName} · #${rate.groupId}` : "选择采集分组与目标分组"}</DialogDescription></div>;
}

function CreateFormFields(input: Readonly<{
  form: CreateForm;
  setForm: React.Dispatch<React.SetStateAction<CreateForm>>;
  options: ConnectionOptions;
  siteRates: readonly SourceRateView[];
  groups: readonly TargetGroupView[];
  selectedGroups: ReadonlySet<number>;
  setSelectedGroups: (value: ReadonlySet<number>) => void;
  resources: ReturnType<typeof useConnectionResources>;
  error: string | null;
}>) {
  const update = <K extends keyof CreateForm>(key: K, value: CreateForm[K]) => input.setForm((current) => ({ ...current, [key]: value }));
  return <div className="space-y-5">
    {input.error ? <p role="alert" className="rounded-lg border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger">{input.error}</p> : null}
    <div className="grid gap-4 sm:grid-cols-2">
      <ProvisioningModeField value={input.form.mode} onChange={(value) => input.setForm((current) => ({ ...current, mode: value, sourceCredentialId: "", targetAccountId: "" }))} />
      <Field label="采集站"><Select ariaLabel="选择采集站" value={input.form.siteId} options={input.options.sites.map((site) => ({ value: String(site.id), label: site.name }))} onValueChange={(value) => { input.setForm((current) => ({ ...current, siteId: value, groupId: "", sourceCredentialId: "", targetAccountId: "" })); input.setSelectedGroups(new Set()); }} /></Field>
      <Field label="采集分组"><Select ariaLabel="选择采集分组" value={input.form.groupId} options={input.siteRates.map((rate) => ({ value: rate.groupId, label: `${rate.groupName} (#${rate.groupId})` }))} disabled={!input.form.siteId} onValueChange={(value) => { const rate = input.siteRates.find((item) => item.groupId === value); input.setForm((current) => ({ ...current, groupId: value, groupType: inferredGroupType(rate), sourceCredentialId: "", targetAccountId: "" })); input.setSelectedGroups(new Set()); }} /></Field>
      <Field label="分组类型"><Select ariaLabel="选择分组类型" value={input.form.groupType} options={GROUP_TYPES} onValueChange={(value) => { input.setForm((current) => ({ ...current, groupType: value as ConnectionGroupType, targetAccountId: "" })); input.setSelectedGroups(new Set()); }} /></Field>
      <Label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border px-3"><Checkbox checked={input.form.addToPricingMapping} onCheckedChange={(checked) => update("addToPricingMapping", checked === true)} /><span className="text-sm font-medium">同步加入调价映射</span></Label>
    </div>
    <TargetGroupOptions groups={input.groups} selected={input.selectedGroups} onChange={(value) => { input.setSelectedGroups(value); update("targetAccountId", ""); }} />
    {input.form.mode === "existing" ? <div className="grid gap-4 sm:grid-cols-2"><ExistingResourceFields options={input.resources.options} loading={input.resources.loading} sourceCredentialId={input.form.sourceCredentialId} targetAccountId={input.form.targetAccountId} onSourceChange={(value) => update("sourceCredentialId", value)} onTargetChange={(value) => update("targetAccountId", value)} /></div> : null}
  </div>;
}

function TargetGroupOptions({ groups, selected, onChange }: Readonly<{ groups: readonly TargetGroupView[]; selected: ReadonlySet<number>; onChange: (value: ReadonlySet<number>) => void }>) {
  return <fieldset><legend className="mb-2 text-sm font-medium">目标分组</legend>{groups.length ? <div className="divide-y divide-border rounded-lg border border-border">{groups.map((group) => <Label key={group.id} className="flex min-h-14 cursor-pointer items-center gap-3 px-4 py-3 hover:bg-surface-muted/50"><Checkbox checked={selected.has(group.id)} onCheckedChange={() => onChange(toggle(selected, group.id))} /><span className="min-w-0 flex-1 truncate text-sm font-medium">{group.name}</span><Tag>{group.platform ?? "未标记"}</Tag><span className="font-mono text-xs text-muted">#{group.id}</span></Label>)}</div> : <p className="empty-state">当前类型没有可用目标分组。</p>}</fieldset>;
}

function Field({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) { return <div className="space-y-2"><Label>{label}</Label>{children}</div>; }
function Loading() { return <div className="loading-state min-h-48"><Loader2 className="size-4 animate-spin" />正在读取对接选项...</div>; }
function toggle(current: ReadonlySet<number>, id: number) { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }

async function loadOptions(): Promise<ConnectionOptions> {
  const [sites, rates, groups] = await Promise.all([
    apiRequest<{ sites: SourceSiteView[] }>("/api/sources"),
    apiRequest<{ rates: SourceRateView[] }>("/api/sources/rates?catalog=true"),
    apiRequest<{ groups: TargetGroupView[] }>("/api/groups"),
  ]);
  return { sites: sites.sites.filter((site) => site.enabled), rates: rates.rates, groups: groups.groups };
}

function resolveInitialForm(options: ConnectionOptions, preset?: ConnectionCreatePreset | null): CreateForm {
  const siteId = preset && options.sites.some((site) => site.id === preset.siteId) ? String(preset.siteId) : String(options.sites[0]?.id ?? "");
  const rates = options.rates.filter((rate) => !rate.deleted && String(rate.sourceSiteId) === siteId);
  const groupId = preset && rates.some((rate) => rate.groupId === preset.groupId) ? preset.groupId : rates[0]?.groupId ?? "";
  const rate = rates.find((item) => item.groupId === groupId);
  return { siteId, groupId, groupType: validGroupType(preset?.groupType) ?? inferredGroupType(rate), addToPricingMapping: true, mode: "managed", sourceCredentialId: "", targetAccountId: "" };
}

function initialForm(preset?: ConnectionCreatePreset | null): CreateForm { return { siteId: preset ? String(preset.siteId) : "", groupId: preset?.groupId ?? "", groupType: validGroupType(preset?.groupType) ?? "openai", addToPricingMapping: true, mode: "managed", sourceCredentialId: "", targetAccountId: "" }; }
function inferredGroupType(rate?: SourceRateView | null) { return validGroupType(rate?.groupType) ?? validGroupType(rate?.platform) ?? "openai"; }
function validGroupType(value?: string | null) { return GROUP_TYPES.some((option) => option.value === value) ? value as ConnectionGroupType : null; }
function normalize(value: string) { return value.trim().toLowerCase(); }
type ConnectionOptions = { readonly sites: readonly SourceSiteView[]; readonly rates: readonly SourceRateView[]; readonly groups: readonly TargetGroupView[] };
type CreateForm = { siteId: string; groupId: string; groupType: ConnectionGroupType; addToPricingMapping: boolean; mode: ConnectionProvisioningMode; sourceCredentialId: string; targetAccountId: string };
