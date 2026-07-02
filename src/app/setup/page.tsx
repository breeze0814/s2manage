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

export default function SetupPage() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const setup = trpc.auth.setup.useMutation({
    onSuccess: async () => {
      await utils.auth.session.invalidate();
      router.replace("/");
      router.refresh();
    },
    onError: (e) => setError(e.message),
  });

  return (
    <AuthLayout title="初始设置" description="创建首个管理员账号，随后进入管理台。">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          setup.mutate({ email, password });
        }}
        className="space-y-4"
      >
        <div className="space-y-2">
          <Label htmlFor="email">管理员邮箱</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="admin@example.com" autoComplete="email" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">密码 (至少6位)</Label>
          <PasswordInput
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="••••••"
            minLength={6}
            autoComplete="new-password"
          />
        </div>
        {error ? <InlineError>{error}</InlineError> : null}
        <Button type="submit" className="w-full" disabled={setup.isPending}>
          {setup.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          {setup.isPending ? "创建中..." : "创建管理员"}
        </Button>
      </form>
    </AuthLayout>
  );
}
