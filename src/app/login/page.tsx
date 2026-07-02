"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { AuthLayout } from "@/components/app/auth-layout";
import { InlineError } from "@/components/app/feedback-state";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";

export default function LoginPage() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const login = trpc.auth.login.useMutation({
    onSuccess: async () => {
      await utils.auth.session.invalidate();
      router.replace("/");
      router.refresh();
    },
    onError: (e) => setError(e.message),
  });

  return (
    <AuthLayout title="S2A Manager" description="登录后管理 Sub2API 连接、倍率和同步任务。">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          login.mutate({ email, password });
        }}
        className="space-y-4"
      >
        <div className="space-y-2">
          <Label htmlFor="email">邮箱</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="admin@example.com" autoComplete="email" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">密码</Label>
          <PasswordInput id="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••" autoComplete="current-password" />
        </div>
        {error ? <InlineError>{error}</InlineError> : null}
        <Button type="submit" className="w-full" disabled={login.isPending}>
          {login.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          {login.isPending ? "登录中..." : "登录"}
        </Button>
      </form>
    </AuthLayout>
  );
}
