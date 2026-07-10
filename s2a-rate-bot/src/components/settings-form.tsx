"use client";

import * as Switch from "@radix-ui/react-switch";
import { Loader2, PlugZap, Save } from "lucide-react";
import { useEffect, useState } from "react";

type SettingsFormState = {
  targetName: string;
  targetBaseUrl: string;
  adminApiKey: string;
  hasAdminApiKey: boolean;
  proxyEnabled: boolean;
  proxyUrl: string;
  workerIntervalSeconds: string;
  workerTimeoutSeconds: string;
  workerConcurrency: string;
};

type Feedback = { readonly tone: "idle" | "error" | "success"; readonly message: string };
const EMPTY_FORM: SettingsFormState = {
  targetName: "",
  targetBaseUrl: "",
  adminApiKey: "",
  hasAdminApiKey: false,
  proxyEnabled: false,
  proxyUrl: "",
  workerIntervalSeconds: "600",
  workerTimeoutSeconds: "25",
  workerConcurrency: "3",
};

export function SettingsForm() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<"save" | "test" | null>(null);
  const [feedback, setFeedback] = useState<Feedback>({ tone: "idle", message: "" });
  useEffect(() => { void loadSettings({ setForm, setLoading, setFeedback }); }, []);
  const update = <K extends keyof SettingsFormState>(key: K, value: SettingsFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  if (loading) return <LoadingSettings />;
  return (
    <section className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">全局配置</h1>
        <p className="mt-1 text-sm text-slate-600">管理目标站、全局代理以及 Worker 运行参数。</p>
      </header>
      <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); void saveSettings({ form, setForm, setPending, setFeedback }); }}>
        <TargetFields form={form} update={update} />
        <ProxyFields form={form} update={update} />
        <WorkerFields form={form} update={update} />
        <FeedbackMessage feedback={feedback} />
        <ActionBar pending={pending} onTest={() => { void testTarget({ setPending, setFeedback }); }} />
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
    </SettingsCard>
  );
}

function ProxyFields({ form, update }: SettingsFieldsProps) {
  return (
    <SettingsCard title="全局代理" description="启用后，目标站和采集站请求统一使用此代理。">
      <div className="flex min-h-11 items-center justify-between gap-4 rounded-lg border border-slate-200 px-3">
        <span className="text-sm font-medium text-slate-700">启用代理</span>
        <Switch.Root checked={form.proxyEnabled} onCheckedChange={(value) => update("proxyEnabled", value)} className="h-6 w-11 rounded-full bg-slate-300 p-0.5 data-[state=checked]:bg-slate-900">
          <Switch.Thumb className="block size-5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-5" />
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
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="运行间隔（秒）"><NumberInput value={form.workerIntervalSeconds} onChange={(value) => update("workerIntervalSeconds", value)} /></Field>
        <Field label="请求超时（秒）"><NumberInput value={form.workerTimeoutSeconds} onChange={(value) => update("workerTimeoutSeconds", value)} /></Field>
        <Field label="最大并发数"><NumberInput value={form.workerConcurrency} onChange={(value) => update("workerConcurrency", value)} /></Field>
      </div>
      <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">尚无 Worker 运行记录。</p>
    </SettingsCard>
  );
}

function SettingsCard({ title, description, children }: Readonly<{ title: string; description: string; children: React.ReactNode }>) {
  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm text-slate-600">{description}</p></div>
      {children}
    </div>
  );
}

function Field({ label, hint, children }: Readonly<{ label: string; hint?: string; children: React.ReactNode }>) {
  return (
    <label className="block space-y-2 text-sm font-medium text-slate-700">
      <span>{label}</span>{children}{hint ? <span className="block text-xs font-normal text-slate-500">{hint}</span> : null}
    </label>
  );
}

function TextInput(input: Readonly<{ value: string; onChange: (value: string) => void; type?: string; placeholder?: string; autoComplete?: string; disabled?: boolean }>) {
  return <input {...input} onChange={(event) => input.onChange(event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 outline-none ring-slate-900 focus:ring-2 disabled:bg-slate-100" />;
}

function NumberInput({ value, onChange }: Readonly<{ value: string; onChange: (value: string) => void }>) {
  return <input type="number" min="1" step="1" required value={value} onChange={(event) => onChange(event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 outline-none ring-slate-900 focus:ring-2" />;
}

function ActionBar({ pending, onTest }: Readonly<{ pending: "save" | "test" | null; onTest: () => void }>) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
      <button type="button" onClick={onTest} disabled={pending !== null} className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium disabled:opacity-50">
        {pending === "test" ? <Loader2 className="size-4 animate-spin" /> : <PlugZap className="size-4" />}测试目标站
      </button>
      <button type="submit" disabled={pending !== null} className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white disabled:opacity-50">
        {pending === "save" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}保存配置
      </button>
    </div>
  );
}

function FeedbackMessage({ feedback }: Readonly<{ feedback: Feedback }>) {
  if (!feedback.message) return null;
  return <p role="status" className={feedback.tone === "error" ? "text-sm text-red-600" : "text-sm text-emerald-700"}>{feedback.message}</p>;
}

function LoadingSettings() {
  return <div className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="size-4 animate-spin" />正在读取配置...</div>;
}

async function loadSettings(input: StateActions) {
  try {
    const response = await fetch("/api/settings", { cache: "no-store" });
    if (!response.ok) throw new Error(await responseError(response));
    const data = await response.json() as SettingsResponse;
    input.setForm(formFromResponse(data));
  } catch (error) {
    input.setFeedback({ tone: "error", message: errorMessage(error) });
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
    input.setFeedback({ tone: "success", message: "全局配置已保存" });
  } catch (error) {
    input.setFeedback({ tone: "error", message: errorMessage(error) });
  } finally {
    input.setPending(null);
  }
}

async function testTarget(input: Pick<SaveActions, "setPending" | "setFeedback">) {
  input.setPending("test");
  try {
    const response = await fetch("/api/settings/test-target", { method: "POST" });
    const body = await response.json() as { message?: string; error?: string };
    if (!response.ok) throw new Error(body.error ?? "目标站连接失败");
    input.setFeedback({ tone: "success", message: body.message ?? "目标站连接成功" });
  } catch (error) {
    input.setFeedback({ tone: "error", message: errorMessage(error) });
  } finally {
    input.setPending(null);
  }
}

function settingsPayload(form: SettingsFormState) {
  return {
    target: { name: form.targetName, baseUrl: form.targetBaseUrl, adminApiKey: form.adminApiKey },
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
type StateActions = { setForm: React.Dispatch<React.SetStateAction<SettingsFormState>>; setLoading: (value: boolean) => void; setFeedback: (value: Feedback) => void };
type SaveActions = { form: SettingsFormState; setForm: React.Dispatch<React.SetStateAction<SettingsFormState>>; setPending: (value: "save" | "test" | null) => void; setFeedback: (value: Feedback) => void };
type SettingsResponse = { target: { name: string; baseUrl: string } | null; hasAdminApiKey: boolean; proxy: { enabled: boolean; proxyUrl: string }; worker: { intervalSeconds: number; timeoutSeconds: number; concurrency: number } };
