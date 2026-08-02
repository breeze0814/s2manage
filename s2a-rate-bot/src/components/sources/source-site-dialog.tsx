"use client";

import { Database, KeyRound, Loader2, Save, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { Button } from "../ui/button";
import { CompactNumberInput } from "../ui/compact-number-input";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Select } from "../ui/select";
import { Switch } from "../ui/switch";
import type { SourceSiteForm, SourceSiteView } from "./types";

const SITE_TYPE_OPTIONS = [
  { value: "sub2api", label: "Sub2API" },
  { value: "newapi", label: "New API" },
] as const;

const EMPTY_FORM: SourceSiteForm = {
  name: "",
  remark: "",
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
  balanceAlertThreshold: "",
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] w-[min(96vw,920px)] flex-col overflow-hidden">
        <DialogHeader editing={Boolean(site)} />
        <SiteForm form={form} update={update} pending={pending} onSubmit={() => onSave(form)} />
        <DialogClose asChild><Button type="button" variant="ghost" size="icon-sm" aria-label="关闭" className="absolute right-4 top-4 text-muted">
          <X className="size-3.5" />
        </Button></DialogClose>
      </DialogContent>
    </Dialog>
  );
}

function DialogHeader({ editing }: Readonly<{ editing: boolean }>) {
  return (
    <div className="shrink-0 border-b border-border bg-surface-muted/30 px-5 py-4 pr-16 sm:px-6 sm:py-5">
      <DialogTitle className="text-lg font-semibold">{editing ? "编辑采集站" : "添加采集站"}</DialogTitle>
      <DialogDescription className="mt-1 text-sm leading-6 text-muted">配置访问地址、认证方式与采集策略</DialogDescription>
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
        <DialogClose asChild><Button type="button" variant="secondary">取消</Button></DialogClose>
        <Button type="submit" disabled={pending} className="min-w-32">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {pending ? "保存中..." : "保存采集站"}
        </Button>
      </div>
    </form>
  );
}

function SiteMainFields({ form, update }: Readonly<{ form: SourceSiteForm; update: UpdateForm }>) {
  return <fieldset className="space-y-4 rounded-lg border border-border bg-surface-muted/30 p-4">
    <SectionLegend icon={<Database />} title="基本信息" description="采集站名称、类型和访问地址" />
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="站点名称"><TextControl value={form.name} onChange={(value) => update("name", value)} /></Field>
      <Field label="站点类型"><Select ariaLabel="站点类型" value={form.siteType} options={SITE_TYPE_OPTIONS}
        onValueChange={(value) => updateSiteType(value as SourceSiteForm["siteType"], update)} /></Field>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="接口地址"><TextControl type="url" value={form.baseUrl} onChange={(value) => update("baseUrl", value)} placeholder="https://api.example.com" /></Field>
      <Field label="官网地址"><TextControl type="url" required={false} value={form.websiteUrl} onChange={(value) => update("websiteUrl", value)} placeholder="https://www.example.com" /></Field>
    </div>
    <Field label="备注" hint="用于标记用途或维护信息，最多 200 个字符"><TextControl required={false} maxLength={200} value={form.remark} onChange={(value) => update("remark", value)} placeholder="例如：主用计费站" /></Field>
    {form.siteType === "newapi" ? <Field label="New-Api-User" hint="部分 New API 接口要求填写当前用户 ID，例如 4465。">
      <TextControl value={form.newApiUserId} onChange={(value) => update("newApiUserId", value)} placeholder="4465" />
    </Field> : null}
    <div className="border-t border-border pt-4">
      <p className="mb-3 text-xs font-medium text-muted">采集策略</p>
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-[auto_auto_minmax(0,1fr)_minmax(0,1fr)] md:items-end">
        <Field label="充值倍率"><CompactNumberInput required min="0.0001" step="any" suffix="倍" tone="rate" value={form.rechargeRatio} onChange={(value) => update("rechargeRatio", value)} /></Field>
        <Field label="采集间隔"><CompactNumberInput required min="1" step="1" suffix="秒" width="medium" value={form.intervalSeconds} onChange={(value) => update("intervalSeconds", value)} /></Field>
        <Toggle label="使用全局代理" checked={form.useProxy} onChange={(value) => update("useProxy", value)} />
        <Toggle label="启用采集" checked={form.enabled} onChange={(value) => update("enabled", value)} />
      </div>
      <div className="mt-3 max-w-xs"><Field label="余额告警阈值" hint="留空表示不告警"><CompactNumberInput min="0" step="any" suffix="余额" value={form.balanceAlertThreshold} onChange={(value) => update("balanceAlertThreshold", value)} /></Field></div>
    </div>
  </fieldset>;
}

function AuthMode({ form, update }: Readonly<{ form: SourceSiteForm; update: UpdateForm }>) {
  return (
    <fieldset className="space-y-4 rounded-lg border border-border bg-surface-muted/30 p-4">
      <SectionLegend icon={<KeyRound />} title="认证信息" description="选择目标站支持的登录方式" />
      <RadioGroup value={form.authMode} onValueChange={(value) => update("authMode", value as SourceSiteForm["authMode"])}
        className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-surface-muted p-1 text-sm">
        <RadioOption label="账号密码" value="password" checked={form.authMode === "password"} />
        <RadioOption label="Token" value="manual_token" checked={form.authMode === "manual_token"} />
      </RadioGroup>
      {form.authMode === "password" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={form.siteType === "newapi" ? "用户名" : "邮箱"}>
            <TextControl value={form.username} onChange={(value) => update("username", value)} />
          </Field>
          <Field label="密码" hint="编辑时留空保留原密码">
            <TextControl type="password" value={form.password} onChange={(value) => update("password", value)} />
          </Field>
        </div>
      ) : (
        <div className={`grid gap-4 ${form.siteType === "newapi" ? "" : "sm:grid-cols-2"}`}>
          <Field label="Access Token" hint={form.siteType === "newapi" ? "New API Token 模式必须填写 Access Token" : "编辑时留空保留"}>
            <TextControl type="password" value={form.accessToken} onChange={(value) => update("accessToken", value)} />
          </Field>
          {form.siteType === "sub2api" ? <Field label="Refresh Token" hint="可用于自动刷新 Access Token"><TextControl type="password" value={form.refreshToken} onChange={(value) => update("refreshToken", value)} /></Field> : null}
        </div>
      )}
    </fieldset>
  );
}

function Field({ label, hint, children }: Readonly<{ label: string; hint?: string; children: React.ReactNode }>) {
  return (
    <Label className="block space-y-2 text-sm font-medium text-foreground">
      <span>{label}</span>
      {children}
      {hint ? <span className="block text-xs font-normal text-muted">{hint}</span> : null}
    </Label>
  );
}
function SectionLegend({ icon, title, description }: Readonly<{ icon: React.ReactNode; title: string; description: string }>) {
  return <legend className="mb-1 px-2"><span className="flex items-center gap-2 text-sm font-semibold [&>svg]:size-3.5 [&>svg]:text-primary-strong">{icon}{title}</span><span className="mt-0.5 block text-xs font-normal text-muted">{description}</span></legend>;
}
function TextControl({
  value,
  onChange,
  ...input
}: Readonly<{
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
}>) {
  return <Input required={input.type !== "password"} {...input} value={value} onChange={(event) => onChange(event.target.value)} />;
}
function RadioOption({ label, value, checked }: Readonly<{ label: string; value: string; checked: boolean }>) {
  const controlId = `auth-mode-${value}`;
  return (
    <Label htmlFor={controlId} className={`flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg px-3 text-center transition-colors ${checked ? "bg-primary text-primary-foreground shadow-sm" : "text-muted hover:bg-surface-muted"}`}>
      <RadioGroupItem id={controlId} value={value} className="sr-only" />
      {label}
    </Label>
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
      <Switch aria-label={label} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
function updateSiteType(siteType: SourceSiteForm["siteType"], update: UpdateForm) {
  update("siteType", siteType);
  if (siteType === "newapi") update("refreshToken", "");
}

function formFromSite(site: SourceSiteView): SourceSiteForm {
  return {
    name: site.name,
    remark: site.remark,
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
    balanceAlertThreshold: site.balanceAlertThreshold === null ? "" : String(site.balanceAlertThreshold),
    intervalSeconds: String(site.intervalSeconds),
    useProxy: site.useProxy,
    enabled: site.enabled,
  };
}

type UpdateForm = <K extends keyof SourceSiteForm>(key: K, value: SourceSiteForm[K]) => void;
