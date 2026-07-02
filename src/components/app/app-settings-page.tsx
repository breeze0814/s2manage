"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/app/feedback-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { useToast } from "@/components/ui/toast";
import { PanelActions, PanelHeader } from "@/components/app/panel-header";

export function AppSettingsPage() {
  const utils = trpc.useUtils();
  const { showToast } = useToast();
  const { data: settings, isFetching, isLoading, refetch } = trpc.appSettings.get.useQuery();

  const [workerIntervalMinutes, setWorkerIntervalMinutes] = useState("10");
  const [upstreamMonitorTimeoutSeconds, setUpstreamMonitorTimeoutSeconds] = useState("45");
  const [upstreamMonitorConcurrency, setUpstreamMonitorConcurrency] = useState("3");
  const [workerError, setWorkerError] = useState("");

  const saveWorker = trpc.appSettings.saveWorker.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.appSettings.get.invalidate(),
        utils.serviceStatus.overview.invalidate(),
      ]);
      setWorkerError("");
      showToast({ title: "Worker 配置已保存", variant: "success" });
    },
    onError: (error) => {
      setWorkerError(error.message);
      showToast({ title: "保存 Worker 配置失败", description: error.message, variant: "error" });
    },
  });

  useEffect(() => {
    if (!settings) return;
    setWorkerIntervalMinutes(String(Math.max(1, Math.round((settings.workerIntervalSeconds ?? 600) / 60))));
    setUpstreamMonitorTimeoutSeconds(String(settings.upstreamMonitorTimeoutSeconds ?? 45));
    setUpstreamMonitorConcurrency(String(settings.upstreamMonitorConcurrency ?? 3));
  }, [settings]);

  if (isLoading) {
    return <LoadingState label="加载应用设置..." />;
  }

  const parsedWorkerIntervalMinutes = Number(workerIntervalMinutes);
  const parsedWorkerIntervalSeconds = Number.isFinite(parsedWorkerIntervalMinutes) ? Math.round(parsedWorkerIntervalMinutes * 60) : NaN;
  const parsedMonitorTimeoutSeconds = Number(upstreamMonitorTimeoutSeconds);
  const parsedMonitorConcurrency = Number(upstreamMonitorConcurrency);
  const timeoutWarning = Number.isFinite(parsedWorkerIntervalSeconds)
    && Number.isFinite(parsedMonitorTimeoutSeconds)
    && parsedMonitorTimeoutSeconds >= parsedWorkerIntervalSeconds;

  const handleSaveWorker = () => {
    setWorkerError("");
    if (!Number.isInteger(parsedWorkerIntervalMinutes) || parsedWorkerIntervalMinutes < 1 || parsedWorkerIntervalMinutes > 24 * 60) {
      setWorkerError("Worker 运行间隔必须是 1-1440 的整数分钟");
      return;
    }
    if (!Number.isInteger(parsedMonitorTimeoutSeconds) || parsedMonitorTimeoutSeconds < 10 || parsedMonitorTimeoutSeconds > 300) {
      setWorkerError("上游检测超时必须是 10-300 的整数秒");
      return;
    }
    if (!Number.isInteger(parsedMonitorConcurrency) || parsedMonitorConcurrency < 1 || parsedMonitorConcurrency > 20) {
      setWorkerError("上游检测并发数必须是 1-20 的整数");
      return;
    }

    saveWorker.mutate({
      workerIntervalSeconds: parsedWorkerIntervalSeconds,
      upstreamMonitorTimeoutSeconds: parsedMonitorTimeoutSeconds,
      upstreamMonitorConcurrency: parsedMonitorConcurrency,
    });
  };

  const handleRefreshSettings = async () => {
    const result = await refetch();
    if (result.error) {
      showToast({ title: "刷新应用设置失败", description: result.error.message, variant: "error" });
      return;
    }
    showToast({ title: "应用设置已刷新", variant: "success" });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 sm:space-y-6">
      <PanelHeader
        title="应用设置"
        description="管理后台 Worker 运行参数与可登录管理员账号。"
        actions={(
          <PanelActions className="grid-cols-1">
            <Button variant="outline" size="sm" onClick={handleRefreshSettings} disabled={isFetching || saveWorker.isPending}>
              {isFetching ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              刷新
            </Button>
          </PanelActions>
        )}
      />

      <Card>
        <CardHeader>
          <CardTitle>Worker 运行配置</CardTitle>
          <CardDescription>控制后台 worker 多久扫描一次倍率采集、自动同步和上游检测任务。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="worker-interval-minutes">Worker 运行间隔（分钟）</Label>
              <Input
                id="worker-interval-minutes"
                type="number"
                min="1"
                max={24 * 60}
                step="1"
                value={workerIntervalMinutes}
                onChange={(event) => setWorkerIntervalMinutes(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">最小 1 分钟；倍率采集源站仍按各自采集间隔判断是否到期。</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="upstream-monitor-timeout-seconds">上游检测超时（秒）</Label>
              <Input
                id="upstream-monitor-timeout-seconds"
                type="number"
                min="10"
                max="300"
                step="1"
                value={upstreamMonitorTimeoutSeconds}
                onChange={(event) => setUpstreamMonitorTimeoutSeconds(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">源站超时会记为失败，不会阻塞 worker 退出。</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="upstream-monitor-concurrency">上游检测并发数</Label>
              <Input
                id="upstream-monitor-concurrency"
                type="number"
                min="1"
                max="20"
                step="1"
                value={upstreamMonitorConcurrency}
                onChange={(event) => setUpstreamMonitorConcurrency(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">多个账号到期检测时按此并发执行。</p>
            </div>
          </div>

          {timeoutWarning ? (
            <div className="rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-200">
              当前检测超时不小于 worker 间隔。若源站持续超时，实际检测频率可能低于设定间隔。
            </div>
          ) : null}
          {workerError ? <ErrorState title="保存 Worker 配置失败" description={workerError} className="py-3" /> : null}

          <Button className="w-full lg:w-auto" onClick={handleSaveWorker} disabled={saveWorker.isPending}>
            {saveWorker.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {saveWorker.isPending ? "保存中..." : "保存 Worker 配置"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>管理员管理</CardTitle>
          <CardDescription>管理允许登录 S2A Manager 的管理员账号。</CardDescription>
        </CardHeader>
        <CardContent>
          <AdminUsersList />
        </CardContent>
      </Card>
    </div>
  );
}

function AdminUsersList() {
  const utils = trpc.useUtils();
  const { showToast } = useToast();
  const { data: users, isLoading } = trpc.auth.listUsers.useQuery();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; email: string } | null>(null);

  const addUser = trpc.auth.addUser.useMutation({
    onSuccess: async () => {
      await utils.auth.listUsers.invalidate();
      setEmail("");
      setPassword("");
      setError("");
      showToast({ title: "管理员已添加", variant: "success" });
    },
    onError: (mutationError) => {
      setError(mutationError.message);
      showToast({ title: "添加管理员失败", description: mutationError.message, variant: "error" });
    },
  });
  const deleteUser = trpc.auth.deleteUser.useMutation({
    onSuccess: async () => {
      await utils.auth.listUsers.invalidate();
      setDeleteTarget(null);
      showToast({ title: "管理员已删除", variant: "success" });
    },
    onError: (mutationError) => showToast({ title: "删除管理员失败", description: mutationError.message, variant: "error" }),
  });

  if (isLoading) return <LoadingState label="加载管理员..." className="min-h-20 py-4" />;

  return (
    <>
      <div className="space-y-4">
        <div className="divide-y divide-border/70 rounded-md border border-border/80 bg-card">
          {(users ?? []).length === 0 ? (
            <EmptyState title="暂无管理员" description="添加第一个管理员后，即可使用该账号登录 S2A Manager。" className="m-3 py-6" />
          ) : (
            (users ?? []).map((user) => (
              <div key={user.id} className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="whitespace-normal break-all text-sm font-medium leading-5 [overflow-wrap:anywhere]">{user.email}</p>
                  <p className="text-xs text-muted-foreground">{new Date(user.createdAt).toLocaleDateString("zh-CN")}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-destructive hover:text-destructive lg:w-auto"
                  disabled={deleteUser.isPending}
                  onClick={() => setDeleteTarget({ id: user.id, email: user.email })}
                >
                  <Trash2 className="size-4" />
                  删除
                </Button>
              </div>
            ))
          )}
        </div>

        <div className="grid gap-2 border-t pt-4 lg:grid-cols-[1fr_1fr_auto]">
          <div className="space-y-2">
            <Label htmlFor="admin-email">管理员邮箱</Label>
            <Input id="admin-email" autoComplete="email" placeholder="邮箱" value={email} onChange={(event) => setEmail(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-password">管理员密码</Label>
            <PasswordInput id="admin-password" autoComplete="new-password" placeholder="密码，至少 6 位" value={password} onChange={(event) => setPassword(event.target.value)} />
          </div>
          <Button className="w-full lg:w-auto lg:self-end" onClick={() => addUser.mutate({ email, password })} disabled={addUser.isPending}>
            <Plus className="size-4" />
            {addUser.isPending ? "添加中..." : "添加"}
          </Button>
        </div>
        {error ? <ErrorState title="更新管理员失败" description={error} className="py-3" /> : null}
      </div>
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="删除管理员"
        description={
          deleteTarget
            ? `确定删除管理员「${deleteTarget.email}」？该账号将无法继续登录 S2A Manager。`
            : "确定删除此管理员？该账号将无法继续登录 S2A Manager。"
        }
        confirmLabel="删除管理员"
        pending={deleteUser.isPending}
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteUser.mutate({ id: deleteTarget.id });
        }}
      />
    </>
  );
}
