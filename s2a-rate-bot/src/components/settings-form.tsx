"use client";

import * as Switch from "@radix-ui/react-switch";
import { Loader2, PlugZap, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CompactNumberInput } from "./ui/compact-number-input";
import { WorkerStatusPanel } from "./worker-status-panel";

type SettingsFormState = {
  targetName: string;
  targetBaseUrl: string;
  adminApiKey: string;
  targetRechargeRatio: string;
  hasAdminApiKey: boolean;
  proxyEnabled: boolean;
  proxyUrl: string;
  workerIntervalSeconds: string;
  workerTimeoutSeconds: string;
  workerConcurrency: string;
};

const EMPTY_FORM: SettingsFormState = {
  targetName: "",
  targetBaseUrl: "",
  adminApiKey: "",
  targetRechargeRatio: "1",
  hasAdminApiKey: false,
  proxyEnabled: false,
  proxyUrl: "",
  workerIntervalSeconds: "600",
  workerTimeoutSeconds: "25",
  workerConcurrency: "3",
};

export function SettingsForm({ presentation = "page", onSaved }: Readonly<{ presentation?: "page" | "dialog"; onSaved?: () => void }>) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<"save" | "test" | null>(null);
  useEffect(() => { void loadSettings({ setForm, setLoading }); }, []);
  const update = <K extends keyof SettingsFormState>(key: K, value: SettingsFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void saveSettings({ form, setForm, setPending, onSaved });
  };
  if (loading) return <LoadingSettings presentation={presentation} />;
  const fields = <div className="grid items-start gap-5 xl:grid-cols-2"><div className="space-y-5"><TargetFields form={form} update={update} /><ProxyFields form={form} update={update} /></div><WorkerFields form={form} update={update} /></div>;
  if (presentation === "dialog") {
    return (
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
        <div className="space-y-5 overflow-y-auto px-5 py-5 sm:px-6">{fields}</div>
        <ActionBar compact pending={pending} onTest={() => { void testTarget({ setPending }); }} />
      </form>
    );
  }
  return (
    <section className="page-stack">
      <header><h1 className="page-heading">Global Settings</h1><p className="page-description">全局配置</p></header>
      <form className="space-y-5" onSubmit={submit}>
        {fields}
        <ActionBar pending={pending} onTest={() => { void testTarget({ setPending }); }} />
      </form>
    </section>
  );
}

function TargetFields({ form, update }: SettingsFieldsProps) {
  return (
    <SettingsCard title="目标站" description="目标 Sub2API 管理接口配置。">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="站点名称"><TextInput value={form.targetName} onChange={(value) => update("targetName", value)} /></Field>
        <Field label="站点地址"><TextInput type="url" value={form.targetBaseUrl} onChange={(value) => update("targetBaseUrl", value)} placeholder="https://sub2.example.com" /></Field>
      </div>
      <Field label="Admin Key" hint={form.hasAdminApiKey ? "已安全保存，留空表示不修改。" : "首次保存必须填写。"}>
        <TextInput type="password" value={form.adminApiKey} onChange={(value) => update("adminApiKey", value)} autoComplete="new-password" />
      </Field>
      <Field label="充值倍率" hint="用于把采集站分组倍率映射为本站倍率。">
        <CompactNumberInput required min="0.0001" step="any" suffix="倍" tone="rate" value={form.targetRechargeRatio} onChange={(value) => update("targetRechargeRatio", value)} />
      </Field>
    </SettingsCard>
  );
}

function ProxyFields({ form, update }: SettingsFieldsProps) {
  return (
    <SettingsCard title="全局代理" description="启用后，目标站和采集站请求统一使用此代理。">
      <div className="flex min-h-12 items-center justify-between gap-4 rounded-xl border border-border bg-surface-muted/50 px-3">
        <span className="text-sm font-medium text-foreground">启用代理</span>
        <Switch.Root aria-label="启用全局代理" checked={form.proxyEnabled} onCheckedChange={(value) => update("proxyEnabled", value)} className="h-6 w-11 rounded-full bg-border-strong p-0.5 transition-colors data-[state=checked]:bg-primary">
          <Switch.Thumb className="block size-5 rounded-full bg-surface shadow transition-transform data-[state=checked]:translate-x-5" />
        </Switch.Root>
      </div>
      <Field label="代理地址" hint="支持 http:// 和 https://。">
        <TextInput value={form.proxyUrl} onChange={(value) => update("proxyUrl", value)} placeholder="http://127.0.0.1:7890" disabled={!form.proxyEnabled} />
      </Field>
    </SettingsCard>
  );
}

function WorkerFields({ form, update }: SettingsFieldsProps) {
  return (
    <SettingsCard title="Worker" description="配置任务周期、单次请求超时和最大并发数。">
      <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
        <Field label="运行间隔"><CompactNumberInput required min="1" step="1" suffix="秒" width="medium" value={form.workerIntervalSeconds} onChange={(value) => update("workerIntervalSeconds", value)} /></Field>
        <Field label="请求超时"><CompactNumberInput required min="1" step="1" suffix="秒" value={form.workerTimeoutSeconds} onChange={(value) => update("workerTimeoutSeconds", value)} /></Field>
        <Field label="最大并发"><CompactNumberInput required min="1" step="1" suffix="路" width="narrow" value={form.workerConcurrency} onChange={(value) => update("workerConcurrency", value)} /></Field>
      </div>
      <WorkerStatusPanel />
    </SettingsCard>
  );
}

function SettingsCard({ title, description, children }: Readonly<{ title: string; description: string; children: React.ReactNode }>) {
  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-border bg-surface-muted/40 px-4 py-4 sm:px-5"><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm leading-6 text-muted">{description}</p></div>
      <div className="space-y-4 p-4 sm:p-5">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }: Readonly<{ label: string; hint?: string; children: React.ReactNode }>) {
  return (
    <label className="block space-y-2 text-sm font-medium text-foreground">
      <span>{label}</span>{children}{hint ? <span className="block text-xs font-normal text-muted">{hint}</span> : null}
    </label>
  );
}

function TextInput(input: Readonly<{ value: string; onChange: (value: string) => void; type?: string; placeholder?: string; autoComplete?: string; disabled?: boolean }>) {
  return <input {...input} onChange={(event) => input.onChange(event.target.value)} className="form-control" />;
}

function ActionBar({ pending, onTest, compact = false }: Readonly<{ pending: "save" | "test" | null; onTest: () => void; compact?: boolean }>) {
  const layout = compact
    ? "flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-surface-muted/60 px-5 py-4 sm:flex-row sm:justify-end sm:px-6"
    : "sticky bottom-20 z-20 flex flex-col gap-2 rounded-2xl border border-border bg-surface/95 p-3 shadow-panel backdrop-blur-xl sm:flex-row sm:justify-end lg:bottom-4";
  return (
    <div className={layout}>
      <button type="button" onClick={onTest} disabled={pending !== null} className="secondary-button">
        {pending === "test" ? <Loader2 className="size-4 animate-spin" /> : <PlugZap className="size-4" />}测试目标站
      </button>
      <button type="submit" disabled={pending !== null} className="primary-button">
        {pending === "save" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}保存配置
      </button>
    </div>
  );
}

function LoadingSettings({ presentation }: Readonly<{ presentation: "page" | "dialog" }>) {
  const layout = presentation === "dialog" ? "min-h-64 justify-center" : "";
  return <div className={`flex items-center gap-2 text-sm text-muted ${layout}`}><Loader2 className="size-4 animate-spin" />正在读取配置...</div>;
}

async function loadSettings(input: StateActions) {
  try {
    const response = await fetch("/api/settings", { cache: "no-store" });
    if (!response.ok) throw new Error(await responseError(response));
    const data = await response.json() as SettingsResponse;
    input.setForm(formFromResponse(data));
  } catch (error) {
    toast.error(errorMessage(error));
  } finally {
    input.setLoading(false);
  }
}

async function saveSettings(input: SaveActions) {
  input.setPending("save");
  try {
    const response = await fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(settingsPayload(input.form)) });
    if (!response.ok) throw new Error(await responseError(response));
    const data = await response.json() as SettingsResponse;
    input.setForm(formFromResponse(data));
    toast.success("全局配置已保存");
    input.onSaved?.();
  } catch (error) {
    toast.error(errorMessage(error));
  } finally {
    input.setPending(null);
  }
}

async function testTarget(input: Pick<SaveActions, "setPending">) {
  input.setPending("test");
  try {
    const response = await fetch("/api/settings/test-target", { method: "POST" });
    const body = await response.json() as { message?: string; error?: string };
    if (!response.ok) throw new Error(body.error ?? "目标站连接失败");
    toast.success(body.message ?? "目标站连接成功");
  } catch (error) {
    toast.error(errorMessage(error));
  } finally {
    input.setPending(null);
  }
}

function settingsPayload(form: SettingsFormState) {
  return {
    target: { name: form.targetName, baseUrl: form.targetBaseUrl, adminApiKey: form.adminApiKey, rechargeRatio: Number(form.targetRechargeRatio) },
    proxy: { enabled: form.proxyEnabled, proxyUrl: form.proxyUrl },
    worker: {
      intervalSeconds: Number(form.workerIntervalSeconds),
      timeoutSeconds: Number(form.workerTimeoutSeconds),
      concurrency: Number(form.workerConcurrency),
    },
  };
}

function formFromResponse(data: SettingsResponse): SettingsFormState {
  return {
    targetName: data.target?.name ?? "",
    targetBaseUrl: data.target?.baseUrl ?? "",
    adminApiKey: "",
    targetRechargeRatio: String(data.target?.rechargeRatio ?? 1),
    hasAdminApiKey: data.hasAdminApiKey,
    proxyEnabled: data.proxy.enabled,
    proxyUrl: data.proxy.proxyUrl,
    workerIntervalSeconds: String(data.worker.intervalSeconds),
    workerTimeoutSeconds: String(data.worker.timeoutSeconds),
    workerConcurrency: String(data.worker.concurrency),
  };
}

async function responseError(response: Response) {
  const body = await response.json() as { error?: string };
  return body.error ?? `请求失败 HTTP ${response.status}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

type SettingsFieldsProps = { form: SettingsFormState; update: <K extends keyof SettingsFormState>(key: K, value: SettingsFormState[K]) => void };
type StateActions = { setForm: React.Dispatch<React.SetStateAction<SettingsFormState>>; setLoading: (value: boolean) => void };
type SaveActions = { form: SettingsFormState; setForm: React.Dispatch<React.SetStateAction<SettingsFormState>>; setPending: (value: "save" | "test" | null) => void; onSaved?: () => void };
type SettingsResponse = { target: { name: string; baseUrl: string; rechargeRatio: number } | null; hasAdminApiKey: boolean; proxy: { enabled: boolean; proxyUrl: string }; worker: { intervalSeconds: number; timeoutSeconds: number; concurrency: number } };
