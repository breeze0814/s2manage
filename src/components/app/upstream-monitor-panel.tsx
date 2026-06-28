"use client";

import { useMemo, useState } from "react";
import { Activity, Clock3, Loader2, PauseCircle, Play, RefreshCw, RotateCcw, Settings2, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import {
  MobileRecord,
  MobileRecordActions,
  MobileRecordEmpty,
  MobileRecordField,
  MobileRecordFields,
  MobileRecordHeader,
  MobileRecordList,
  MobileRecordMeta,
  MobileRecordSection,
  MobileRecordTitle,
} from "@/components/app/mobile-record";
import { PlatformIcon } from "@/components/app/platform-icon";

type MonitorResult = {
  status: string;
  message?: string | null;
  latencyMs?: number | null;
  model?: string | null;
  createdAt?: Date | string | null;
  startedAt?: Date | string | null;
  finishedAt?: Date | string | null;
};

type MonitorRule = {
  id: number;
  accountId: number;
  accountName?: string | null;
  enabled: boolean;
  checkIntervalMinutes: number;
  failureThreshold: number;
  pauseMinutes: number;
  modelId?: string | null;
  prompt?: string | null;
  consecutiveFailures: number;
  totalChecks: number;
  successChecks: number;
  lastStatus?: string | null;
  lastMessage?: string | null;
  lastLatencyMs?: number | null;
  lastCheckedAt?: Date | string | null;
  nextCheckAt?: Date | string | null;
  pausedUntil?: Date | string | null;
  results?: MonitorResult[];
};

type MonitorRow = {
  accountId: number;
  accountName: string;
  platform?: string | null;
  type?: string | null;
  status?: string | null;
  schedulable?: boolean | null;
  missing: boolean;
  rule: MonitorRule | null;
  stats: { windowSize: number; success: number; failed: number; uptimePercent: number | null };
  lastResult: MonitorResult | null;
};

type RuleForm = {
  enabled: boolean;
  checkIntervalMinutes: string;
  failureThreshold: string;
  pauseMinutes: string;
  modelId: string;
  prompt: string;
};

type AccountModel = {
  id: string;
  type?: string | null;
  display_name?: string | null;
  created_at?: string | null;
};

type RowAction = "toggle" | "run" | "resume" | "delete";

const defaultModelValue = "__sub2api_default__";
const uptimeWindowSize = 60;
const mobileUptimeWindowSize = 30;
const prioritizedGeminiModels = [
  "gemini-3.1-flash-image",
  "gemini-2.5-flash-image",
  "gemini-3.5-flash",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-3-flash-preview",
  "gemini-3-pro-preview",
  "gemini-2.0-flash",
];

function newRuleForm(row: MonitorRow): RuleForm {
  const rule = row.rule;
  return {
    enabled: rule?.enabled ?? true,
    checkIntervalMinutes: String(rule?.checkIntervalMinutes ?? 10),
    failureThreshold: String(rule?.failureThreshold ?? 3),
    pauseMinutes: String(rule?.pauseMinutes ?? 30),
    modelId: rule?.modelId ?? "",
    prompt: rule?.prompt ?? "",
  };
}

function parsePositiveInt(value: string, label: string, max: number) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > max) {
    throw new Error(`${label}必须是 1-${max} 的整数`);
  }
  return numeric;
}

function formatRelative(value: unknown) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime())) return "-";
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

function formatUptime(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(1)}%` : "-";
}

function statusBadge(status?: string | null) {
  if (status === "success") return <Badge variant="success">正常</Badge>;
  if (status === "failed") return <Badge variant="destructive">失败</Badge>;
  if (status === "resumed") return <Badge variant="secondary">已恢复</Badge>;
  if (status === "resume_failed") return <Badge variant="destructive">恢复失败</Badge>;
  return <Badge variant="outline">未检测</Badge>;
}

function monitorStatusLabel(status?: string | null) {
  if (status === "success") return "正常";
  if (status === "failed") return "失败";
  if (status === "resumed") return "已恢复";
  if (status === "resume_failed") return "恢复失败";
  return "无记录";
}

function timelineBarClass(status?: string | null) {
  if (status === "success") return "bg-emerald-500";
  if (status === "failed" || status === "resume_failed") return "bg-red-500";
  if (status === "resumed") return "bg-amber-500";
  return "bg-muted";
}

function resultDate(result: MonitorResult) {
  const value = result.createdAt ?? result.finishedAt ?? result.startedAt;
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date : null;
}

function resultTitle(result: MonitorResult) {
  const date = resultDate(result);
  return [
    monitorStatusLabel(result.status),
    date ? date.toLocaleString() : null,
    result.latencyMs ? `${result.latencyMs}ms` : null,
    result.model,
    result.message,
  ].filter(Boolean).join(" · ");
}

function UptimeTimeline({ row, compact = false }: { row: MonitorRow; compact?: boolean }) {
  const rule = row.rule;
  const windowSize = compact ? mobileUptimeWindowSize : uptimeWindowSize;
  const results = (rule?.results ?? []).slice(0, windowSize).reverse();
  const emptyCount = Math.max(0, windowSize - results.length);
  const nextLabel = rule ? (rule.enabled ? `下次 ${formatRelative(rule.nextCheckAt)}` : "已停用") : "未配置";

  return (
    <div className={compact ? "w-full min-w-0 space-y-1.5" : "w-[440px] min-w-[440px] space-y-1.5 xl:w-[480px]"}>
      <div className={compact ? "grid gap-0.5 text-[11px] font-medium text-muted-foreground" : "flex items-center justify-between gap-3 text-[11px] font-medium text-muted-foreground"}>
        <span>近 {windowSize} 次记录</span>
        <span className="truncate">{nextLabel}</span>
      </div>
      <div
        className={compact ? "grid gap-1" : "grid gap-[3px]"}
        style={{ gridTemplateColumns: `repeat(${windowSize}, minmax(${compact ? "0" : "4px"}, 1fr))` }}
        aria-label={`近 ${windowSize} 次上游检测记录`}
      >
        {Array.from({ length: emptyCount }).map((_, index) => (
          <span key={`empty-${index}`} className={compact ? "h-4 min-w-0 rounded-[2px] bg-muted/70" : "h-6 min-w-[4px] rounded-[3px] bg-muted/70"} title="暂无记录" />
        ))}
        {results.map((result, index) => (
          <span
            key={`${result.status}-${result.createdAt ?? result.finishedAt ?? index}-${index}`}
            className={`${compact ? "h-4 min-w-0 rounded-[2px]" : "h-6 min-w-[4px] rounded-[3px]"} ${timelineBarClass(result.status)}`}
            title={resultTitle(result)}
          />
        ))}
      </div>
      <div className="flex items-center justify-between text-[10px] font-medium uppercase tracking-normal text-muted-foreground/70">
        <span>PAST</span>
        <span>NOW</span>
      </div>
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="font-mono text-foreground">{formatUptime(row.stats.uptimePercent)}</span>
        <span className="truncate">{row.stats.success}/{row.stats.windowSize || 0} 通过</span>
      </div>
    </div>
  );
}

function isPaused(rule: MonitorRule | null) {
  if (!rule?.pausedUntil) return false;
  const date = rule.pausedUntil instanceof Date ? rule.pausedUntil : new Date(String(rule.pausedUntil));
  return Number.isFinite(date.getTime()) && date.getTime() > Date.now();
}

function getModelLabel(model: AccountModel) {
  const displayName = model.display_name?.trim();
  return displayName && displayName !== model.id ? `${displayName} (${model.id})` : model.id;
}

function sortedModels(models: AccountModel[], row: MonitorRow | null) {
  const uniqueModels = Array.from(new Map(models.filter((model) => model.id.trim()).map((model) => [model.id, model])).values());
  const platform = row?.platform?.toLowerCase();
  if (platform !== "gemini" && platform !== "antigravity") return uniqueModels;
  const priorityMap = new Map(prioritizedGeminiModels.map((id, index) => [id, index]));
  return [...uniqueModels].sort((a, b) => {
    const aPriority = priorityMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const bPriority = priorityMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    if (aPriority !== bPriority) return aPriority - bPriority;
    return a.id.localeCompare(b.id);
  });
}

function actionKey(accountId: number, action: RowAction) {
  return `${accountId}:${action}`;
}

export function UpstreamMonitorPanel({ connectionId }: { connectionId: number }) {
  const utils = trpc.useUtils();
  const { showToast } = useToast();
  const { data, error, isLoading, isFetching, refetch } = trpc.upstreamMonitor.list.useQuery({ connectionId });
  const upsertRule = trpc.upstreamMonitor.upsertRule.useMutation();
  const setEnabled = trpc.upstreamMonitor.setEnabled.useMutation();
  const deleteRule = trpc.upstreamMonitor.deleteRule.useMutation();
  const runNow = trpc.upstreamMonitor.runNow.useMutation();
  const resumeNow = trpc.upstreamMonitor.resumeNow.useMutation();

  const [editingRow, setEditingRow] = useState<MonitorRow | null>(null);
  const [form, setForm] = useState<RuleForm>(() => ({
    enabled: true,
    checkIntervalMinutes: "10",
    failureThreshold: "3",
    pauseMinutes: "30",
    modelId: "",
    prompt: "",
  }));
  const [formError, setFormError] = useState("");
  const [activeActionKeys, setActiveActionKeys] = useState<string[]>([]);
  const accountModels = trpc.accounts.models.useQuery(
    { connectionId, accountId: editingRow?.accountId ?? 0 },
    { enabled: Boolean(editingRow && !editingRow.missing) },
  );

  const rows = useMemo<MonitorRow[]>(() => (data?.rows ?? []) as MonitorRow[], [data]);
  const monitoredRows = rows.filter((row) => row.rule);
  const pausedCount = monitoredRows.filter((row) => isPaused(row.rule)).length;
  const failingCount = monitoredRows.filter((row) => row.rule?.lastStatus === "failed" || row.rule?.lastStatus === "resume_failed").length;
  const uptimeValues = monitoredRows.map((row) => row.stats.uptimePercent).filter((value): value is number => typeof value === "number");
  const averageUptime = uptimeValues.length > 0 ? uptimeValues.reduce((sum, value) => sum + value, 0) / uptimeValues.length : null;
  const activeActionSet = useMemo(() => new Set(activeActionKeys), [activeActionKeys]);
  const editorModels = useMemo(() => sortedModels((accountModels.data ?? []) as AccountModel[], editingRow), [accountModels.data, editingRow]);

  const invalidate = async () => {
    await Promise.all([
      utils.upstreamMonitor.list.invalidate({ connectionId }),
      utils.accounts.list.invalidate({ connectionId }),
      utils.sync.logs.invalidate(),
    ]);
  };

  const setActionPending = (row: MonitorRow, action: RowAction, pending: boolean) => {
    const key = actionKey(row.accountId, action);
    setActiveActionKeys((current) => {
      if (pending) return current.includes(key) ? current : [...current, key];
      return current.filter((item) => item !== key);
    });
  };

  const openEditor = (row: MonitorRow) => {
    setEditingRow(row);
    setForm(newRuleForm(row));
    setFormError("");
  };

  const closeEditor = () => {
    setEditingRow(null);
    setFormError("");
  };

  const handleSave = async () => {
    if (!editingRow) return;
    setFormError("");
    try {
      await upsertRule.mutateAsync({
        connectionId,
        accountId: editingRow.accountId,
        accountName: editingRow.accountName,
        enabled: form.enabled,
        checkIntervalMinutes: parsePositiveInt(form.checkIntervalMinutes, "检测间隔", 24 * 60),
        failureThreshold: parsePositiveInt(form.failureThreshold, "错误次数", 100),
        pauseMinutes: parsePositiveInt(form.pauseMinutes, "暂停分钟数", 7 * 24 * 60),
        modelId: form.modelId.trim() || undefined,
        prompt: form.prompt.trim() || undefined,
      });
      await invalidate();
      closeEditor();
      showToast({ title: "检测规则已保存", variant: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setFormError(message);
      showToast({ title: "保存检测规则失败", description: message, variant: "error" });
    }
  };

  const handleToggle = async (row: MonitorRow) => {
    if (!row.rule) return;
    setActionPending(row, "toggle", true);
    try {
      await setEnabled.mutateAsync({ connectionId, accountId: row.accountId, enabled: !row.rule.enabled });
      await invalidate();
      showToast({ title: row.rule.enabled ? "检测已停用" : "检测已启用", variant: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast({ title: "更新检测状态失败", description: message, variant: "error" });
    } finally {
      setActionPending(row, "toggle", false);
    }
  };

  const handleRunNow = async (row: MonitorRow) => {
    if (!row.rule) return;
    setActionPending(row, "run", true);
    try {
      const result = await runNow.mutateAsync({ connectionId, accountId: row.accountId });
      await invalidate();
      showToast({
        title: result.success ? "检测通过" : "检测失败",
        description: result.message,
        variant: result.success ? "success" : "error",
        durationMs: result.success ? 5000 : 9000,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast({ title: "检测失败", description: message, variant: "error", durationMs: 9000 });
    } finally {
      setActionPending(row, "run", false);
    }
  };

  const handleResume = async (row: MonitorRow) => {
    if (!row.rule) return;
    setActionPending(row, "resume", true);
    try {
      await resumeNow.mutateAsync({ connectionId, accountId: row.accountId });
      await invalidate();
      showToast({ title: "账号调度已恢复", variant: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast({ title: "恢复账号调度失败", description: message, variant: "error" });
    } finally {
      setActionPending(row, "resume", false);
    }
  };

  const handleDelete = async (row: MonitorRow) => {
    if (!row.rule) return;
    if (!confirm(`确定删除「${row.accountName}」的检测规则？`)) return;
    setActionPending(row, "delete", true);
    try {
      await deleteRule.mutateAsync({ connectionId, accountId: row.accountId });
      await invalidate();
      showToast({ title: "检测规则已删除", variant: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast({ title: "删除检测规则失败", description: message, variant: "error" });
    } finally {
      setActionPending(row, "delete", false);
    }
  };

  const handleRefresh = async () => {
    const result = await refetch();
    if (result.error) {
      showToast({ title: "刷新检测数据失败", description: result.error.message, variant: "error" });
      return;
    }
    showToast({ title: "检测数据已刷新", variant: "success" });
  };

  if (isLoading) {
    return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />加载中...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">上游源站检测</h2>
        <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={handleRefresh} disabled={isFetching}>
          {isFetching ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
          刷新
        </Button>
      </div>

      {error ? <p className="text-sm text-destructive">加载检测数据失败：{error.message}</p> : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="h-full">
          <CardHeader className="pb-1"><CardTitle className="text-sm text-muted-foreground">监测账号</CardTitle></CardHeader>
          <CardContent className="flex min-h-10 items-center"><p className="text-2xl font-semibold">{monitoredRows.length}</p></CardContent>
        </Card>
        <Card className="h-full">
          <CardHeader className="pb-1"><CardTitle className="text-sm text-muted-foreground">平均 Uptime</CardTitle></CardHeader>
          <CardContent className="flex min-h-10 items-center"><p className="text-2xl font-semibold">{formatUptime(averageUptime)}</p></CardContent>
        </Card>
        <Card className="h-full">
          <CardHeader className="pb-1"><CardTitle className="text-sm text-muted-foreground">暂停中</CardTitle></CardHeader>
          <CardContent className="flex min-h-10 items-center"><p className="text-2xl font-semibold">{pausedCount}</p></CardContent>
        </Card>
        <Card className="h-full">
          <CardHeader className="pb-1"><CardTitle className="text-sm text-muted-foreground">异常规则</CardTitle></CardHeader>
          <CardContent className="flex min-h-10 items-center"><p className="text-2xl font-semibold">{failingCount}</p></CardContent>
        </Card>
      </div>

      {rows.length === 0 ? (
        <MobileRecordEmpty>暂无账号</MobileRecordEmpty>
      ) : (
        <MobileRecordList>
          {rows.map((row) => {
            const rule = row.rule;
            const paused = isPaused(rule);
            const togglePending = activeActionSet.has(actionKey(row.accountId, "toggle"));
            const runPending = activeActionSet.has(actionKey(row.accountId, "run"));
            const resumePending = activeActionSet.has(actionKey(row.accountId, "resume"));
            const deletePending = activeActionSet.has(actionKey(row.accountId, "delete"));
            const rowPending = togglePending || runPending || resumePending || deletePending;
            return (
              <MobileRecord key={`${row.accountId}-${row.missing ? "missing" : "account"}`}>
                <MobileRecordHeader>
                  <div className="min-w-0">
                    <MobileRecordTitle className="flex min-w-0 items-center gap-2">
                      <PlatformIcon platform={row.platform} />
                      <span className="truncate">{row.accountName}</span>
                    </MobileRecordTitle>
                    <MobileRecordMeta>#{row.accountId}{row.missing ? " / 已从源站移除" : ""}</MobileRecordMeta>
                  </div>
                  {row.schedulable === false ? <Badge variant="secondary">未调度</Badge> : <Badge variant="success">可调度</Badge>}
                </MobileRecordHeader>
                <MobileRecordFields>
                  <MobileRecordField label="类型" value={<span className="line-clamp-2">{[row.platform, row.type].filter(Boolean).join(" / ") || "-"}</span>} />
                  <MobileRecordField label="规则" value={rule ? (rule.enabled ? <Badge variant="default">启用</Badge> : <Badge variant="secondary">停用</Badge>) : <Badge variant="outline">未配置</Badge>} />
                  <MobileRecordField className="col-span-2" label="最近检测" value={
                    <div className="space-y-1">
                      <div>{statusBadge(rule?.lastStatus)}</div>
                      <div className="line-clamp-2 text-xs text-muted-foreground">{rule?.lastMessage || "-"}</div>
                      <div className="text-xs text-muted-foreground">{formatRelative(rule?.lastCheckedAt)}{rule?.lastLatencyMs ? ` / ${rule.lastLatencyMs}ms` : ""}</div>
                    </div>
                  } />
                </MobileRecordFields>
                <MobileRecordSection>
                  {rule ? (
                    <UptimeTimeline row={row} compact />
                  ) : (
                    <div className="text-xs text-muted-foreground">配置规则后显示近 {mobileUptimeWindowSize} 次记录</div>
                  )}
                </MobileRecordSection>
                <MobileRecordSection>
                  {rule ? (
                    <div className="grid gap-1 text-xs text-muted-foreground">
                      <span>每 {rule.checkIntervalMinutes} 分钟；错 {rule.failureThreshold} 次停 {rule.pauseMinutes} 分钟</span>
                      <span>{paused ? `暂停至 ${formatRelative(rule.pausedUntil)}` : `下次 ${formatRelative(rule.nextCheckAt)}`}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">尚未配置检测规则</span>
                  )}
                </MobileRecordSection>
                <MobileRecordActions>
                  <Button variant="outline" size="icon" className="h-8 w-8" title={rule ? "编辑规则" : "配置规则"} onClick={() => openEditor(row)} disabled={rowPending}>
                    <Settings2 className="h-4 w-4" />
                  </Button>
                  {rule ? (
                    <>
                      <Button variant="outline" size="icon" className="h-8 w-8" title={rule.enabled ? "停用检测" : "启用检测"} onClick={() => handleToggle(row)} disabled={rowPending}>
                        {togglePending ? <Loader2 className="h-4 w-4 animate-spin" /> : rule.enabled ? <PauseCircle className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </Button>
                      <Button variant="outline" size="icon" className="h-8 w-8" title="立即检测" onClick={() => handleRunNow(row)} disabled={rowPending}>
                        {runPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4 text-blue-500" />}
                      </Button>
                      {paused ? (
                        <Button variant="outline" size="icon" className="h-8 w-8" title="立即恢复调度" onClick={() => handleResume(row)} disabled={rowPending}>
                          {resumePending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4 text-emerald-600" />}
                        </Button>
                      ) : null}
                      <Button variant="outline" size="icon" className="h-8 w-8 text-destructive" title="删除规则" onClick={() => handleDelete(row)} disabled={rowPending}>
                        {deletePending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </Button>
                    </>
                  ) : null}
                </MobileRecordActions>
              </MobileRecord>
            );
          })}
        </MobileRecordList>
      )}

      <div className="hidden md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>账号</TableHead>
            <TableHead>类型</TableHead>
            <TableHead>调度</TableHead>
            <TableHead>规则</TableHead>
            <TableHead className="min-w-[460px]">Uptime</TableHead>
            <TableHead>最近检测</TableHead>
            <TableHead>暂停</TableHead>
            <TableHead className="w-56">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">暂无账号</TableCell></TableRow>
          ) : (
            rows.map((row) => {
              const rule = row.rule;
              const paused = isPaused(rule);
              const togglePending = activeActionSet.has(actionKey(row.accountId, "toggle"));
              const runPending = activeActionSet.has(actionKey(row.accountId, "run"));
              const resumePending = activeActionSet.has(actionKey(row.accountId, "resume"));
              const deletePending = activeActionSet.has(actionKey(row.accountId, "delete"));
              const rowPending = togglePending || runPending || resumePending || deletePending;
              return (
                <TableRow key={`${row.accountId}-${row.missing ? "missing" : "account"}`}>
                  <TableCell>
                    <div className="flex min-w-0 items-center gap-2 font-medium">
                      <PlatformIcon platform={row.platform} />
                      <span className="truncate">{row.accountName}</span>
                    </div>
                    <div className="font-mono text-xs text-muted-foreground">#{row.accountId}{row.missing ? " / 已从源站移除" : ""}</div>
                  </TableCell>
                  <TableCell>{[row.platform, row.type].filter(Boolean).join(" / ") || "-"}</TableCell>
                  <TableCell>{row.schedulable === false ? <Badge variant="secondary">未调度</Badge> : <Badge variant="success">可调度</Badge>}</TableCell>
                  <TableCell>
                    {rule ? (
                      <div className="space-y-1">
                        <div>{rule.enabled ? <Badge variant="default">启用</Badge> : <Badge variant="secondary">停用</Badge>}</div>
                        <div className="text-xs text-muted-foreground">
                          每 {rule.checkIntervalMinutes} 分钟；错 {rule.failureThreshold} 次停 {rule.pauseMinutes} 分钟
                        </div>
                      </div>
                    ) : (
                      <Badge variant="outline">未配置</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {rule ? (
                      <UptimeTimeline row={row} />
                    ) : (
                      <div className="text-xs text-muted-foreground">配置规则后显示近 {uptimeWindowSize} 次记录</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">{statusBadge(rule?.lastStatus)}</div>
                    <div className="mt-1 max-w-[220px] truncate text-xs text-muted-foreground" title={rule?.lastMessage ?? ""}>{rule?.lastMessage || "-"}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatRelative(rule?.lastCheckedAt)}{rule?.lastLatencyMs ? ` / ${rule.lastLatencyMs}ms` : ""}
                    </div>
                  </TableCell>
                  <TableCell>
                    {paused ? (
                      <div className="space-y-1">
                        <Badge variant="warning">暂停中</Badge>
                        <div className="text-xs text-muted-foreground">{formatRelative(rule?.pausedUntil)}</div>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">下次 {formatRelative(rule?.nextCheckAt)}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" title={rule ? "编辑规则" : "配置规则"} onClick={() => openEditor(row)} disabled={rowPending}>
                        <Settings2 className="h-4 w-4" />
                      </Button>
                      {rule ? (
                        <>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title={rule.enabled ? "停用检测" : "启用检测"} onClick={() => handleToggle(row)} disabled={rowPending}>
                            {togglePending ? <Loader2 className="h-4 w-4 animate-spin" /> : rule.enabled ? <PauseCircle className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="立即检测" onClick={() => handleRunNow(row)} disabled={rowPending}>
                            {runPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4 text-blue-500" />}
                          </Button>
                          {paused ? (
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="立即恢复调度" onClick={() => handleResume(row)} disabled={rowPending}>
                              {resumePending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4 text-emerald-600" />}
                            </Button>
                          ) : null}
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="删除规则" onClick={() => handleDelete(row)} disabled={rowPending}>
                            {deletePending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
      </div>

      <Dialog open={!!editingRow} onOpenChange={(open) => { if (!open) closeEditor(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingRow?.rule ? "编辑检测规则" : "新增检测规则"}</DialogTitle>
          </DialogHeader>
          {editingRow ? (
            <div className="space-y-4">
              <div className="rounded-md border border-border/70 px-3 py-2 text-sm">
                <div className="font-medium">{editingRow.accountName}</div>
                <div className="text-xs text-muted-foreground">#{editingRow.accountId} {editingRow.platform ? `/ ${editingRow.platform}` : ""}</div>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2">
                <Label htmlFor="monitor-enabled">启用检测</Label>
                <Switch id="monitor-enabled" checked={form.enabled} onCheckedChange={(checked) => setForm((current) => ({ ...current, enabled: checked }))} />
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>检测间隔分钟</Label>
                  <Input type="number" min="1" step="1" value={form.checkIntervalMinutes} onChange={(e) => setForm((current) => ({ ...current, checkIntervalMinutes: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>连续错误次数</Label>
                  <Input type="number" min="1" step="1" value={form.failureThreshold} onChange={(e) => setForm((current) => ({ ...current, failureThreshold: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>暂停调度分钟</Label>
                  <Input type="number" min="1" step="1" value={form.pauseMinutes} onChange={(e) => setForm((current) => ({ ...current, pauseMinutes: e.target.value }))} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>测试模型</Label>
                {editorModels.length > 0 ? (
                  <Select
                    value={form.modelId.trim() || defaultModelValue}
                    onValueChange={(value) => setForm((current) => ({
                      ...current,
                      modelId: value === defaultModelValue ? "" : value,
                    }))}
                    disabled={upsertRule.isPending || accountModels.isLoading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择测试模型" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={defaultModelValue}>Sub2API 默认测试模型</SelectItem>
                      {editorModels.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          {getModelLabel(model)}
                        </SelectItem>
                      ))}
                      {form.modelId.trim() && !editorModels.some((model) => model.id === form.modelId.trim()) ? (
                        <SelectItem value={form.modelId.trim()}>{form.modelId.trim()}</SelectItem>
                      ) : null}
                    </SelectContent>
                  </Select>
                ) : null}
                <Input
                  value={form.modelId}
                  onChange={(e) => setForm((current) => ({ ...current, modelId: e.target.value }))}
                  placeholder={accountModels.isLoading ? "正在加载模型" : "留空使用 Sub2API 默认测试模型"}
                  disabled={upsertRule.isPending || accountModels.isLoading}
                />
                {accountModels.error ? <p className="text-sm text-destructive">加载模型失败：{accountModels.error.message}</p> : null}
              </div>

              <div className="space-y-2">
                <Label>测试 Prompt</Label>
                <Textarea value={form.prompt} onChange={(e) => setForm((current) => ({ ...current, prompt: e.target.value }))} rows={3} placeholder="留空使用 Sub2API 默认测试内容" />
              </div>

              {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={closeEditor} disabled={upsertRule.isPending}>取消</Button>
            <Button onClick={handleSave} disabled={!editingRow || upsertRule.isPending}>
              {upsertRule.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock3 className="h-4 w-4" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
