"use client";

import { useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Database, Loader2, RefreshCw, ServerCog, Trash2, WifiOff } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { logActionLabel } from "@/lib/log-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableEmptyRow, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { PanelActions, PanelHeader } from "@/components/app/panel-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/app/feedback-state";
import { MetricCard, type MetricTone } from "@/components/app/metric-card";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import {
  MobileRecord,
  MobileRecordField,
  MobileRecordFields,
  MobileRecordHeader,
  MobileRecordList,
  MobileRecordMeta,
  MobileRecordTitle,
} from "@/components/app/mobile-record";

type StatusTone = "ok" | "warn" | "bad";

function asDate(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date : null;
}

function formatDateTime(value: unknown) {
  const date = asDate(value);
  return date ? date.toLocaleString("zh-CN", { hour12: false }) : "-";
}

function formatRelative(value: unknown) {
  const date = asDate(value);
  if (!date) return "-";
  const diffMs = date.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const minutes = Math.round(abs / 60_000);
  if (minutes < 1) return diffMs >= 0 ? "即将" : "刚刚";
  if (minutes < 60) return diffMs >= 0 ? `${minutes} 分钟后` : `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return diffMs >= 0 ? `${hours} 小时后` : `${hours} 小时前`;
  const days = Math.round(hours / 24);
  return diffMs >= 0 ? `${days} 天后` : `${days} 天前`;
}

function formatDuration(seconds: number | null | undefined) {
  if (!seconds || !Number.isFinite(seconds)) return "-";
  if (seconds < 60) return `${Math.round(seconds)} 秒`;
  const minutes = Math.floor(seconds / 60);
  const restSeconds = Math.round(seconds % 60);
  if (minutes < 60) return restSeconds ? `${minutes} 分 ${restSeconds} 秒` : `${minutes} 分`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes ? `${hours} 小时 ${restMinutes} 分` : `${hours} 小时`;
}

function formatMilliseconds(value: number | null | undefined) {
  if (!value || !Number.isFinite(value)) return "-";
  if (value < 1000) return `${Math.round(value)}ms`;
  return formatDuration(value / 1000);
}

function statusBadge(tone: StatusTone, label: string) {
  if (tone === "ok") return <Badge variant="success">{label}</Badge>;
  if (tone === "warn") return <Badge variant="warning">{label}</Badge>;
  return <Badge variant="destructive">{label}</Badge>;
}

function metricTone(tone: StatusTone): MetricTone {
  if (tone === "ok") return "success";
  if (tone === "warn") return "warning";
  return "danger";
}

export function ServiceStatusPanel({ connectionId }: { connectionId?: number }) {
  const utils = trpc.useUtils();
  const { showToast } = useToast();
  const [cleanupConfirmOpen, setCleanupConfirmOpen] = useState(false);
  const { data, error, isLoading, isFetching, refetch } = trpc.serviceStatus.overview.useQuery(
    connectionId ? { connectionId } : undefined,
    { refetchInterval: 30_000 },
  );
  const cleanupInvalidData = trpc.serviceStatus.cleanupInvalidData.useMutation({
    onSuccess: async (result) => {
      await Promise.all([
        utils.serviceStatus.overview.invalidate(connectionId ? { connectionId } : undefined),
        utils.sync.logs.invalidate(),
        connectionId ? utils.groups.list.invalidate({ connectionId }) : utils.groups.list.invalidate(),
        connectionId ? utils.accounts.list.invalidate({ connectionId }) : utils.accounts.list.invalidate(),
        utils.bl.bindings.invalidate(),
        utils.upstreamMonitor.list.invalidate(),
        utils.announcements.rules.invalidate(),
        utils.connections.list.invalidate(),
      ]);

      const totalRemoved = result.totals.deletedGroupBindings
        + result.totals.deletedGroupRules
        + result.totals.deletedAccountBindings
        + result.totals.deletedAccountRules
        + result.totals.deletedUpstreamMonitorRules
        + result.totals.removedAnnouncementTargetIds
        + result.totals.deletedMissingSourceBindings
        + result.totals.deletedInvalidMonitorRateExclusions;
      const totalDisabled = result.totals.disabledGroupRules
        + result.totals.disabledAccountRules
        + result.totals.disabledUpstreamMonitorRules
        + result.totals.disabledAnnouncementRules
        + result.totals.disabledAutoSyncConnections
        + result.totals.disabledRulesWithoutSources;

      showToast({
        title: "无效数据清理完成",
        description: `删除/移除 ${totalRemoved} 项，禁用 ${totalDisabled} 项，异常连接 ${result.unavailableConnections} 个`,
        variant: result.unavailableConnections > 0 ? "info" : "success",
      });
      setCleanupConfirmOpen(false);
    },
    onError: (cleanupError) => {
      showToast({ title: "清理无效数据失败", description: cleanupError.message, variant: "error" });
    },
  });

  const handleRefresh = async () => {
    const result = await refetch();
    if (result.error) {
      showToast({ title: "刷新服务状态失败", description: result.error.message, variant: "error" });
      return;
    }
    showToast({ title: "服务状态已刷新", variant: "success" });
  };

  const handleCleanupInvalidData = () => {
    setCleanupConfirmOpen(true);
  };

  const handleConfirmCleanupInvalidData = () => {
    cleanupInvalidData.mutate(connectionId ? { connectionId } : undefined);
  };

  if (isLoading) {
    return <LoadingState />;
  }

  if (error) {
    return <ErrorState title="加载服务状态失败" description={error.message} />;
  }

  if (!data) return null;

  const workerTone: StatusTone = data.worker.online
    ? data.worker.lastRunStatus === "failed" ? "warn" : "ok"
    : "bad";
  const workerLabel = data.worker.online ? data.worker.lastRunStatus === "failed" ? "最近异常" : "在线" : "离线";
  const databaseTone: StatusTone = data.database.ok ? "ok" : "bad";
  const blTone: StatusTone = data.bl.configured ? "ok" : "warn";
  const failedLogsTone: StatusTone = data.recentLogs.failed > 0 ? "warn" : "ok";
  const cleanupScope = connectionId ? "当前连接" : "全部连接";

  return (
    <div className="space-y-4">
      <PanelHeader
        title="服务状态"
        description={`最后检查：${formatDateTime(data.checkedAt)}。集中查看 Web、数据库、Worker 与近期任务健康度。`}
        actions={
          <PanelActions>
          <Button variant="outline" size="sm" onClick={handleCleanupInvalidData} disabled={cleanupInvalidData.isPending}>
            {cleanupInvalidData.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />}
            清理无效数据
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isFetching}>
            {isFetching ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
            刷新
          </Button>
          </PanelActions>
        }
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={ServerCog}
          title="Web 服务"
          value="在线"
          detail={`已运行 ${formatDuration(data.web.uptimeSeconds)}`}
          tone="success"
        />
        <MetricCard
          icon={Database}
          title="数据库"
          value={data.database.ok ? "正常" : "异常"}
          detail={data.database.message}
          tone={metricTone(databaseTone)}
        />
        <MetricCard
          icon={data.worker.online ? Activity : WifiOff}
          title="Worker"
          value={workerLabel}
          detail={data.worker.heartbeatAt ? `心跳 ${formatRelative(data.worker.heartbeatAt)}` : "尚未收到心跳"}
          tone={metricTone(workerTone)}
        />
        <MetricCard
          icon={data.recentLogs.failed > 0 ? AlertTriangle : CheckCircle2}
          title="最近任务"
          value={`${data.recentLogs.failed}/${data.recentLogs.total} 异常`}
          detail={connectionId ? "当前连接最近日志" : "全部连接最近日志"}
          tone={metricTone(failedLogsTone)}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Worker 详情</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm lg:grid-cols-2">
            <div className="rounded-md border border-border/70 p-3">
              <div className="text-muted-foreground">当前状态</div>
              <div className="mt-1">{statusBadge(workerTone, workerLabel)}</div>
            </div>
            <div className="rounded-md border border-border/70 p-3">
              <div className="text-muted-foreground">运行间隔</div>
              <div className="mt-1 font-mono">{formatDuration(data.worker.intervalSeconds)}</div>
            </div>
            <div className="rounded-md border border-border/70 p-3">
              <div className="text-muted-foreground">检测超时</div>
              <div className="mt-1 font-mono">{formatDuration(data.worker.upstreamMonitorTimeoutSeconds)}</div>
            </div>
            <div className="rounded-md border border-border/70 p-3">
              <div className="text-muted-foreground">检测并发</div>
              <div className="mt-1 font-mono">{data.worker.upstreamMonitorConcurrency}</div>
            </div>
            <div className="rounded-md border border-border/70 p-3">
              <div className="text-muted-foreground">最近心跳</div>
              <div className="mt-1">{formatDateTime(data.worker.heartbeatAt)}</div>
            </div>
            <div className="rounded-md border border-border/70 p-3">
              <div className="text-muted-foreground">下一次运行</div>
              <div className="mt-1">{formatRelative(data.worker.nextRunAt)}</div>
            </div>
            <div className="rounded-md border border-border/70 p-3">
              <div className="text-muted-foreground">最近开始</div>
              <div className="mt-1">{formatDateTime(data.worker.lastRunStartedAt)}</div>
            </div>
            <div className="rounded-md border border-border/70 p-3">
              <div className="text-muted-foreground">最近结束</div>
              <div className="mt-1">{formatDateTime(data.worker.lastRunFinishedAt)}</div>
            </div>
            <div className="rounded-md border border-border/70 p-3">
              <div className="text-muted-foreground">最近耗时</div>
              <div className="mt-1 font-mono">{formatMilliseconds(data.worker.lastRunDurationMs)}</div>
            </div>
            <div className="rounded-md border border-border/70 p-3">
              <div className="text-muted-foreground">最近消息</div>
              <div className="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]" title={data.worker.lastRunMessage ?? ""}>{data.worker.lastRunMessage || "-"}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">任务配置</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 p-3">
              <span className="text-muted-foreground">倍率采集源</span>
              {statusBadge(blTone, data.bl.configured ? "已配置" : "未配置")}
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 p-3">
              <span className="text-muted-foreground">采集源总数</span>
              <span className="font-mono">{data.bl.totalSites}</span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 p-3">
              <span className="text-muted-foreground">启用采集源</span>
              <span className="font-mono">{data.bl.enabledSites}</span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 p-3">
              <span className="text-muted-foreground">在线 / 离线</span>
              <span className="font-mono">{data.bl.onlineSites}/{data.bl.offlineSites}</span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 p-3">
              <span className="text-muted-foreground">自动同步连接</span>
              <span className="font-mono">{data.connections.auto}</span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 p-3">
              <span className="text-muted-foreground">上游检测规则</span>
              <span className="font-mono">{data.upstreamMonitor.enabledRules}/{data.upstreamMonitor.rules} 启用</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">维护操作</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-col gap-3 rounded-md border border-border/70 p-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="font-medium">清理无效数据</div>
              <p className="mt-1 text-muted-foreground">
                删除不存在目标或来源对应的 BL 绑定、倍率规则和监控规则；源站分组改名时更新绑定名称；连接或密钥异常时禁用自动规则，保留绑定以便修复后重新启用。
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={handleCleanupInvalidData} disabled={cleanupInvalidData.isPending} className="w-full shrink-0 lg:w-auto">
              {cleanupInvalidData.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />}
              执行清理
            </Button>
          </div>
          {cleanupInvalidData.data ? (
            <div className="rounded-md border border-border/70 bg-muted/40 p-3">
              <div className="flex flex-wrap items-center gap-2">
                {statusBadge(cleanupInvalidData.data.unavailableConnections > 0 ? "warn" : "ok", cleanupInvalidData.data.unavailableConnections > 0 ? "存在异常连接" : "清理完成")}
                <span className="text-muted-foreground">
                  检查 {cleanupInvalidData.data.checkedConnections} 个连接，清理 {cleanupInvalidData.data.cleanedConnections} 个连接
                </span>
              </div>
              <div className="mt-3 grid gap-2 text-xs lg:grid-cols-2 xl:grid-cols-4">
                <div>分组绑定：{cleanupInvalidData.data.totals.deletedGroupBindings}</div>
                <div>分组规则：{cleanupInvalidData.data.totals.deletedGroupRules}</div>
                <div>账号绑定：{cleanupInvalidData.data.totals.deletedAccountBindings}</div>
                <div>账号规则：{cleanupInvalidData.data.totals.deletedAccountRules}</div>
                <div>监控规则：{cleanupInvalidData.data.totals.deletedUpstreamMonitorRules}</div>
                <div>公告目标：{cleanupInvalidData.data.totals.removedAnnouncementTargetIds}</div>
                <div>失效源绑定：{cleanupInvalidData.data.totals.deletedMissingSourceBindings}</div>
                <div>失效暂停源：{cleanupInvalidData.data.totals.deletedInvalidMonitorRateExclusions}</div>
                <div>更新源名称：{cleanupInvalidData.data.totals.updatedSourceBindingNames}</div>
                <div>
                  禁用规则：{
                    cleanupInvalidData.data.totals.disabledGroupRules
                    + cleanupInvalidData.data.totals.disabledAccountRules
                    + cleanupInvalidData.data.totals.disabledUpstreamMonitorRules
                    + cleanupInvalidData.data.totals.disabledAnnouncementRules
                    + cleanupInvalidData.data.totals.disabledRulesWithoutSources
                  }
                </div>
                <div>停用自动同步：{cleanupInvalidData.data.totals.disabledAutoSyncConnections}</div>
              </div>
              {cleanupInvalidData.data.connections.some((item) => item.status === "connection_unavailable") ? (
                <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {cleanupInvalidData.data.connections
                    .filter((item) => item.status === "connection_unavailable")
                    .map((item) => (
                      <div key={item.connectionId} className="break-words [overflow-wrap:anywhere]" title={item.groupError || item.accountError || item.sourceError || item.message}>
                        {item.connectionName}：{item.groupError || item.accountError || item.sourceError || item.message}
                      </div>
                    ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">最近任务日志</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {data.recentLogs.items.length === 0 ? (
            <EmptyState title="暂无任务日志" description="最近的同步、检测或维护任务完成后会显示在这里。" className="m-3 lg:hidden" />
          ) : (
            <MobileRecordList className="p-3">
              {data.recentLogs.items.map((log) => (
                <MobileRecord key={log.id}>
                  <MobileRecordHeader>
                    <div className="min-w-0">
                      <MobileRecordTitle>{log.actionLabel || logActionLabel(log.action)}</MobileRecordTitle>
                      <MobileRecordMeta>{formatDateTime(log.createdAt)}</MobileRecordMeta>
                    </div>
                    <div className="shrink-0">{log.status === "success" ? statusBadge("ok", "成功") : statusBadge("bad", "失败")}</div>
                  </MobileRecordHeader>
                  <MobileRecordFields>
                    <MobileRecordField label="时间" value={formatDateTime(log.createdAt)} />
                    <MobileRecordField label="目标" value={<span className="break-all font-mono">{log.target || "-"}</span>} />
                    <MobileRecordField label="错误" value={<span className="break-words">{log.error || "-"}</span>} className="col-span-2" />
                  </MobileRecordFields>
                </MobileRecord>
              ))}
            </MobileRecordList>
          )}
          <div className="hidden lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">时间</TableHead>
                  <TableHead className="w-48">动作</TableHead>
                  <TableHead className="w-44">目标</TableHead>
                  <TableHead className="w-24">状态</TableHead>
                  <TableHead>错误</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentLogs.items.length === 0 ? (
                  <TableEmptyRow colSpan={5}>暂无日志</TableEmptyRow>
                ) : data.recentLogs.items.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs text-muted-foreground">{formatDateTime(log.createdAt)}</TableCell>
                    <TableCell className="text-xs" title={log.action}>{log.actionLabel || logActionLabel(log.action)}</TableCell>
                    <TableCell className="font-mono text-xs">{log.target || "-"}</TableCell>
                    <TableCell>{log.status === "success" ? statusBadge("ok", "成功") : statusBadge("bad", "失败")}</TableCell>
                    <TableCell className="max-w-[360px] whitespace-normal break-words text-sm leading-5 text-muted-foreground [overflow-wrap:anywhere]" title={log.error ?? ""}>{log.error || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={cleanupConfirmOpen}
        onOpenChange={setCleanupConfirmOpen}
        title={`清理${cleanupScope}无效数据`}
        description={`确认清理${cleanupScope}的无效绑定、倍率规则和监控规则？源站分组删除会移除对应来源绑定，源站分组改名会更新绑定名称；连接不可用时会禁用自动规则但保留绑定。`}
        confirmLabel="执行清理"
        pending={cleanupInvalidData.isPending}
        onConfirm={handleConfirmCleanupInvalidData}
      />
    </div>
  );
}
