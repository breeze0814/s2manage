"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as Switch from "@radix-ui/react-switch";
import { Database, KeyRound, Loader2, Save, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { CompactNumberInput } from "../ui/compact-number-input";
import { Select } from "../ui/select";
import type { SourceSiteForm, SourceSiteView } from "./types";

const SITE_TYPE_OPTIONS = [
  { value: "sub2api", label: "Sub2API" },
  { value: "newapi", label: "New API" },
] as const;

const EMPTY_FORM: SourceSiteForm = {
  name: "",
  siteType: "sub2api",
  baseUrl: "",
  websiteUrl: "",
  authMode: "password",
  username: "",
  newApiUserId: "",
  password: "",
  accessToken: "",
  refreshToken: "",
  rechargeRatio: "1",
  intervalSeconds: "600",
  useProxy: false,
  enabled: true,
};

export function SourceSiteDialog({
  open,
  site,
  pending,
  onOpenChange,
  onSave,
}: Readonly<{
  open: boolean;
  site: SourceSiteView | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (form: SourceSiteForm) => void;
}>) {
  const [form, setForm] = useState<SourceSiteForm>(EMPTY_FORM);
  useEffect(() => {
    if (open) setForm(site ? formFromSite(site) : EMPTY_FORM);
  }, [open, site]);
  const update = <K extends keyof SourceSiteForm>(key: K, value: SourceSiteForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="dialog-content-motion fixed left-1/2 top-1/2 z-50 flex max-h-[92dvh] w-[min(96vw,920px)] flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-2xl">
          <DialogHeader editing={Boolean(site)} />
          <SiteForm form={form} update={update} pending={pending} onSubmit={() => onSave(form)} />
          <Dialog.Close aria-label="关闭" className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-muted hover:text-foreground">
            <X className="size-3.5" />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DialogHeader({ editing }: Readonly<{ editing: boolean }>) {
  return (
    <div className="shrink-0 border-b border-border bg-surface-muted/30 px-5 py-4 pr-16 sm:px-6 sm:py-5">
      <Dialog.Title className="text-lg font-semibold">{editing ? "编辑采集站" : "添加采集站"}</Dialog.Title>
      <Dialog.Description className="mt-1 text-sm leading-6 text-muted">配置访问地址、认证方式与采集策略</Dialog.Description>
    </div>
  );
}

function SiteForm({
  form,
  update,
  pending,
  onSubmit,
}: Readonly<{
  form: SourceSiteForm;
  update: UpdateForm;
  pending: boolean;
  onSubmit: () => void;
}>) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };
  return (
    <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
      <div className="space-y-5 overflow-y-auto bg-background/40 px-4 py-5 sm:px-6">
        <SiteMainFields form={form} update={update} />
        <AuthMode form={form} update={update} />
      </div>
      <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-surface px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
        <Dialog.Close type="button" className="secondary-button">
          取消
        </Dialog.Close>
        <button type="submit" disabled={pending} className="primary-button min-w-32">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {pending ? "保存中..." : "保存采集站"}
        </button>
      </div>
    </form>
  );
}

function SiteMainFields({ form, update }: Readonly<{ form: SourceSiteForm; update: UpdateForm }>) {
  return <fieldset className="space-y-4 rounded-lg border border-border bg-surface p-4">
    <SectionLegend icon={<Database />} title="基本信息" description="采集站名称、类型和访问地址" />
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="站点名称"><Input value={form.name} onChange={(value) => update("name", value)} /></Field>
      <Field label="站点类型"><Select ariaLabel="站点类型" value={form.siteType} options={SITE_TYPE_OPTIONS}
        onValueChange={(value) => updateSiteType(value as SourceSiteForm["siteType"], update)} /></Field>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="接口地址"><Input type="url" value={form.baseUrl} onChange={(value) => update("baseUrl", value)} placeholder="https://api.example.com" /></Field>
      <Field label="官网地址"><Input type="url" required={false} value={form.websiteUrl} onChange={(value) => update("websiteUrl", value)} placeholder="https://www.example.com" /></Field>
    </div>
    {form.siteType === "newapi" ? <Field label="New-Api-User" hint="部分 New API 接口要求填写当前用户 ID，例如 4465。">
      <Input value={form.newApiUserId} onChange={(value) => update("newApiUserId", value)} placeholder="4465" />
    </Field> : null}
    <div className="border-t border-border pt-4">
      <p className="mb-3 text-xs font-medium text-muted">采集策略</p>
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-[auto_auto_minmax(0,1fr)_minmax(0,1fr)] md:items-end">
        <Field label="充值倍率"><CompactNumberInput required min="0.0001" step="any" suffix="倍" tone="rate" value={form.rechargeRatio} onChange={(value) => update("rechargeRatio", value)} /></Field>
        <Field label="采集间隔"><CompactNumberInput required min="1" step="1" suffix="秒" width="medium" value={form.intervalSeconds} onChange={(value) => update("intervalSeconds", value)} /></Field>
        <Toggle label="使用全局代理" checked={form.useProxy} onChange={(value) => update("useProxy", value)} />
        <Toggle label="启用采集" checked={form.enabled} onChange={(value) => update("enabled", value)} />
      </div>
    </div>
  </fieldset>;
}

function AuthMode({ form, update }: Readonly<{ form: SourceSiteForm; update: UpdateForm }>) {
  return (
    <fieldset className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <SectionLegend icon={<KeyRound />} title="认证信息" description="选择目标站支持的登录方式" />
      <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-surface-muted p-1 text-sm">
        <Radio label="账号密码" checked={form.authMode === "password"} onChange={() => update("authMode", "password")} />
        <Radio label="Token" checked={form.authMode === "manual_token"} onChange={() => update("authMode", "manual_token")} />
      </div>
      {form.authMode === "password" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={form.siteType === "newapi" ? "用户名" : "邮箱"}>
            <Input value={form.username} onChange={(value) => update("username", value)} />
          </Field>
          <Field label="密码" hint="编辑时留空保留原密码">
            <Input type="password" value={form.password} onChange={(value) => update("password", value)} />
          </Field>
        </div>
      ) : (
        <div className={`grid gap-4 ${form.siteType === "newapi" ? "" : "sm:grid-cols-2"}`}>
          <Field label="Access Token" hint={form.siteType === "newapi" ? "New API Token 模式必须填写 Access Token" : "编辑时留空保留"}>
            <Input type="password" value={form.accessToken} onChange={(value) => update("accessToken", value)} />
          </Field>
          {form.siteType === "sub2api" ? <Field label="Refresh Token" hint="可用于自动刷新 Access Token"><Input type="password" value={form.refreshToken} onChange={(value) => update("refreshToken", value)} /></Field> : null}
        </div>
      )}
    </fieldset>
  );
}

function Field({ label, hint, children }: Readonly<{ label: string; hint?: string; children: React.ReactNode }>) {
  return (
    <label className="block space-y-2 text-sm font-medium text-foreground">
      <span>{label}</span>
      {children}
      {hint ? <span className="block text-xs font-normal text-muted">{hint}</span> : null}
    </label>
  );
}
function SectionLegend({ icon, title, description }: Readonly<{ icon: React.ReactNode; title: string; description: string }>) {
  return <legend className="mb-1 px-2"><span className="flex items-center gap-2 text-sm font-semibold [&>svg]:size-3.5 [&>svg]:text-primary-strong">{icon}{title}</span><span className="mt-0.5 block text-xs font-normal text-muted">{description}</span></legend>;
}
function Input({
  value,
  onChange,
  ...input
}: Readonly<{
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}>) {
  return <input required={input.type !== "password"} {...input} value={value} onChange={(event) => onChange(event.target.value)} className={controlClass()} />;
}
function Radio({ label, checked, onChange }: Readonly<{ label: string; checked: boolean; onChange: () => void }>) {
  return (
    <label className={`flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg px-3 text-center transition-colors ${checked ? "bg-primary text-primary-foreground shadow-sm" : "text-muted hover:bg-surface-muted"}`}>
      <input className="sr-only" type="radio" name="authMode" checked={checked} onChange={onChange} />
      {label}
    </label>
  );
}
function Toggle({
  label,
  checked,
  onChange,
}: Readonly<{
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}>) {
  return (
    <div className="flex min-h-12 items-center justify-between rounded-lg border border-border bg-surface px-3">
      <span className="text-sm font-medium">{label}</span>
      <Switch.Root aria-label={label} checked={checked} onCheckedChange={onChange} className="h-6 w-11 rounded-full bg-border-strong p-0.5 transition-colors data-[state=checked]:bg-primary">
        <Switch.Thumb className="block size-5 rounded-full bg-surface shadow transition-transform data-[state=checked]:translate-x-5" />
      </Switch.Root>
    </div>
  );
}
function controlClass() {
  return "form-control";
}

function updateSiteType(siteType: SourceSiteForm["siteType"], update: UpdateForm) {
  update("siteType", siteType);
  if (siteType === "newapi") update("refreshToken", "");
}

function formFromSite(site: SourceSiteView): SourceSiteForm {
  return {
    name: site.name,
    siteType: site.siteType,
    baseUrl: site.baseUrl,
    websiteUrl: site.websiteUrl,
    authMode: site.authMode,
    username: site.username,
    newApiUserId: site.newApiUserId,
    password: "",
    accessToken: "",
    refreshToken: "",
    rechargeRatio: String(site.rechargeRatio),
    intervalSeconds: String(site.intervalSeconds),
    useProxy: site.useProxy,
    enabled: site.enabled,
  };
}

type UpdateForm = <K extends keyof SourceSiteForm>(key: K, value: SourceSiteForm[K]) => void;
