"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  Bell,
  Bot,
  CheckCircle2,
  ChevronLeft,
  ClipboardList,
  Gauge,
  Layers3,
  Link2,
  ListFilter,
  Loader2,
  LogOut,
  Plus,
  RadioTower,
  ServerCog,
  Settings,
  ShieldCheck,
  Trash2,
  Wifi,
  XCircle,
} from "lucide-react";
import { BrandMark } from "@/components/app/brand-mark";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { AccountsPanel } from "@/components/app/accounts-panel";
import { AnnouncementsPanel } from "@/components/app/announcements-panel";
import { AppSettingsPage } from "@/components/app/app-settings-page";
import { BlSyncPanel } from "@/components/app/bl-sync-panel";
import { BotManagementPanel } from "@/components/app/bot-management-panel";
import { BotWsAutoStarter } from "@/components/app/bot-ws-auto-starter";
import { EmptyState, InlineError, LoadingState } from "@/components/app/feedback-state";
import { GroupsPanel } from "@/components/app/groups-panel";
import { LogsPanel } from "@/components/app/logs-panel";
import { ProjectPromoLinks } from "@/components/app/project-promo-links";
import { ServiceStatusPanel } from "@/components/app/service-status-panel";
import { SiteSettingsPanel } from "@/components/app/settings-panel";
import { UpstreamMonitorPanel } from "@/components/app/upstream-monitor-panel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

type Tab = "service-status" | "groups" | "bl-sync" | "accounts" | "upstream-monitor" | "announcements" | "logs" | "settings" | "bot-management";
type ConnectionEdit = { id: number; name: string; baseUrl: string; syncMode: string };
type ConnectionItem = ConnectionEdit & { syncMode: string };

const tabs: Array<{ id: Tab; label: string; description: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "service-status", label: "服务状态", description: "Web、数据库和 worker 状态", icon: ServerCog },
  { id: "groups", label: "分组倍率", description: "模型倍率与分组规则", icon: Gauge },
  { id: "bl-sync", label: "倍率采集", description: "采集源站倍率并同步规则", icon: RadioTower },
  { id: "accounts", label: "账号调度", description: "账号启停与错误处理", icon: ShieldCheck },
  { id: "upstream-monitor", label: "上游检测", description: "账号 uptime 与自动暂停", icon: Activity },
  { id: "announcements", label: "公告管理", description: "维护站点公告", icon: Bell },
  { id: "logs", label: "日志管理", description: "日志筛选、搜索与保留策略", icon: ListFilter },
  { id: "settings", label: "站点设置", description: "站点基础内容", icon: ClipboardList },
  { id: "bot-management", label: "Bot 管理", description: "客户群 Bot 通知与关键字配置", icon: Bot },
];

function ConnectionForm({
  open,
  setOpen,
  edit,
}: {
  open: boolean;
  setOpen: (value: boolean) => void;
  edit?: ConnectionEdit;
}) {
  const utils = trpc.useUtils();
  const { showToast } = useToast();
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [adminApiKey, setAdminApiKey] = useState("");
  const [syncMode, setSyncMode] = useState<"manual" | "auto">("manual");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(edit?.name ?? "");
    setBaseUrl(edit?.baseUrl ?? "");
    setAdminApiKey("");
    setSyncMode((edit?.syncMode as "manual" | "auto" | undefined) ?? "manual");
    setError("");
  }, [edit, open]);

  const create = trpc.connections.create.useMutation({
    onSuccess: async () => {
      await utils.connections.list.invalidate();
      setOpen(false);
      showToast({ title: "连接已添加", variant: "success" });
    },
    onError: (e) => {
      setError(e.message);
      showToast({ title: "添加连接失败", description: e.message, variant: "error" });
    },
  });
  const update = trpc.connections.update.useMutation({
    onSuccess: async () => {
      await utils.connections.list.invalidate();
      setOpen(false);
      showToast({ title: "连接已保存", variant: "success" });
    },
    onError: (e) => {
      setError(e.message);
      showToast({ title: "保存连接失败", description: e.message, variant: "error" });
    },
  });

  const isPending = create.isPending || update.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const trimmedName = name.trim();
    const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");

    if (!trimmedName) {
      setError("请输入连接名称");
      return;
    }
    if (!/^https?:\/\//i.test(normalizedBaseUrl)) {
      setError("站点 URL 必须以 http:// 或 https:// 开头");
      return;
    }

    const data = { name: trimmedName, baseUrl: normalizedBaseUrl, syncMode };
    if (edit) {
      update.mutate({ id: edit.id, ...data, ...(adminApiKey.trim() ? { adminApiKey: adminApiKey.trim() } : {}) });
      return;
    }

    if (!adminApiKey.trim()) {
      setError("请输入 Admin API Key");
      return;
    }
    create.mutate({ ...data, adminApiKey: adminApiKey.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex max-h-[min(92dvh,720px)] flex-col gap-0 overflow-hidden p-0">
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader className="shrink-0 border-b border-border/60 px-4 py-4 sm:px-6">
            <DialogTitle>{edit ? "编辑连接" : "添加连接"}</DialogTitle>
          </DialogHeader>
          <DialogBody className="flex-1 space-y-4 py-5">
          <div className="space-y-2">
            <Label htmlFor="connection-name">名称</Label>
            <Input id="connection-name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="生产站点" autoComplete="organization" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="connection-base-url">Sub2API 站点 URL</Label>
            <Input id="connection-base-url" type="url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} required placeholder="https://example.com" autoComplete="url" autoCapitalize="none" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="connection-admin-key">Admin API Key {edit ? "(留空保持不变)" : ""}</Label>
            <PasswordInput
              id="connection-admin-key"
              value={adminApiKey}
              onChange={(e) => setAdminApiKey(e.target.value)}
              required={!edit}
              placeholder="sk-..."
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="connection-sync-mode">同步策略</Label>
            <Select value={syncMode} onValueChange={(value) => setSyncMode(value as "manual" | "auto")}>
              <SelectTrigger id="connection-sync-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">手动同步</SelectItem>
                <SelectItem value="auto">自动同步</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error ? <InlineError>{error}</InlineError> : null}
          </DialogBody>
          <DialogFooter className="shrink-0 border-t border-border/70 px-4 py-4 sm:px-6">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              {isPending ? "保存中..." : edit ? "保存连接" : "添加连接"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
function ConnectionCard({
  connection,
  active,
  result,
  testPending,
  deletePending,
  onSelect,
  onTest,
  onEdit,
  onDelete,
  compact = false,
}: {
  connection: ConnectionItem;
  active: boolean;
  result?: { ok: boolean; message: string };
  testPending: boolean;
  deletePending: boolean;
  onSelect: () => void;
  onTest: () => void;
  onEdit: () => void;
  onDelete: () => void;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "group rounded-lg border text-left shadow-[inset_0_1px_0_hsl(0_0%_100%/0.2),0_10px_30px_hsl(217_34%_35%/0.08)] backdrop-blur-xl transition-colors dark:shadow-[inset_0_1px_0_hsl(0_0%_100%/0.08),0_12px_34px_hsl(0_0%_0%/0.22)]",
        compact ? "w-[min(78vw,280px)] shrink-0 p-2.5" : "w-full p-3",
        active
          ? "border-primary/40 bg-primary/[0.92] text-primary-foreground"
          : "border-white/[0.45] bg-white/[0.38] hover:bg-white/[0.58] dark:border-white/10 dark:bg-white/[0.07] dark:hover:bg-white/10",
      )}
      data-motion="card"
      data-motion-hover="lift"
    >
      <button
        type="button"
        className="flex w-full items-start gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label={`选择连接 ${connection.name}`}
        aria-pressed={active}
        onClick={onSelect}
      >
        <div
          className={cn(
            "mt-0.5 rounded-md border p-2",
            active ? "border-white/20 bg-white/[0.14] text-primary-foreground" : "border-white/40 bg-white/[0.34] text-muted-foreground dark:border-white/10 dark:bg-white/[0.08]",
          )}
        >
          <Link2 className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold">{connection.name}</p>
            {connection.syncMode === "auto" ? (
              <span
                className={cn(
                  "rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
                  active ? "border-white/20 text-primary-foreground/80" : "border-primary/20 bg-primary/10 text-primary",
                )}
              >
                Auto
              </span>
            ) : null}
          </div>
          <p className={cn("mt-0.5 truncate font-mono text-xs", active ? "text-primary-foreground/70" : "text-muted-foreground")}>{connection.baseUrl}</p>
        </div>
        {result ? (
          <span title={result.message} className="mt-1 shrink-0">
            {result.ok ? (
              <CheckCircle2 className={cn("size-4", active ? "text-teal-100" : "text-teal-600 dark:text-teal-300")} />
            ) : (
              <XCircle className="size-4 text-destructive" />
            )}
          </span>
        ) : null}
      </button>
      <div className={cn("mt-3 flex flex-wrap gap-2", compact ? "[&>button]:flex-1 [&>button]:px-1.5" : "")}>
        <Button
          type="button"
          variant={active ? "secondary" : "ghost"}
          size="sm"
          className={cn("px-2", active && "border-white/20 bg-white/[0.12] text-primary-foreground hover:bg-white/[0.18] hover:text-primary-foreground")}
          disabled={testPending}
          onClick={() => {
            onTest();
          }}
        >
          <Wifi className="size-3.5" />
          测试
        </Button>
        <Button
          type="button"
          variant={active ? "secondary" : "ghost"}
          size="sm"
          className={cn("px-2", active && "border-white/20 bg-white/[0.12] text-primary-foreground hover:bg-white/[0.18] hover:text-primary-foreground")}
          onClick={() => {
            onEdit();
          }}
        >
          <Settings className="size-3.5" />
          编辑
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn("px-2 text-destructive hover:text-destructive", active && "text-primary-foreground hover:bg-white/[0.18] hover:text-primary-foreground")}
          disabled={deletePending}
          onClick={() => {
            onDelete();
          }}
        >
          <Trash2 className="size-3.5" />
          删除
        </Button>
      </div>
    </div>
  );
}
export function Shell() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const { showToast } = useToast();
  const { data: session } = trpc.auth.session.useQuery();
  const { data: connections, isLoading: connectionsLoading } = trpc.connections.list.useQuery();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("groups");
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false);
  const [editConnection, setEditConnection] = useState<ConnectionEdit | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<ConnectionItem | null>(null);
  const [showAppSettings, setShowAppSettings] = useState(false);
  const [testResult, setTestResult] = useState<Record<number, { ok: boolean; message: string }>>({});

  const logout = trpc.auth.logout.useMutation({
    onSuccess: async () => {
      await utils.auth.session.invalidate();
      router.replace("/login");
      router.refresh();
    },
  });
  const testConnection = trpc.connections.test.useMutation();
  const deleteConnection = trpc.connections.delete.useMutation({
    onSuccess: async () => {
      await utils.connections.list.invalidate();
      showToast({ title: "连接已删除", variant: "success" });
    },
    onError: (e) => showToast({ title: "删除连接失败", description: e.message, variant: "error" }),
  });

  useEffect(() => {
    if (!connections || connections.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !connections.some((connection) => connection.id === selectedId)) {
      setSelectedId(connections[0].id);
    }
  }, [connections, selectedId]);

  const selected = connections?.find((connection) => connection.id === selectedId);
  const activeTabMeta = useMemo(() => tabs.find((tab) => tab.id === activeTab) ?? tabs[0], [activeTab]);
  const ActiveIcon = activeTabMeta.icon;

  const openCreateConnection = () => {
    setEditConnection(undefined);
    setConnectionDialogOpen(true);
  };

  const openEditConnection = (connection: ConnectionEdit) => {
    setEditConnection(connection);
    setConnectionDialogOpen(true);
  };

  const selectConnection = (id: number) => {
    setSelectedId(id);
    setActiveTab("groups");
    setShowAppSettings(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const targetId = deleteTarget.id;
    try {
      await deleteConnection.mutateAsync({ id: targetId });
      if (selectedId === targetId) setSelectedId(null);
      setDeleteTarget(null);
    } catch {
      // Mutation onError already displays the failure.
    }
  };

  const handleTest = async (id: number) => {
    setTestResult((prev) => ({ ...prev, [id]: { ok: false, message: "测试中..." } }));
    try {
      const result = await testConnection.mutateAsync({ id });
      setTestResult((prev) => ({ ...prev, [id]: { ok: result.ok, message: result.message } }));
      showToast({ title: "连接测试成功", description: result.message, variant: "success" });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "连接测试失败";
      setTestResult((prev) => ({
        ...prev,
        [id]: { ok: false, message },
      }));
      showToast({ title: "连接测试失败", description: message, variant: "error" });
    }
  };

  const renderConnectionCard = (connection: ConnectionItem, compact = false) => (
    <ConnectionCard
      key={connection.id}
      connection={connection}
      compact={compact}
      active={selectedId === connection.id}
      result={testResult[connection.id]}
      testPending={testConnection.isPending}
      deletePending={deleteConnection.isPending}
      onSelect={() => selectConnection(connection.id)}
      onTest={() => handleTest(connection.id)}
      onEdit={() =>
        openEditConnection({
          id: connection.id,
          name: connection.name,
          baseUrl: connection.baseUrl,
          syncMode: connection.syncMode,
        })
      }
      onDelete={() => setDeleteTarget(connection)}
    />
  );

  return (
    <div className="app-shell flex h-dvh min-h-0 flex-col overflow-hidden text-foreground lg:flex-row" data-motion="shell">
      <aside className="hidden w-[312px] shrink-0 flex-col border-r border-white/[0.35] bg-white/[0.36] backdrop-blur-2xl dark:border-white/10 dark:bg-white/[0.06] lg:flex" data-motion="sidebar">
        <div className="border-b border-white/[0.35] px-5 py-4 dark:border-white/10">
          <div className="mac-window-controls mb-4" aria-hidden="true">
            <span className="bg-[#ff5f57]" />
            <span className="bg-[#ffbd2e]" />
            <span className="bg-[#28c840]" />
          </div>
          <div className="flex items-center gap-3">
            <BrandMark className="size-11 text-slate-900 dark:text-white" />
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold">S2A Manager</h1>
              <p className="truncate font-mono text-xs text-muted-foreground">Sub2API control plane</p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-white/40 bg-white/[0.34] px-3 py-2 text-xs text-muted-foreground backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.08]" data-motion="panel">
            <Layers3 className="size-3.5 text-foreground" />
            <span className="truncate">统一管理倍率、账号与同步任务</span>
          </div>
          <ProjectPromoLinks stacked className="mt-3" />
        </div>

        <div className="flex items-center justify-between px-4 py-3" data-motion="panel">
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">Connections</p>
            <p className="text-xs text-muted-foreground/80">{connections?.length ?? 0} 个站点</p>
          </div>
          <Button size="icon" variant="outline" onClick={openCreateConnection} title="添加连接" aria-label="添加连接">
            <Plus className="size-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-auto px-3 pb-3">
          {connectionsLoading ? (
            <LoadingState label="连接加载中..." className="min-h-24 border-white/[0.45] bg-white/[0.28] dark:border-white/10 dark:bg-white/[0.06]" />
          ) : connections?.length === 0 ? (
            <EmptyState title="还没有连接" description="添加一个 Sub2API 站点后即可开始管理倍率和同步。" className="border-white/[0.45] bg-white/[0.28] py-6 text-left dark:border-white/10 dark:bg-white/[0.06]" />
          ) : (
            <div className="space-y-2">{connections?.map((connection) => renderConnectionCard(connection))}</div>
          )}
        </div>
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="hidden shrink-0 border-b border-white/[0.35] bg-white/[0.34] px-4 py-3 backdrop-blur-2xl sm:px-5 lg:block lg:px-6 dark:border-white/10 dark:bg-white/[0.06]" data-motion="header">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {showAppSettings ? (
                  <>
                    <Settings className="size-4 text-foreground" />
                    应用设置
                  </>
                ) : selected ? (
                  <>
                    <ActiveIcon className="size-4 text-foreground" />
                    <span className="truncate text-foreground">{selected.name}</span>
                    <span className="text-muted-foreground/60">/</span>
                    <span className="truncate">{activeTabMeta.label}</span>
                  </>
                ) : (
                  "等待连接"
                )}
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {showAppSettings ? "管理 Worker 与管理员账号" : selected ? activeTabMeta.description : "添加一个连接后开始管理"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="hidden max-w-[220px] truncate rounded-lg border border-white/40 bg-white/[0.32] px-2.5 py-1.5 text-xs text-muted-foreground backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.08] lg:inline" data-motion="badge">
                {session?.email}
              </span>
              <ThemeToggle />
              <Button variant={showAppSettings ? "secondary" : "ghost"} size="icon" onClick={() => setShowAppSettings((value) => !value)} title="应用设置" aria-label={showAppSettings ? "返回站点管理" : "打开应用设置"}>
                {showAppSettings ? <ChevronLeft className="size-4" /> : <Settings className="size-4" />}
              </Button>
              <Button variant="ghost" size="icon" onClick={() => logout.mutate()} disabled={logout.isPending} title="退出登录" aria-label="退出登录">
                <LogOut className="size-4" />
              </Button>
            </div>
          </div>
        </header>

        <div className="shrink-0 border-b border-white/[0.35] bg-white/[0.34] backdrop-blur-2xl dark:border-white/10 dark:bg-white/[0.06] lg:hidden" data-motion="header">
          <div className="flex items-center justify-between gap-2 px-3 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <BrandMark className="size-9 text-slate-900 dark:text-white" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">S2A Manager</p>
                  <p className="truncate text-xs text-muted-foreground">{connections?.length ?? 0} 个站点</p>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <ThemeToggle />
              <Button variant={showAppSettings ? "secondary" : "ghost"} size="icon" onClick={() => setShowAppSettings((value) => !value)} title="应用设置" aria-label={showAppSettings ? "返回站点管理" : "打开应用设置"}>
                {showAppSettings ? <ChevronLeft className="size-4" /> : <Settings className="size-4" />}
              </Button>
              <Button variant="ghost" size="icon" onClick={() => logout.mutate()} disabled={logout.isPending} title="退出登录" aria-label="退出登录">
                <LogOut className="size-4" />
              </Button>
              <Button size="icon" variant="outline" onClick={openCreateConnection} title="添加连接" aria-label="添加连接">
                <Plus className="size-4" />
              </Button>
            </div>
          </div>
          <div className="px-3 pb-2">
            <div className="flex min-w-0 items-center gap-2 rounded-lg border border-white/40 bg-white/[0.26] px-3 py-2 text-xs text-muted-foreground backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.07]">
              {showAppSettings ? (
                <>
                  <Settings className="size-3.5 shrink-0 text-foreground" />
                  <span className="truncate text-foreground">应用设置</span>
                  <span className="truncate">管理 Worker 与管理员账号</span>
                </>
              ) : selected ? (
                <>
                  <ActiveIcon className="size-3.5 shrink-0 text-foreground" />
                  <span className="truncate text-foreground">{selected.name}</span>
                  <span className="text-muted-foreground/60">/</span>
                  <span className="truncate">{activeTabMeta.label}</span>
                </>
              ) : (
                <span>等待连接</span>
              )}
            </div>
          </div>
          {!showAppSettings && !selected ? <ProjectPromoLinks className="hidden px-3 pb-2 min-[420px]:flex" /> : null}
          {!showAppSettings ? (
            <div className="overflow-x-auto px-3 pb-3 [-webkit-overflow-scrolling:touch]">
              {connectionsLoading ? (
                <LoadingState label="连接加载中..." className="min-h-20 min-w-[min(78vw,280px)] border-white/[0.45] bg-white/[0.28] py-4 dark:border-white/10 dark:bg-white/[0.06]" />
              ) : connections?.length === 0 ? (
                <EmptyState title="暂无连接" description="添加一个 Sub2API 站点后即可开始管理。" className="min-w-[min(78vw,280px)] border-white/[0.45] bg-white/[0.28] py-4 dark:border-white/10 dark:bg-white/[0.06]" />
              ) : (
                <div className="flex gap-2">{connections?.map((connection) => renderConnectionCard(connection, true))}</div>
              )}
            </div>
          ) : null}
        </div>

        {selected ? <BotWsAutoStarter connectionId={selected.id} /> : null}

        {showAppSettings ? (
          <div id="main-content" tabIndex={-1} className="min-h-0 flex-1 overflow-auto p-3 outline-none sm:p-5 md:p-6" data-motion="section">
            <AppSettingsPage />
          </div>
        ) : selected ? (
          <>
            <nav className="shrink-0 border-b border-white/30 bg-white/[0.24] px-3 backdrop-blur-2xl dark:border-white/10 dark:bg-white/[0.05] sm:px-5" data-motion="nav">
              <div className="grid grid-cols-3 gap-1 py-2 min-[420px]:grid-cols-4 min-[560px]:grid-cols-5 min-[1400px]:flex min-[1400px]:overflow-x-auto">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      className={cn(
                        "flex h-11 shrink-0 items-center justify-center min-[1400px]:justify-start gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-xs font-medium shadow-[inset_0_1px_0_hsl(0_0%_100%/0.18)] backdrop-blur-xl transition-colors min-[1400px]:h-10 min-[1400px]:gap-2 min-[1400px]:px-3 min-[1400px]:text-sm",
                        activeTab === tab.id
                          ? "border-primary/45 bg-primary/90 text-primary-foreground"
                          : "border-transparent text-muted-foreground hover:border-primary/25 hover:bg-primary/[0.1] hover:text-foreground dark:hover:border-primary/25 dark:hover:bg-primary/[0.08]",
                      )}
                      data-motion="control"
                      data-motion-hover="lift"
                      data-active={activeTab === tab.id ? "true" : "false"}
                      aria-current={activeTab === tab.id ? "page" : undefined}
                      onClick={() => setActiveTab(tab.id)}
                    >
                      <Icon className="size-4" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </nav>
            <section id="main-content" tabIndex={-1} className="min-h-0 flex-1 overflow-auto p-3 outline-none sm:p-5 md:p-6" data-motion="section">
              {activeTab === "groups" ? <GroupsPanel connectionId={selected.id} /> : null}
              {activeTab === "service-status" ? <ServiceStatusPanel connectionId={selected.id} /> : null}
              {activeTab === "bl-sync" ? <BlSyncPanel connectionId={selected.id} /> : null}
              {activeTab === "accounts" ? <AccountsPanel connectionId={selected.id} /> : null}
              {activeTab === "upstream-monitor" ? <UpstreamMonitorPanel connectionId={selected.id} /> : null}
              {activeTab === "announcements" ? <AnnouncementsPanel connectionId={selected.id} /> : null}
              {activeTab === "logs" ? <LogsPanel /> : null}
              {activeTab === "settings" ? <SiteSettingsPanel connectionId={selected.id} /> : null}
              {activeTab === "bot-management" ? <BotManagementPanel connectionId={selected.id} /> : null}
            </section>
          </>
        ) : (
          <div id="main-content" tabIndex={-1} className="flex min-h-0 flex-1 items-center justify-center p-4 outline-none sm:p-6" data-motion="section">
            <EmptyState className="codex-panel max-w-md rounded-xl border-solid p-6 sm:p-8">
              <BrandMark className="mx-auto size-14 text-slate-900 dark:text-white" />
              <h2 className="mt-4 text-lg font-semibold">添加第一个 Sub2API 连接</h2>
              <p className="mt-2 text-sm text-muted-foreground">连接后即可管理分组倍率、账号调度、公告和站点设置。可参考官方仓库，也可访问 z30.top 体验 SUB2API 中转服务。</p>
              <ProjectPromoLinks stacked className="mt-4 text-left" />
              <Button className="mt-5" onClick={openCreateConnection}>
                <Plus className="size-4" />
                添加连接
              </Button>
            </EmptyState>
          </div>
        )}
      </main>

      <ConnectionForm
        open={connectionDialogOpen}
        setOpen={(value) => {
          setConnectionDialogOpen(value);
          if (!value) setEditConnection(undefined);
        }}
        edit={editConnection}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="删除连接"
        description={
          deleteTarget
            ? `确定删除「${deleteTarget.name}」？该操作无法撤销，相关管理面板会停止使用此站点。`
            : "确定删除此连接？该操作无法撤销。"
        }
        confirmLabel="删除连接"
        pending={deleteConnection.isPending}
        onConfirm={handleDelete}
      />
    </div>
  );
}
