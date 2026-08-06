"use client";

import { FileJson2, Globe2, type LucideIcon } from "lucide-react";
import type { CompensationOrderSource } from "../../server/compensation/types";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import type { CompensationConfigDraft } from "./compensation-config-model";

export function CompensationOrderSourceFields(props: Readonly<{
  draft: CompensationConfigDraft;
  passwordConfigured: boolean;
  onChange: (patch: Partial<CompensationConfigDraft>) => void;
}>) {
  const isUrl = props.draft.orderSource === "url";
  return <>
    <fieldset className="lg:col-span-2">
      <legend className="mb-2 text-sm font-semibold">订单查询来源</legend>
      <RadioGroup value={props.draft.orderSource} onValueChange={(value) => props.onChange({ orderSource: value as CompensationOrderSource })} className="grid gap-2 sm:grid-cols-2">
        <SourceOption value="json" icon={FileJson2} title="JSON 查询" description="读取 data/ld.json 中的订单数据" />
        <SourceOption value="url" icon={Globe2} title="URL 查询" description="登录联动小铺并实时查询订单" />
      </RadioGroup>
    </fieldset>
    {isUrl ? <UrlFields {...props} /> : null}
  </>;
}

function UrlFields(props: Readonly<{
  draft: CompensationConfigDraft;
  passwordConfigured: boolean;
  onChange: (patch: Partial<CompensationConfigDraft>) => void;
}>) {
  const required = props.draft.enabled;
  return <>
    <Field id="compensation-base-url" label="联动小铺地址" className="lg:col-span-2">
      <Input id="compensation-base-url" type="url" required value={props.draft.baseUrl} onChange={(event) => props.onChange({ baseUrl: event.target.value })} />
    </Field>
    <Field id="compensation-username" label="店铺用户名">
      <Input id="compensation-username" autoComplete="off" required={required} value={props.draft.username} onChange={(event) => props.onChange({ username: event.target.value })} />
    </Field>
    <Field id="compensation-password" label="店铺密码">
      <Input id="compensation-password" type="password" autoComplete="new-password" required={required && !props.passwordConfigured}
        placeholder={props.passwordConfigured ? "已配置，留空保持不变" : "输入店铺密码"}
        value={props.draft.password} onChange={(event) => props.onChange({ password: event.target.value })} />
    </Field>
  </>;
}

function SourceOption(props: Readonly<{
  value: CompensationOrderSource;
  icon: LucideIcon;
  title: string;
  description: string;
}>) {
  const id = `compensation-order-source-${props.value}`;
  const descriptionId = `${id}-description`;
  const Icon = props.icon;
  return <Label htmlFor={id} className="flex min-h-16 cursor-pointer items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 transition-[border-color,background-color,box-shadow] focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20 has-[[data-state=checked]]:border-primary/60 has-[[data-state=checked]]:bg-primary/5 has-[[data-state=checked]]:shadow-sm">
    <RadioGroupItem id={id} value={props.value} aria-describedby={descriptionId} />
    <Icon className="size-4 shrink-0 text-primary-strong" aria-hidden="true" />
    <span className="min-w-0"><span className="block text-sm font-semibold">{props.title}</span><span id={descriptionId} className="mt-0.5 block text-xs font-normal leading-5 text-muted">{props.description}</span></span>
  </Label>;
}

function Field(props: Readonly<{
  id: string;
  label: string;
  className?: string;
  children: React.ReactNode;
}>) {
  return <Label htmlFor={props.id} className={`block ${props.className ?? ""}`}><span className="mb-1.5 block">{props.label}</span>{props.children}</Label>;
}
