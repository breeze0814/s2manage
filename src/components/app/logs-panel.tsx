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

type LogLevel = "info" | "warning" | "error";
type LogStatus = "success" | "failed";

const levelOptions: Array<{ value: LogLevel; label: string }> = [
  { value: "info", label: "Info" },
  { value: "warning", label: "Warning" },
  { value: "error", label: "Error" },
];

const SEARCH_DEBOUNCE_MS = 350;

function formatDateTime(value: unknown) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toLocaleString("zh-CN", { hour12: false }) : "-";
}

function levelBadge(level?: string | null) {
  if (level === "error") return <Badge variant="destructive">Error</Badge>;
  if (level === "warning") return <Badge variant="warning" className="text-amber-700">Warning</Badge>;
  return <Badge variant="secondary">Info</Badge>;
}

function statusBadge(status?: string | null) {
  return status === "failed"
    ? <Badge variant="destructive">失败</Badge>
    : <Badge variant="success" className="text-emerald-700">成功</Badge>;
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
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">日志管理</h2>
          <p className="text-sm text-muted-foreground">查看任务日志，控制记录开关、记录级别和日志保留时间。</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => logsQuery.refetch()} disabled={logsQuery.isFetching}>
          {logsQuery.isFetching ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
          刷新
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">日志设置</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[1fr_180px_180px_auto_auto]">
          <div className="flex items-center justify-between rounded-md border border-border/70 px-3 py-2">
            <div>
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
            <Button onClick={handleSaveSettings} disabled={settingsControlsDisabled}>
              {saveSettings.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              保存设置
            </Button>
          </div>
          <div className="flex items-end">
            <Button variant="outline" onClick={() => cleanupLogs.mutate({ retentionDays: Number(retentionDays) || undefined })} disabled={settingsControlsDisabled}>
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
              <Input value={targetFilter} onChange={(event) => setTargetFilter(event.target.value)} placeholder="group:1 / account:2" />
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
            <Button variant="outline" onClick={resetFilters}>重置筛选</Button>
            <Button
              variant="destructive"
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
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">日志列表</CardTitle>
          <span className="text-sm text-muted-foreground">当前显示 {logs.length} 条 / 扫描匹配 {scannedTotal} 条</span>
        </CardHeader>
        <CardContent className="p-0">
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
              ) : logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs text-muted-foreground">{formatDateTime(log.createdAt)}</TableCell>
                  <TableCell>{levelBadge(log.level)}</TableCell>
                  <TableCell>{statusBadge(log.status)}</TableCell>
                  <TableCell className="text-xs" title={log.action}>{logActionLabel(log.action)}</TableCell>
                  <TableCell className="font-mono text-xs">{log.target || "-"}</TableCell>
                  <TableCell className="max-w-[520px]">
                    {log.error ? (
                      <div className="flex items-start gap-2 text-sm text-destructive">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span className="truncate" title={log.error}>{log.error}</span>
                      </div>
                    ) : (
                      <span className="block truncate text-sm text-muted-foreground" title={compactJson(log.detail)}>{compactJson(log.detail)}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
