"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as Switch from "@radix-ui/react-switch";
import { Loader2, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import type { SourceSiteForm, SourceSiteView } from "./types";

const EMPTY_FORM: SourceSiteForm = {
  name: "", siteType: "sub2api", baseUrl: "", authMode: "password", username: "", password: "",
  accessToken: "", refreshToken: "", rechargeRatio: "1", intervalSeconds: "600", useProxy: false, enabled: true,
};

export function SourceSiteDialog({ open, site, pending, error, onOpenChange, onSave }: Readonly<{
  open: boolean;
  site: SourceSiteView | null;
  pending: boolean;
  error: string;
  onOpenChange: (open: boolean) => void;
  onSave: (form: SourceSiteForm) => void;
}>) {
  const [form, setForm] = useState<SourceSiteForm>(EMPTY_FORM);
  useEffect(() => { if (open) setForm(site ? formFromSite(site) : EMPTY_FORM); }, [open, site]);
  const update = <K extends keyof SourceSiteForm>(key: K, value: SourceSiteForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-stone-950/60" /><Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[min(94vw,620px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-surface p-5 shadow-2xl sm:p-6">
        <DialogHeader editing={Boolean(site)} /><SiteForm form={form} update={update} pending={pending} error={error} onSubmit={() => onSave(form)} />
        <Dialog.Close aria-label="关闭" className="absolute right-4 top-4 flex size-10 items-center justify-center rounded-lg hover:bg-surface-muted"><X className="size-4" /></Dialog.Close>
      </Dialog.Content></Dialog.Portal>
    </Dialog.Root>
  );
}

function DialogHeader({ editing }: Readonly<{ editing: boolean }>) {
  return <div className="mb-5 pr-10"><Dialog.Title className="text-lg font-semibold">{editing ? "编辑采集站" : "添加采集站"}</Dialog.Title><Dialog.Description className="mt-1 text-sm text-muted">配置 Sub2API 或 New API 的认证和采集周期。</Dialog.Description></div>;
}

function SiteForm({ form, update, pending, error, onSubmit }: Readonly<{
  form: SourceSiteForm;
  update: UpdateForm;
  pending: boolean;
  error: string;
  onSubmit: () => void;
}>) {
  const submit = (event: FormEvent) => { event.preventDefault(); onSubmit(); };
  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="站点名称"><Input value={form.name} onChange={(value) => update("name", value)} /></Field><Field label="站点类型"><select value={form.siteType} onChange={(event) => update("siteType", event.target.value as SourceSiteForm["siteType"])} className={controlClass()}><option value="sub2api">Sub2API</option><option value="newapi">New API</option></select></Field></div>
      <Field label="站点地址"><Input type="url" value={form.baseUrl} onChange={(value) => update("baseUrl", value)} placeholder="https://source.example.com" /></Field>
      <AuthMode form={form} update={update} />
      <div className="grid gap-4 sm:grid-cols-2"><Field label="充值倍率"><NumberInput value={form.rechargeRatio} onChange={(value) => update("rechargeRatio", value)} step="any" /></Field><Field label="采集间隔（秒）"><NumberInput value={form.intervalSeconds} onChange={(value) => update("intervalSeconds", value)} /></Field></div>
      <Toggle label="使用全局代理" checked={form.useProxy} onChange={(value) => update("useProxy", value)} />
      <Toggle label="启用采集" checked={form.enabled} onChange={(value) => update("enabled", value)} />
      {error ? <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      <button type="submit" disabled={pending} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">{pending ? <Loader2 className="size-4 animate-spin" /> : null}{pending ? "保存中..." : "保存采集站"}</button>
    </form>
  );
}

function AuthMode({ form, update }: Readonly<{ form: SourceSiteForm; update: UpdateForm }>) {
  return (
    <div className="space-y-3 rounded-lg border border-border p-4"><div className="flex gap-4 text-sm"><Radio label="账号密码" checked={form.authMode === "password"} onChange={() => update("authMode", "password")} /><Radio label="Token" checked={form.authMode === "manual_token"} onChange={() => update("authMode", "manual_token")} /></div>
      {form.authMode === "password" ? <div className="grid gap-4 sm:grid-cols-2"><Field label="用户名/邮箱"><Input value={form.username} onChange={(value) => update("username", value)} /></Field><Field label="密码" hint="编辑时留空保留原密码"><Input type="password" value={form.password} onChange={(value) => update("password", value)} /></Field></div> : <div className="grid gap-4 sm:grid-cols-2"><Field label="Access Token" hint="编辑时留空保留"><Input type="password" value={form.accessToken} onChange={(value) => update("accessToken", value)} /></Field><Field label="Refresh Token" hint="New API 不支持刷新 Token"><Input type="password" value={form.refreshToken} onChange={(value) => update("refreshToken", value)} /></Field></div>}
    </div>
  );
}

function Field({ label, hint, children }: Readonly<{ label: string; hint?: string; children: React.ReactNode }>) { return <label className="block space-y-2 text-sm font-medium text-foreground"><span>{label}</span>{children}{hint ? <span className="block text-xs font-normal text-muted">{hint}</span> : null}</label>; }
function Input({ value, onChange, ...input }: Readonly<{ value: string; onChange: (value: string) => void; type?: string; placeholder?: string }>) { return <input required={input.type !== "password"} {...input} value={value} onChange={(event) => onChange(event.target.value)} className={controlClass()} />; }
function NumberInput({ value, onChange, step = "1" }: Readonly<{ value: string; onChange: (value: string) => void; step?: string }>) { return <input required type="number" min="0.0001" step={step} value={value} onChange={(event) => onChange(event.target.value)} className={controlClass()} />; }
function Radio({ label, checked, onChange }: Readonly<{ label: string; checked: boolean; onChange: () => void }>) { return <label className="flex items-center gap-2"><input type="radio" name="authMode" checked={checked} onChange={onChange} />{label}</label>; }
function Toggle({ label, checked, onChange }: Readonly<{ label: string; checked: boolean; onChange: (value: boolean) => void }>) { return <div className="flex min-h-11 items-center justify-between rounded-lg border border-border px-3"><span className="text-sm font-medium">{label}</span><Switch.Root checked={checked} onCheckedChange={onChange} className="h-6 w-11 rounded-full bg-border-strong p-0.5 data-[state=checked]:bg-primary"><Switch.Thumb className="block size-5 rounded-full bg-surface shadow transition-transform data-[state=checked]:translate-x-5" /></Switch.Root></div>; }
function controlClass() { return "min-h-11 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:ring-2"; }

function formFromSite(site: SourceSiteView): SourceSiteForm {
  return { name: site.name, siteType: site.siteType, baseUrl: site.baseUrl, authMode: site.authMode, username: site.username, password: "", accessToken: "", refreshToken: "", rechargeRatio: String(site.rechargeRatio), intervalSeconds: String(site.intervalSeconds), useProxy: site.useProxy, enabled: site.enabled };
}

type UpdateForm = <K extends keyof SourceSiteForm>(key: K, value: SourceSiteForm[K]) => void;
