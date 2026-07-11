"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as Switch from "@radix-ui/react-switch";
import { Loader2, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { CompactNumberInput } from "../ui/compact-number-input";
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
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-sm data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[92dvh] w-[min(94vw,680px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <DialogHeader editing={Boolean(site)} />
          <SiteForm form={form} update={update} pending={pending} error={error} onSubmit={() => onSave(form)} />
          <Dialog.Close aria-label="关闭" className="absolute right-3 top-3 flex size-11 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-muted hover:text-foreground"><X className="size-4" /></Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DialogHeader({ editing }: Readonly<{ editing: boolean }>) {
  return <div className="shrink-0 border-b border-border px-5 py-4 pr-16 sm:px-6"><Dialog.Title className="text-lg font-semibold tracking-tight">{editing ? "编辑采集站" : "添加采集站"}</Dialog.Title><Dialog.Description className="mt-1 text-sm leading-6 text-muted">配置站点信息、认证方式与采集策略。</Dialog.Description></div>;
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
    <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
      <div className="space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
        <fieldset className="space-y-4"><legend className="mb-1 text-sm font-semibold">基本信息</legend><div className="grid gap-4 sm:grid-cols-2"><Field label="站点名称"><Input value={form.name} onChange={(value) => update("name", value)} /></Field><Field label="站点类型"><select value={form.siteType} onChange={(event) => update("siteType", event.target.value as SourceSiteForm["siteType"])} className={controlClass()}><option value="sub2api">Sub2API</option><option value="newapi">New API</option></select></Field></div><Field label="站点地址"><Input type="url" value={form.baseUrl} onChange={(value) => update("baseUrl", value)} placeholder="https://source.example.com" /></Field></fieldset>
        <AuthMode form={form} update={update} />
        <fieldset className="space-y-4"><legend className="mb-1 text-sm font-semibold">采集策略</legend><div className="flex flex-wrap items-start gap-x-8 gap-y-4"><Field label="充值倍率"><CompactNumberInput required min="0.0001" step="any" suffix="倍" value={form.rechargeRatio} onChange={(value) => update("rechargeRatio", value)} /></Field><Field label="采集间隔" hint="正整数，默认 600 秒。"><CompactNumberInput required min="1" step="1" suffix="秒" width="medium" value={form.intervalSeconds} onChange={(value) => update("intervalSeconds", value)} /></Field></div><div className="grid gap-3 sm:grid-cols-2"><Toggle label="使用全局代理" checked={form.useProxy} onChange={(value) => update("useProxy", value)} /><Toggle label="启用采集" checked={form.enabled} onChange={(value) => update("enabled", value)} /></div></fieldset>
        {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p> : null}
      </div>
      <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-surface-muted/60 px-5 py-4 sm:flex-row sm:justify-end sm:px-6"><Dialog.Close type="button" className="secondary-button">取消</Dialog.Close><button type="submit" disabled={pending} className="primary-button min-w-32">{pending ? <Loader2 className="size-4 animate-spin" /> : null}{pending ? "保存中..." : "保存采集站"}</button></div>
    </form>
  );
}

function AuthMode({ form, update }: Readonly<{ form: SourceSiteForm; update: UpdateForm }>) {
  return (
    <fieldset className="space-y-4 rounded-xl border border-border bg-surface-muted/50 p-4"><legend className="px-1 text-sm font-semibold">认证信息</legend><div className="grid grid-cols-2 gap-2 rounded-xl bg-surface p-1 text-sm"><Radio label="账号密码" checked={form.authMode === "password"} onChange={() => update("authMode", "password")} /><Radio label="Token" checked={form.authMode === "manual_token"} onChange={() => update("authMode", "manual_token")} /></div>
      {form.authMode === "password" ? <div className="grid gap-4 sm:grid-cols-2"><Field label="用户名/邮箱"><Input value={form.username} onChange={(value) => update("username", value)} /></Field><Field label="密码" hint="编辑时留空保留原密码"><Input type="password" value={form.password} onChange={(value) => update("password", value)} /></Field></div> : <div className="grid gap-4 sm:grid-cols-2"><Field label="Access Token" hint="编辑时留空保留"><Input type="password" value={form.accessToken} onChange={(value) => update("accessToken", value)} /></Field><Field label="Refresh Token" hint="New API 不支持刷新 Token"><Input type="password" value={form.refreshToken} onChange={(value) => update("refreshToken", value)} /></Field></div>}
    </fieldset>
  );
}

function Field({ label, hint, children }: Readonly<{ label: string; hint?: string; children: React.ReactNode }>) { return <label className="block space-y-2 text-sm font-medium text-foreground"><span>{label}</span>{children}{hint ? <span className="block text-xs font-normal text-muted">{hint}</span> : null}</label>; }
function Input({ value, onChange, ...input }: Readonly<{ value: string; onChange: (value: string) => void; type?: string; placeholder?: string }>) { return <input required={input.type !== "password"} {...input} value={value} onChange={(event) => onChange(event.target.value)} className={controlClass()} />; }
function Radio({ label, checked, onChange }: Readonly<{ label: string; checked: boolean; onChange: () => void }>) { return <label className={`flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg px-3 text-center transition-colors ${checked ? "bg-primary text-primary-foreground shadow-sm" : "text-muted hover:bg-surface-muted"}`}><input className="sr-only" type="radio" name="authMode" checked={checked} onChange={onChange} />{label}</label>; }
function Toggle({ label, checked, onChange }: Readonly<{ label: string; checked: boolean; onChange: (value: boolean) => void }>) { return <div className="flex min-h-12 items-center justify-between rounded-xl border border-border bg-surface px-3"><span className="text-sm font-medium">{label}</span><Switch.Root aria-label={label} checked={checked} onCheckedChange={onChange} className="h-6 w-11 rounded-full bg-border-strong p-0.5 transition-colors data-[state=checked]:bg-primary"><Switch.Thumb className="block size-5 rounded-full bg-surface shadow transition-transform data-[state=checked]:translate-x-5" /></Switch.Root></div>; }
function controlClass() { return "form-control"; }

function formFromSite(site: SourceSiteView): SourceSiteForm {
  return { name: site.name, siteType: site.siteType, baseUrl: site.baseUrl, authMode: site.authMode, username: site.username, password: "", accessToken: "", refreshToken: "", rechargeRatio: String(site.rechargeRatio), intervalSeconds: String(site.intervalSeconds), useProxy: site.useProxy, enabled: site.enabled };
}

type UpdateForm = <K extends keyof SourceSiteForm>(key: K, value: SourceSiteForm[K]) => void;
