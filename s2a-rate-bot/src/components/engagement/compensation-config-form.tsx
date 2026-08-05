"use client";

import { Loader2, PlugZap, Save, Settings2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { AdminCompensationSettings, LiandongMerchantProfile } from "../../server/compensation/types";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import { requestJson } from "./api";
import { configDraft, configRequest, type CompensationConfigDraft } from "./compensation-config-model";
import { CompensationRuleFields } from "./compensation-rule-fields";

export function CompensationConfigForm(props: Readonly<{
  settings: AdminCompensationSettings;
  onSaved: (settings: AdminCompensationSettings) => void;
}>) {
  const [draft, setDraft] = useState(() => configDraft(props.settings));
  const [pending, setPending] = useState<"save" | "test" | null>(null);
  const update = (patch: Partial<CompensationConfigDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const run = (action: "save" | "test") => void submitConfig({ action, draft, setPending, onSaved: props.onSaved });
  return (
    <section className="panel overflow-hidden">
      <div className="panel-header">
        <div><h2 className="panel-title">活动配置</h2><p className="panel-description">联动店铺连接、用户端状态与补偿档位</p></div>
        <Settings2 className="size-5 text-primary" aria-hidden="true" />
      </div>
      <form className="grid gap-5 p-4 lg:grid-cols-2 lg:p-5" onSubmit={(event) => { event.preventDefault(); run("save"); }}>
        <div className="flex min-h-16 items-center gap-3 rounded-lg border border-border bg-surface-muted px-3 lg:col-span-2">
          <Label htmlFor="compensation-enabled" className="min-w-0 flex-1 cursor-pointer">
            <span className="block font-medium">向用户开放活动</span>
            <span className="mt-0.5 block text-xs font-normal leading-5 text-muted">关闭后嵌入端停止计算与发码</span>
          </Label>
          <Switch id="compensation-enabled" checked={draft.enabled} onCheckedChange={(enabled) => update({ enabled })} />
        </div>
        <Field id="compensation-name" label="活动名称">
          <Input id="compensation-name" required value={draft.activityName} onChange={(event) => update({ activityName: event.target.value })} />
        </Field>
        <Field id="compensation-base-url" label="联动小铺地址">
          <Input id="compensation-base-url" type="url" required value={draft.baseUrl} onChange={(event) => update({ baseUrl: event.target.value })} />
        </Field>
        <Field id="compensation-description" label="活动说明" className="lg:col-span-2">
          <Textarea id="compensation-description" className="min-h-20 resize-y" value={draft.description} onChange={(event) => update({ description: event.target.value })} />
        </Field>
        <Field id="compensation-username" label="店铺用户名">
          <Input id="compensation-username" autoComplete="off" required={draft.enabled} value={draft.username} onChange={(event) => update({ username: event.target.value })} />
        </Field>
        <Field id="compensation-password" label="店铺密码">
          <Input id="compensation-password" type="password" autoComplete="new-password" required={draft.enabled && !props.settings.passwordConfigured}
            placeholder={props.settings.passwordConfigured ? "已配置，留空保持不变" : "输入店铺密码"}
            value={draft.password} onChange={(event) => update({ password: event.target.value })} />
        </Field>
        <CompensationRuleFields rules={draft.rules} onChange={(rules) => update({ rules })} />
        <div className="flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:justify-end lg:col-span-2">
          <Button type="button" variant="secondary" disabled={pending !== null} onClick={() => run("test")}>
            {pending === "test" ? <Loader2 className="size-4 animate-spin" /> : <PlugZap className="size-4" />}保存并测试连接
          </Button>
          <Button type="submit" disabled={pending !== null}>
            {pending === "save" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}保存配置
          </Button>
        </div>
      </form>
    </section>
  );
}

function Field(props: Readonly<{
  id: string;
  label: string;
  className?: string;
  children: React.ReactNode;
}>) {
  return <Label htmlFor={props.id} className={`block ${props.className ?? ""}`}><span className="mb-1.5 block">{props.label}</span>{props.children}</Label>;
}

async function submitConfig(input: Readonly<{
  action: "save" | "test";
  draft: CompensationConfigDraft;
  setPending: (value: "save" | "test" | null) => void;
  onSaved: (settings: AdminCompensationSettings) => void;
}>) {
  input.setPending(input.action);
  try {
    const settings = await requestJson<AdminCompensationSettings>("/api/compensation/config", {
      method: "PATCH",
      body: JSON.stringify(configRequest(input.draft)),
    });
    input.onSaved(settings);
    if (input.action === "test") {
      const profile = await requestJson<LiandongMerchantProfile>("/api/compensation/config/test", { method: "POST" });
      toast.success(`连接成功：${profile.nickname || profile.username}`);
    } else {
      toast.success("补偿活动配置已保存");
    }
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error));
  } finally {
    input.setPending(null);
  }
}
