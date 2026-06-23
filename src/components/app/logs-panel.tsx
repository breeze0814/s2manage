"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw, Save, Search, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { logActionLabel } from "@/lib/log-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import {
  MobileRecord,
  MobileRecordEmpty,
  MobileRecordField,
  MobileRecordFields,
  MobileRecordHeader,
  MobileRecordList,
  MobileRecordMeta,
  MobileRecordSection,
  MobileRecordTitle,
} from "@/components/app/mobile-record";

type LogLevel = "info" | "warning" | "error";
type LogStatus = "success" | "failed";

const levelOptions: Array<{ value: LogLevel; label: string }> = [
  { value: "info", label: "信息" },
  { value: "warning", label: "警告" },
  { value: "error", label: "错误" },
];

const SEARCH_DEBOUNCE_MS = 350;

function formatDateTime(value: unknown) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toLocaleString("zh-CN", { hour12: false }) : "-";
}

function levelBadge(level?: string | null) {
  if (level === "error") return <Badge variant="destructive">错误</Badge>;
  if (level === "warning") return <Badge variant="warning">警告</Badge>;
  return <Badge variant="secondary">信息</Badge>;
}

function statusBadge(status?: string | null) {
  return status === "failed"
    ? <Badge variant="destructive">失败</Badge>
    : <Badge variant="success">成功</Badge>;
}

function compactJson(value?: string | null) {
  if (!value) return "-";
  try {
    const parsed = JSON.parse(value) as unknown;
    return JSON.stringify(parsed);
  } catch {
    return value;
  }
}

type DisplayLog = {
  action?: string | null;
  actionLabel?: string | null;
  target?: string | null;
  detail?: string | null;
  error?: string | null;
  status?: string | null;
};

function parseDetail(value?: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function stringField(record: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!record) return "";
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function numberField(record: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function booleanField(record: Record<string, unknown> | null | undefined, key: string) {
  return record?.[key] === true ? true : record?.[key] === false ? false : null;
}

function formatNumber(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 1) return value.toFixed(3).replace(/\.?0+$/, "");
  return value.toFixed(4).replace(/\.?0+$/, "");
}

function reasonLabel(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return "";
  const labels: Record<string, string> = {
    scheduled: "定时检测",
    manual: "手动触发",
    monitor_recovered: "检测恢复",
    "target group missing": "目标分组不存在",
    "target account missing": "目标账号不存在",
    "source group changed": "采集源分组已变化",
    connection_unavailable: "连接不可用",
  };
  return labels[value] ?? value;
}

function statusLabel(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return "";
  const labels: Record<string, string> = {
    success: "成功",
    failed: "失败",
    error: "错误",
    invalid: "无效",
    unsupported: "不支持",
    paused: "已暂停",
    resumed: "已恢复",
    resume_failed: "恢复失败",
  };
  return labels[value] ?? value;
}

function ruleModeLabel(value: unknown) {
  const labels: Record<string, string> = {
    first: "首个源倍率",
    average: "平均源倍率",
    min: "最低源倍率",
    max: "最高源倍率",
    custom: "自定义公式",
  };
  return typeof value === "string" ? labels[value] ?? value : "";
}

function humanError(error?: string | null) {
  if (!error) return "";
  if (error.includes("No target group found for bound BL rule")) {
    return "目标分组不存在：该倍率规则绑定的目标分组已被删除或重建。系统已清理本地无效绑定和规则；如需继续同步，请重新绑定目标分组。";
  }
  if (error.includes("No target account found for bound BL rule")) {
    return "目标账号不存在：该倍率规则绑定的账号已被删除或重建。系统已清理本地无效绑定和规则；如需继续同步，请重新绑定目标账号。";
  }
  if (error === "connection disabled") return "连接已停用，任务已跳过。";
  if (error === "connection not found") return "连接不存在，任务无法执行。";
  return error;
}

function sourceLabels(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const source = item as Record<string, unknown>;
    const siteName = stringField(source, ["sourceSiteName", "siteName"]) || "采集源";
    const groupName = stringField(source, ["sourceGroupName", "groupName"]);
    const rate = numberField(source, ["currentRate", "rateMultiplier", "rawRate"]);
    const label = groupName ? `${siteName} / ${groupName}` : siteName;
    return rate === null ? label : `${label}（倍率 ${formatNumber(rate)}）`;
  });
}

function balanceIssueLabels(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const issue = item as Record<string, unknown>;
    const accountId = numberField(issue, ["accountId"]);
    const status = statusLabel(issue.status) || String(issue.status ?? "");
    const message = stringField(issue, ["message"]);
    const prefix = accountId === null ? "账号" : `账号 ${accountId}`;
    return `${prefix}：${[status, message].filter(Boolean).join(" / ")}`;
  });
}

function targetLabel(log: DisplayLog) {
  const detail = parseDetail(log.detail);
  const target = log.target ?? "";
  const groupName = stringField(detail, ["targetGroupName", "groupName", "name"]);
  const accountName = stringField(detail, ["targetAccountName", "accountName", "name", "username"]);
  const connectionName = stringField(detail, ["connectionName", "name"]);
  const title = stringField(detail, ["title", "ruleName"]);

  if (target.startsWith("group:")) {
    if (target === "group:new") return "新建分组";
    if (groupName) return `分组：${groupName}`;
    if (log.error?.includes("No target group") || detail?.reason === "target group missing") return "已删除的分组";
    return "分组";
  }

  if (target.startsWith("account:")) {
    if (target === "account:new") return "新建账号";
    if (accountName) return `账号：${accountName}`;
    if (log.error?.includes("No target account") || detail?.reason === "target account missing") return "已删除的账号";
    return "账号";
  }

  if (target.startsWith("connection:")) return connectionName ? `连接：${connectionName}` : "连接";
  if (target.startsWith("rule:")) return title ? `规则：${title}` : "规则";
  if (target.startsWith("id:")) return title ? `公告：${title}` : "记录";
  if (log.action?.includes("account") || log.action === "upstream_monitor_check") return accountName ? `账号：${accountName}` : "账号";
  if (log.action?.includes("group")) return groupName ? `分组：${groupName}` : "分组";
  return target ? target.replace(":", "：") : "-";
}

function detailLines(log: DisplayLog) {
  const detail = parseDetail(log.detail);
  const lines: string[] = [];
  const error = humanError(log.error);
  if (error) lines.push(`错误说明：${error}`);

  if (log.action === "upstream_monitor_check") {
    const status = statusLabel(detail?.status);
    const model = stringField(detail, ["model"]);
    const latencyMs = numberField(detail, ["latencyMs"]);
    const consecutiveFailures = numberField(detail, ["consecutiveFailures"]);
    const reason = reasonLabel(detail?.reason);
    const pauseApplied = booleanField(detail, "pauseApplied");
    const resumeApplied = booleanField(detail, "resumeApplied");
    if (status) lines.push(`检测结果：${status}`);
    if (model) lines.push(`模型：${model}`);
    if (latencyMs !== null) lines.push(`耗时：${Math.round(latencyMs)} ms`);
    if (consecutiveFailures !== null) lines.push(`连续失败次数：${consecutiveFailures}`);
    if (reason) lines.push(`触发方式：${reason}`);
    if (pauseApplied === true) lines.push("处理结果：已暂停该账号调度");
    if (resumeApplied === true) lines.push("处理结果：已恢复该账号调度");
    return lines.length > 0 ? lines : ["检测详情暂无补充信息"];
  }

  if (log.action === "auto_account_balance_webhook_alert" || log.action === "manual_account_balance_webhook_alert") {
    const checked = numberField(detail, ["checked"]);
    const low = numberField(detail, ["low"]);
    const sent = numberField(detail, ["sent"]);
    const failed = numberField(detail, ["failed"]);
    const skippedCooldown = numberField(detail, ["skippedCooldown"]);
    const queried = numberField(detail, ["queried"]);
    const issues = balanceIssueLabels(detail?.balanceIssues);
    const summary = [
      checked === null ? "" : `检查 ${checked} 个阈值`,
      queried === null ? "" : `查询 ${queried} 个账号`,
      low === null ? "" : `低余额 ${low} 个`,
      sent === null ? "" : `发送 ${sent} 条`,
      failed === null ? "" : `失败 ${failed} 条`,
      skippedCooldown ? `冷却跳过 ${skippedCooldown} 个` : "",
    ].filter(Boolean).join("，");
    if (summary) lines.push(summary);
    if (issues.length > 0) {
      lines.push(`余额查询问题：${issues.slice(0, 4).join("；")}${issues.length > 4 ? `；另有 ${issues.length - 4} 个` : ""}`);
    }
    return lines.length > 0 ? lines : ["余额预警已检查，暂无补充信息"];
  }

  if (detail) {
    const status = statusLabel(detail.status);
    const reason = reasonLabel(detail.reason);
    const fields = Array.isArray(detail.fields) ? detail.fields.map(String).join("、") : "";
    const rule = detail.rule && typeof detail.rule === "object" && !Array.isArray(detail.rule) ? detail.rule as Record<string, unknown> : null;
    const sources = sourceLabels(detail.sources);
    const currentRate = numberField(detail, ["currentRate", "oldRate"]);
    const newRate = numberField(detail, ["rateMultiplier", "newRate"]);
    const enabled = booleanField(detail, "enabled");
    const schedulable = booleanField(detail, "schedulable");
    const skipped = booleanField(detail, "skipped");
    const deletedBinding = booleanField(detail, "deletedInvalidBinding");
    const deletedRule = booleanField(detail, "deletedInvalidRule");

    if (status) lines.push(`状态：${status}`);
    if (reason) lines.push(`原因：${reason}`);
    if (fields) lines.push(`更新字段：${fields}`);
    if (rule) {
      const mode = ruleModeLabel(rule.mode);
      const expression = stringField(rule, ["expression"]);
      const offset = numberField(rule, ["offset"]);
      const parts = [mode, expression ? `公式 ${expression}` : "", offset ? `偏移 ${formatNumber(offset)}` : ""].filter(Boolean);
      if (parts.length > 0) lines.push(`倍率规则：${parts.join("，")}`);
    }
    if (currentRate !== null && newRate !== null) lines.push(`倍率变化：${formatNumber(currentRate)} → ${formatNumber(newRate)}`);
    else if (newRate !== null) lines.push(`目标倍率：${formatNumber(newRate)}`);
    if (enabled !== null) lines.push(`开关状态：${enabled ? "启用" : "停用"}`);
    if (schedulable !== null) lines.push(`调度状态：${schedulable ? "启用" : "停用"}`);
    if (skipped === true) lines.push("处理结果：已跳过，当前状态无需变更");
    if (deletedBinding || deletedRule) {
      const cleaned = [
        deletedBinding ? "采集源绑定" : "",
        deletedRule ? "倍率规则" : "",
      ].filter(Boolean).join("、");
      lines.push(`清理结果：已移除无效${cleaned}`);
    }
    if (sources.length > 0) lines.push(`采集源：${sources.slice(0, 3).join("；")}${sources.length > 3 ? `；另有 ${sources.length - 3} 个` : ""}`);
  }

  if (lines.length > 0) return lines;
  const fallback = compactJson(log.detail);
  return fallback === "-" ? ["暂无详情"] : [`详情：${fallback}`];
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debounced;
}

function csvToLevels(value: string): LogLevel[] | undefined {
  if (value === "__all__") return undefined;
  return [value as LogLevel];
}

function csvToStatuses(value: string): LogStatus[] | undefined {
  if (value === "__all__") return undefined;
  return [value as LogStatus];
}

export function LogsPanel() {
  const utils = trpc.useUtils();
  const { showToast } = useToast();
  const { data: connections } = trpc.connections.list.useQuery();
  const { data: settings, isLoading: settingsLoading, error: settingsQueryError } = trpc.sync.logSettings.useQuery();

  const [enabled, setEnabled] = useState(true);
  const [retentionDays, setRetentionDays] = useState("30");
  const [minLevel, setMinLevel] = useState<LogLevel>("info");
  const [settingsError, setSettingsError] = useState("");
  const [connectionFilter, setConnectionFilter] = useState("__all__");
  const [levelFilter, setLevelFilter] = useState("__all__");
  const [statusFilter, setStatusFilter] = useState("__all__");
  const [actionFilter, setActionFilter] = useState("");
  const [targetFilter, setTargetFilter] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [limit, setLimit] = useState("100");
  const debouncedActionFilter = useDebouncedValue(actionFilter, SEARCH_DEBOUNCE_MS);
  const debouncedTargetFilter = useDebouncedValue(targetFilter, SEARCH_DEBOUNCE_MS);
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const debouncedDateFrom = useDebouncedValue(dateFrom, SEARCH_DEBOUNCE_MS);
  const debouncedDateTo = useDebouncedValue(dateTo, SEARCH_DEBOUNCE_MS);

  useEffect(() => {
    if (!settings) return;
    setEnabled(settings.enabled);
    setRetentionDays(String(settings.retentionDays));
    setMinLevel(settings.minLevel as LogLevel);
  }, [settings]);

  const parsedConnectionId = connectionFilter === "__all__" ? undefined : Number(connectionFilter);
  const parsedLimit = Math.min(Math.max(Number(limit) || 100, 20), 500);
  const queryInput = useMemo(() => ({
    connectionId: parsedConnectionId,
    limit: parsedLimit,
    levels: csvToLevels(levelFilter),
    statuses: csvToStatuses(statusFilter),
    action: debouncedActionFilter.trim() || undefined,
    target: debouncedTargetFilter.trim() || undefined,
    search: debouncedSearch.trim() || undefined,
    dateFrom: debouncedDateFrom || undefined,
    dateTo: debouncedDateTo || undefined,
  }), [debouncedActionFilter, debouncedDateFrom, debouncedDateTo, levelFilter, parsedConnectionId, parsedLimit, debouncedSearch, statusFilter, debouncedTargetFilter]);

  const logsQuery = trpc.sync.logs.useInfiniteQuery(queryInput, {
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const saveSettings = trpc.sync.saveLogSettings.useMutation({
    onSuccess: async (result) => {
      await Promise.all([
        utils.sync.logSettings.invalidate(),
        utils.sync.logs.invalidate(),
        utils.serviceStatus.overview.invalidate(),
      ]);
      setSettingsError("");
      setEnabled(result.settings.enabled);
      setRetentionDays(String(result.settings.retentionDays));
      setMinLevel(result.settings.minLevel as LogLevel);
      showToast({ title: "日志设置已保存", variant: "success" });
    },
    onError: (error) => {
      setSettingsError(error.message);
      showToast({ title: "保存日志设置失败", description: error.message, variant: "error" });
    },
  });

  const cleanupLogs = trpc.sync.cleanupLogs.useMutation({
    onSuccess: async (result) => {
      await Promise.all([utils.sync.logs.invalidate(), utils.serviceStatus.overview.invalidate()]);
      showToast({ title: `已清理 ${result.deleted} 个过期日志文件`, variant: "success" });
    },
    onError: (error) => showToast({ title: "清理日志失败", description: error.message, variant: "error" }),
  });

  const clearLogs = trpc.sync.clearLogs.useMutation({
    onSuccess: async (result, variables) => {
      await Promise.all([utils.sync.logs.invalidate(), utils.serviceStatus.overview.invalidate()]);
      const unit = variables?.connectionId ? "条日志" : "个日志文件";
      showToast({ title: `已删除 ${result.deleted} ${unit}`, variant: "success" });
    },
    onError: (error) => showToast({ title: "清空日志失败", description: error.message, variant: "error" }),
  });

  const handleSaveSettings = () => {
    setSettingsError("");
    if (!settingsReady) {
      setSettingsError("日志设置尚未加载成功，请刷新后再保存");
      return;
    }
    const days = Number(retentionDays);
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      setSettingsError("保存天数必须是 1-3650 的整数");
      return;
    }
    saveSettings.mutate({ enabled, retentionDays: days, minLevel });
  };

  const resetFilters = () => {
    setConnectionFilter("__all__");
    setLevelFilter("__all__");
    setStatusFilter("__all__");
    setActionFilter("");
    setTargetFilter("");
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setLimit("100");
  };

  const logs = useMemo(() => logsQuery.data?.pages.flatMap((page) => page.logs) ?? [], [logsQuery.data]);
  const scannedTotal = logsQuery.data?.pages[0]?.total ?? 0;
  const isBusy = saveSettings.isPending || cleanupLogs.isPending || clearLogs.isPending;
  const settingsReady = Boolean(settings) && !settingsQueryError;
  const settingsControlsDisabled = isBusy || !settingsReady;

  if (settingsLoading) {
    return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />加载中...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">日志管理</h2>
          <p className="text-sm text-muted-foreground">查看任务日志，控制记录开关、记录级别和日志保留时间。</p>
        </div>
        <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={() => logsQuery.refetch()} disabled={logsQuery.isFetching}>
          {logsQuery.isFetching ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
          刷新
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">日志设置</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[1fr_180px_180px_auto_auto]">
          <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2">
            <div className="min-w-0">
              <Label htmlFor="logs-enabled">日志开关</Label>
              <p className="text-xs text-muted-foreground">关闭后不再写入新的任务日志，已有日志不受影响。</p>
            </div>
            <Switch id="logs-enabled" checked={enabled} onCheckedChange={setEnabled} disabled={settingsControlsDisabled} />
          </div>
          <div className="space-y-2">
            <Label>保存天数</Label>
            <Input type="number" min="1" max="3650" step="1" value={retentionDays} onChange={(event) => setRetentionDays(event.target.value)} disabled={settingsControlsDisabled} />
          </div>
          <div className="space-y-2">
            <Label>记录级别</Label>
            <Select value={minLevel} onValueChange={(value) => setMinLevel(value as LogLevel)} disabled={settingsControlsDisabled}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {levelOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button className="w-full sm:w-auto" onClick={handleSaveSettings} disabled={settingsControlsDisabled}>
              {saveSettings.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              保存设置
            </Button>
          </div>
          <div className="flex items-end">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => cleanupLogs.mutate({ retentionDays: Number(retentionDays) || undefined })} disabled={settingsControlsDisabled}>
              <Trash2 className="h-4 w-4" />
              清理过期
            </Button>
          </div>
          {settingsQueryError ? <p className="text-sm text-destructive lg:col-span-5">加载日志设置失败：{settingsQueryError.message}</p> : null}
          {settingsError ? <p className="text-sm text-destructive lg:col-span-5">{settingsError}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">筛选与搜索</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 lg:grid-cols-4">
            <div className="space-y-2">
              <Label>连接</Label>
              <Select value={connectionFilter} onValueChange={setConnectionFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">全部连接</SelectItem>
                  {(connections ?? []).map((connection) => (
                    <SelectItem key={connection.id} value={String(connection.id)}>{connection.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>级别</Label>
              <Select value={levelFilter} onValueChange={setLevelFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">全部级别</SelectItem>
                  {levelOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>状态</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">全部状态</SelectItem>
                  <SelectItem value="success">成功</SelectItem>
                  <SelectItem value="failed">失败</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>显示条数</Label>
              <Input type="number" min="20" max="500" step="10" value={limit} onChange={(event) => setLimit(event.target.value)} />
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-4">
            <div className="space-y-2">
              <Label>动作</Label>
              <Input value={actionFilter} onChange={(event) => setActionFilter(event.target.value)} placeholder="auto_bl_sync..." />
            </div>
            <div className="space-y-2">
              <Label>目标</Label>
              <Input value={targetFilter} onChange={(event) => setTargetFilter(event.target.value)} placeholder="分组名称、账号名称或连接名称" />
            </div>
            <div className="space-y-2">
              <Label>开始时间</Label>
              <Input type="datetime-local" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>结束时间</Label>
              <Input type="datetime-local" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索动作、目标、详情或错误" className="pl-9" />
            </div>
            <Button variant="outline" className="w-full sm:w-auto" onClick={resetFilters}>重置筛选</Button>
            <Button
              variant="destructive"
              className="w-full sm:w-auto"
              onClick={() => {
                const label = parsedConnectionId ? "当前连接" : "全部";
                if (!confirm(`确定清空${label}日志？`)) return;
                clearLogs.mutate({ connectionId: parsedConnectionId });
              }}
              disabled={clearLogs.isPending}
            >
              {clearLogs.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              清空日志
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">日志列表</CardTitle>
          <span className="text-sm text-muted-foreground">当前显示 {logs.length} 条 / 扫描匹配 {scannedTotal} 条</span>
        </CardHeader>
        <CardContent className="p-3 md:p-0">
          {logsQuery.isLoading ? (
            <MobileRecordEmpty><Loader2 className="mr-1 inline h-4 w-4 animate-spin" />加载中...</MobileRecordEmpty>
          ) : logs.length === 0 ? (
            <MobileRecordEmpty>暂无日志</MobileRecordEmpty>
          ) : (
            <MobileRecordList>
              {logs.map((log) => {
                const lines = detailLines(log);
                return (
                  <MobileRecord key={log.id}>
                    <MobileRecordHeader>
                      <div className="min-w-0">
                        <MobileRecordTitle className="truncate">{log.actionLabel || logActionLabel(log.action)}</MobileRecordTitle>
                        <MobileRecordMeta>{formatDateTime(log.createdAt)}</MobileRecordMeta>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {levelBadge(log.level)}
                        {statusBadge(log.status)}
                      </div>
                    </MobileRecordHeader>
                    <MobileRecordFields>
                      <MobileRecordField className="col-span-2" label="目标" value={<span className="line-clamp-2">{targetLabel(log)}</span>} />
                    </MobileRecordFields>
                    <MobileRecordSection className={log.error ? "text-destructive" : "text-muted-foreground"}>
                      {log.error ? (
                        <div className="flex min-w-0 items-start gap-2 text-sm">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                          <span className="line-clamp-3">{lines[0]}</span>
                        </div>
                      ) : (
                        <div className="line-clamp-3 text-sm">{lines[0]}</div>
                      )}
                      {lines.length > 1 ? (
                        <div className="mt-1 line-clamp-3 text-xs opacity-85">{lines.slice(1).join("；")}</div>
                      ) : null}
                    </MobileRecordSection>
                  </MobileRecord>
                );
              })}
            </MobileRecordList>
          )}
          <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">时间</TableHead>
                <TableHead className="w-24">级别</TableHead>
                <TableHead className="w-24">状态</TableHead>
                <TableHead className="w-48">动作</TableHead>
                <TableHead className="w-44">目标</TableHead>
                <TableHead>详情 / 错误</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logsQuery.isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" />加载中...</TableCell></TableRow>
              ) : logs.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">暂无日志</TableCell></TableRow>
              ) : logs.map((log) => {
                const lines = detailLines(log);
                const title = lines.join("\n");
                return (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs text-muted-foreground">{formatDateTime(log.createdAt)}</TableCell>
                    <TableCell>{levelBadge(log.level)}</TableCell>
                    <TableCell>{statusBadge(log.status)}</TableCell>
                    <TableCell className="text-xs" title={log.action}>{log.actionLabel || logActionLabel(log.action)}</TableCell>
                    <TableCell className="max-w-[180px] truncate text-sm" title={targetLabel(log)}>{targetLabel(log)}</TableCell>
                    <TableCell className="max-w-[640px]">
                      <div className={`min-w-0 space-y-1 text-sm ${log.error ? "text-destructive" : "text-muted-foreground"}`} title={title}>
                        {log.error ? (
                          <div className="flex min-w-0 items-start gap-2">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                            <span className="truncate">{lines[0]}</span>
                          </div>
                        ) : (
                          <span className="block truncate">{lines[0]}</span>
                        )}
                        {lines.length > 1 ? (
                          <div className="truncate text-xs opacity-85">{lines.slice(1).join("；")}</div>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>
          {logsQuery.hasNextPage ? (
            <div className="border-t border-border/70 p-3 text-center">
              <Button variant="outline" size="sm" onClick={() => logsQuery.fetchNextPage()} disabled={logsQuery.isFetchingNextPage}>
                {logsQuery.isFetchingNextPage ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                加载更多
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
