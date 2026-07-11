"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Loader2, LockKeyhole } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

type AuthMode = "loading" | "setup" | "login" | "error" | "ready";
type AuthStatus = { initialized: boolean; authenticated: boolean };

export function AuthDialog() {
  const [mode, setMode] = useState<AuthMode>("loading");
  useEffect(() => {
    void loadAuthMode(setMode).catch((error: unknown) => {
      console.error("Failed to load authentication status", error);
      setMode("error");
    });
  }, []);
  if (mode === "ready") return null;
  return <BlockingDialog mode={mode} onAuthenticated={() => setMode("ready")} />;
}

async function loadAuthMode(setMode: (mode: AuthMode) => void) {
  const response = await fetch("/api/auth/status", { cache: "no-store" });
  if (!response.ok) throw new Error(await response.text());
  const status = await response.json() as AuthStatus;
  setMode(status.authenticated ? "ready" : status.initialized ? "login" : "setup");
}

function BlockingDialog({ mode, onAuthenticated }: Readonly<{
  mode: Exclude<AuthMode, "ready">;
  onAuthenticated: () => void;
}>) {
  return (
    <Dialog.Root open>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby="auth-description"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
          className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,440px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-surface p-5 shadow-2xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:p-7"
        >
          <AuthHeader mode={mode} />
          <AuthBody mode={mode} onAuthenticated={onAuthenticated} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function AuthHeader({ mode }: Readonly<{ mode: AuthMode }>) {
  const setup = mode === "setup";
  const error = mode === "error";
  return (
    <div className="mb-6 text-center">
      <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
        <LockKeyhole className="size-5" aria-hidden="true" />
      </div>
      <Dialog.Title className="text-xl font-semibold tracking-tight">{error ? "认证服务不可用" : setup ? "初始化管理员" : "登录 S2A Rate Bot"}</Dialog.Title>
      <Dialog.Description id="auth-description" className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted">
        {error ? "后台无法确认当前登录状态。" : setup ? "首次使用需要创建本地管理员账号。" : "登录后管理倍率采集与账号调度。"}
      </Dialog.Description>
    </div>
  );
}

function LoadingAuth() {
  return <div className="flex min-h-24 items-center justify-center gap-2 rounded-xl bg-surface-muted text-sm text-muted"><Loader2 className="size-4 animate-spin" />正在检查登录状态...</div>;
}

function AuthBody({ mode, onAuthenticated }: Readonly<{
  mode: Exclude<AuthMode, "ready">;
  onAuthenticated: () => void;
}>) {
  if (mode === "loading") return <LoadingAuth />;
  if (mode === "error") return <AuthFailure />;
  return <CredentialsForm mode={mode} onAuthenticated={onAuthenticated} />;
}

function AuthFailure() {
  return (
    <div role="alert" className="space-y-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
      <p className="leading-6">无法读取登录状态，请检查 APP_SECRET 和数据库配置。</p>
      <button type="button" onClick={() => window.location.reload()} className="secondary-button w-full border-red-200 bg-transparent">
        重新加载
      </button>
    </div>
  );
}

function CredentialsForm({ mode, onAuthenticated }: Readonly<{
  mode: Exclude<AuthMode, "loading" | "error" | "ready">;
  onAuthenticated: () => void;
}>) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
    });
    setPending(false);
    if (!response.ok) {
      const body = await response.json() as { error?: string };
      setError(body.error ?? "认证失败");
      return;
    }
    onAuthenticated();
    window.location.reload();
  }

  return (
    <form className="space-y-4" onSubmit={(event) => { void submit(event); }}>
      <AuthField name="email" label="管理员邮箱" type="email" autoComplete="email" />
      <AuthField name="password" label="密码" type="password" autoComplete={mode === "setup" ? "new-password" : "current-password"} />
      {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p> : null}
      <button type="submit" disabled={pending} className="primary-button w-full">
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        {pending ? "处理中..." : mode === "setup" ? "创建管理员" : "登录"}
      </button>
    </form>
  );
}

function AuthField(input: Readonly<{
  name: string;
  label: string;
  type: "email" | "password";
  autoComplete: string;
}>) {
  const { label, ...field } = input;
  return (
    <label className="block space-y-2 text-sm font-medium text-foreground">
      <span>{label}</span>
      <input required minLength={field.type === "password" ? 6 : undefined} {...field} className="form-control" />
    </label>
  );
}
