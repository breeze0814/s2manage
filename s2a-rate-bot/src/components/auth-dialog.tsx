"use client";

import { Loader2, LockKeyhole } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

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
    <Dialog open>
        <DialogContent
          aria-describedby="auth-description"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
          className="w-[min(92vw,440px)] p-5 sm:p-7"
        >
          <AuthHeader mode={mode} />
          <AuthBody mode={mode} onAuthenticated={onAuthenticated} />
        </DialogContent>
    </Dialog>
  );
}

function AuthHeader({ mode }: Readonly<{ mode: AuthMode }>) {
  const setup = mode === "setup";
  const error = mode === "error";
  return (
    <div className="mb-6 text-center">
      <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-lg border border-primary-strong/15 bg-primary text-primary-foreground shadow-sm">
        <LockKeyhole className="size-5" aria-hidden="true" />
      </div>
      <DialogTitle className="text-xl font-semibold">{error ? "认证服务不可用" : setup ? "初始化管理员" : "登录 S2A Rate Bot"}</DialogTitle>
      <DialogDescription id="auth-description" className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted">
        {error ? "后台无法确认当前登录状态。" : setup ? "首次使用需要创建本地管理员账号。" : "登录后管理倍率采集与账号调度。"}
      </DialogDescription>
    </div>
  );
}

function LoadingAuth() {
  return <div className="flex min-h-24 items-center justify-center gap-2 rounded-lg bg-surface-muted text-sm text-muted"><Loader2 className="size-4 animate-spin" />正在检查登录状态...</div>;
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
    <div role="alert" className="space-y-4 rounded-lg border border-danger/25 bg-danger/10 p-4 text-sm text-danger">
      <p className="leading-6">无法读取登录状态，请检查 APP_SECRET 和数据库配置。</p>
      <Button type="button" variant="outline" onClick={() => window.location.reload()} className="w-full border-danger/30 text-danger hover:bg-danger/10 hover:text-danger">
        重新加载
      </Button>
    </div>
  );
}

function CredentialsForm({ mode, onAuthenticated }: Readonly<{
  mode: Exclude<AuthMode, "loading" | "error" | "ready">;
  onAuthenticated: () => void;
}>) {
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      if (!response.ok) {
        const body = await response.json() as { error?: string };
        throw new Error(body.error ?? "认证失败");
      }
      toast.success(mode === "setup" ? "管理员创建成功" : "登录成功");
      onAuthenticated();
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={(event) => { void submit(event); }}>
      <AuthField name="email" label="管理员邮箱" type="email" autoComplete="email" />
      <AuthField name="password" label="密码" type="password" autoComplete={mode === "setup" ? "new-password" : "current-password"} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        {pending ? "处理中..." : mode === "setup" ? "创建管理员" : "登录"}
      </Button>
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
    <Label className="block space-y-2 text-foreground">
      <span>{label}</span>
      <Input required minLength={field.type === "password" ? 6 : undefined} {...field} />
    </Label>
  );
}
