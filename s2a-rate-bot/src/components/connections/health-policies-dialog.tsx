"use client";

import { Pencil, Plus, Save, ShieldCheck, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { ConfirmAlert } from "../ui/confirm-alert";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { Tag } from "../ui/tag";
import type { HealthPolicy, HealthPolicyForm } from "./types";

const DEFAULT_FORM: HealthPolicyForm = {
  name: "", enabled: true, intervalSeconds: "600", failureThreshold: "3", recoveryThreshold: "2",
  autoSuspend: true, autoRestore: true,
};

export function HealthPoliciesDialog({ open, policies, pendingKeys, onOpenChange, onSave, onDelete }: Readonly<{
  open: boolean;
  policies: readonly HealthPolicy[];
  pendingKeys: ReadonlySet<string>;
  onOpenChange: (open: boolean) => void;
  onSave: (policy: HealthPolicy | null, form: HealthPolicyForm) => Promise<boolean>;
  onDelete: (policy: HealthPolicy) => Promise<boolean>;
}>) {
  const [editing, setEditing] = useState<HealthPolicy | null>(null);
  const [form, setForm] = useState<HealthPolicyForm>(DEFAULT_FORM);
  const [deleteTarget, setDeleteTarget] = useState<HealthPolicy | null>(null);
  useEffect(() => { if (open) { setEditing(null); setForm(DEFAULT_FORM); } }, [open]);
  const saving = [...pendingKeys].some((key) => key.startsWith("save-policy:"));
  const deleting = deleteTarget ? pendingKeys.has(`delete-policy:${deleteTarget.id}`) : false;
  const save = async () => {
    if (await onSave(editing, form)) { setEditing(null); setForm(DEFAULT_FORM); }
  };
  const remove = async () => {
    if (!deleteTarget) return;
    if (await onDelete(deleteTarget)) setDeleteTarget(null);
  };
  return <>
    <Dialog open={open} onOpenChange={(next) => { if (!saving && !deleting) onOpenChange(next); }}>
      <DialogContent className="flex max-h-[90dvh] w-[min(96vw,860px)] flex-col overflow-hidden">
        <div className="shrink-0 border-b border-border bg-surface-muted/30 px-5 py-4 pr-16 sm:px-6"><DialogTitle className="flex items-center gap-2 text-lg font-semibold"><ShieldCheck className="size-4 text-primary" />健康策略</DialogTitle><DialogDescription className="mt-1 text-sm text-muted">共 {policies.length} 条策略</DialogDescription></div>
        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
          <PolicyList policies={policies} editing={editing} busy={saving || deleting} onEdit={(policy) => { setEditing(policy); setForm(policyForm(policy)); }} onDelete={setDeleteTarget} />
          <PolicyEditor editing={editing} form={form} setForm={setForm} saving={saving} onNew={() => { setEditing(null); setForm(DEFAULT_FORM); }} onSave={() => void save()} />
        </div>
        <DialogClose asChild><Button type="button" variant="ghost" size="icon-sm" aria-label="关闭" disabled={saving || deleting} className="absolute right-4 top-4 text-muted"><X className="size-3.5" /></Button></DialogClose>
      </DialogContent>
    </Dialog>
    <ConfirmAlert open={deleteTarget !== null} title="删除健康策略" description={`确定删除「${deleteTarget?.name ?? ""}」？已分配给连接的策略不能删除。`} confirmLabel={deleting ? "删除中" : "删除策略"} onOpenChange={(next) => { if (!next && !deleting) setDeleteTarget(null); }} onConfirm={() => { if (!deleting) void remove(); }} />
  </>;
}

function PolicyList({ policies, editing, busy, onEdit, onDelete }: Readonly<{
  policies: readonly HealthPolicy[];
  editing: HealthPolicy | null;
  busy: boolean;
  onEdit: (policy: HealthPolicy) => void;
  onDelete: (policy: HealthPolicy) => void;
}>) {
  return <div className="border-b border-border p-4 lg:border-b-0 lg:border-r sm:p-5">{policies.length ? <div className="divide-y divide-border rounded-lg border border-border">{policies.map((policy) => <div key={policy.id} className={`flex min-h-16 items-center gap-3 px-3 py-3 ${editing?.id === policy.id ? "bg-primary/5" : ""}`}><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{policy.name}</p><div className="mt-1 flex flex-wrap gap-1.5"><Tag tone={policy.enabled ? "success" : "neutral"}>{policy.enabled ? "启用" : "停用"}</Tag><Tag>{formatInterval(policy.intervalSeconds)}</Tag><Tag>失败 {policy.failureThreshold}</Tag><Tag>恢复 {policy.recoveryThreshold}</Tag></div></div><Button type="button" variant="ghost" size="icon-sm" aria-label={`编辑 ${policy.name}`} title="编辑策略" disabled={busy} onClick={() => onEdit(policy)}><Pencil className="size-3.5" /></Button><Button type="button" variant="ghost" size="icon-sm" aria-label={`删除 ${policy.name}`} title="删除策略" disabled={busy} className="text-danger" onClick={() => onDelete(policy)}><Trash2 className="size-3.5" /></Button></div>)}</div> : <p className="empty-state">暂无健康策略。</p>}</div>;
}

function PolicyEditor({ editing, form, setForm, saving, onNew, onSave }: Readonly<{
  editing: HealthPolicy | null;
  form: HealthPolicyForm;
  setForm: React.Dispatch<React.SetStateAction<HealthPolicyForm>>;
  saving: boolean;
  onNew: () => void;
  onSave: () => void;
}>) {
  const set = <K extends keyof HealthPolicyForm>(key: K, value: HealthPolicyForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  return <div className="space-y-4 p-4 sm:p-5"><div className="flex items-center justify-between"><h3 className="font-medium">{editing ? "编辑策略" : "新建策略"}</h3><Button type="button" variant="ghost" size="sm" onClick={onNew}><Plus className="size-3.5" />新建</Button></div><Field label="策略名称"><Input value={form.name} onChange={(event) => set("name", event.target.value)} /></Field><div className="grid grid-cols-2 gap-4"><Field label="间隔（秒）"><Input type="number" min="1" value={form.intervalSeconds} onChange={(event) => set("intervalSeconds", event.target.value)} /></Field><Field label="连续失败阈值"><Input type="number" min="1" value={form.failureThreshold} onChange={(event) => set("failureThreshold", event.target.value)} /></Field><Field label="恢复成功阈值"><Input type="number" min="1" value={form.recoveryThreshold} onChange={(event) => set("recoveryThreshold", event.target.value)} /></Field></div><Toggle label="启用策略" checked={form.enabled} onChange={(value) => set("enabled", value)} /><Toggle label="失败后自动暂停调度" checked={form.autoSuspend} onChange={(value) => set("autoSuspend", value)} /><Toggle label="恢复后自动启用调度" checked={form.autoRestore} onChange={(value) => set("autoRestore", value)} /><Button type="button" className="w-full" disabled={saving || !form.name.trim()} onClick={onSave}><Save className="size-4" />{saving ? "保存中" : "保存策略"}</Button></div>;
}

function Field({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) { return <div className="space-y-2"><Label>{label}</Label>{children}</div>; }
function Toggle({ label, checked, onChange }: Readonly<{ label: string; checked: boolean; onChange: (value: boolean) => void }>) { return <Label className="flex min-h-11 items-center justify-between gap-4 rounded-lg border border-border px-3"><span className="text-sm">{label}</span><Switch checked={checked} onCheckedChange={onChange} /></Label>; }
function policyForm(policy: HealthPolicy): HealthPolicyForm { return { name: policy.name, enabled: policy.enabled, intervalSeconds: String(policy.intervalSeconds), failureThreshold: String(policy.failureThreshold), recoveryThreshold: String(policy.recoveryThreshold), autoSuspend: policy.autoSuspend, autoRestore: policy.autoRestore }; }
function formatInterval(seconds: number) { return seconds % 60 === 0 ? `${seconds / 60} 分钟` : `${seconds} 秒`; }
