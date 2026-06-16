"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  Bell,
  CheckCircle2,
  ChevronLeft,
  ClipboardList,
  Gauge,
  Layers3,
  Link2,
  ListFilter,
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
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AccountsPanel } from "@/components/app/accounts-panel";
import { AnnouncementsPanel } from "@/components/app/announcements-panel";
import { AppSettingsPage } from "@/components/app/app-settings-page";
import { BlSyncPanel } from "@/components/app/bl-sync-panel";
import { GroupsPanel } from "@/components/app/groups-panel";
import { LogsPanel } from "@/components/app/logs-panel";
import { ServiceStatusPanel } from "@/components/app/service-status-panel";
import { SiteSettingsPanel } from "@/components/app/settings-panel";
import { UpstreamMonitorPanel } from "@/components/app/upstream-monitor-panel";
import { useToast } from "@/components/ui/toast";

type Tab = "service-status" | "groups" | "bl-sync" | "accounts" | "upstream-monitor" | "announcements" | "logs" | "settings";
type ConnectionEdit = { id: number; name: string; baseUrl: string; syncMode: string };

const tabs: Array<{ id: Tab; label: string; description: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "service-status", label: "服务状态", description: "Web、数据库和 worker 状态", icon: ServerCog },
  { id: "groups", label: "分组倍率", description: "模型倍率与分组规则", icon: Gauge },
  { id: "bl-sync", label: "倍率采集", description: "采集源站倍率并同步规则", icon: RadioTower },
  { id: "accounts", label: "账号调度", description: "账号启停与错误处理", icon: ShieldCheck },
  { id: "upstream-monitor", label: "上游检测", description: "账号 uptime 与自动暂停", icon: Activity },
  { id: "announcements", label: "公告管理", description: "维护站点公告", icon: Bell },
  { id: "logs", label: "日志管理", description: "日志筛选、搜索与保留策略", icon: ListFilter },
  { id: "settings", label: "站点设置", description: "站点基础内容", icon: ClipboardList },
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{edit ? "编辑连接" : "添加连接"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>名称</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="生产站点" />
          </div>
          <div className="space-y-2">
            <Label>Sub2API 站点 URL</Label>
            <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} required placeholder="https://example.com" />
          </div>
          <div className="space-y-2">
            <Label>Admin API Key {edit ? "(留空保持不变)" : ""}</Label>
            <Input
              type="password"
              value={adminApiKey}
              onChange={(e) => setAdminApiKey(e.target.value)}
              required={!edit}
              placeholder="sk-..."
            />
          </div>
          <div className="space-y-2">
            <Label>同步策略</Label>
            <Select value={syncMode} onValueChange={(value) => setSyncMode(value as "manual" | "auto")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">手动同步</SelectItem>
                <SelectItem value="auto">自动同步</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error ? <p className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "保存中..." : edit ? "保存连接" : "添加连接"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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

  const handleDelete = async (id: number) => {
    if (!confirm("确定删除此连接？该操作无法撤销。")) return;
    try {
      await deleteConnection.mutateAsync({ id });
      if (selectedId === id) setSelectedId(null);
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

  return (
    <div className="app-shell flex h-screen min-h-0 overflow-hidden bg-background text-foreground">
      <aside className="flex w-[300px] shrink-0 flex-col border-r border-border/80 bg-white/80 shadow-xl shadow-slate-950/5 backdrop-blur">
        <div className="border-b border-border/80 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <Layers3 className="size-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold">S2A Manager</h1>
              <p className="truncate text-xs text-muted-foreground">Sub2API 轻量管理台</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">连接</p>
            <p className="text-xs text-muted-foreground">{connections?.length ?? 0} 个站点</p>
          </div>
          <Button size="icon" variant="outline" onClick={openCreateConnection} title="添加连接">
            <Plus className="size-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-auto px-3 pb-3">
          {connectionsLoading ? (
            <div className="rounded-md border border-dashed bg-white/55 p-4 text-sm text-muted-foreground">连接加载中...</div>
          ) : connections?.length === 0 ? (
            <div className="rounded-md border border-dashed bg-white/55 p-4 text-sm text-muted-foreground">
              还没有连接。添加一个 Sub2API 站点后即可开始管理倍率和同步。
            </div>
          ) : (
            <div className="space-y-2">
              {connections?.map((connection) => {
                const result = testResult[connection.id];
                const active = selectedId === connection.id;

                return (
                  <div
                    key={connection.id}
                    role="button"
                    tabIndex={0}
                    className={cn(
                      "group w-full cursor-pointer rounded-md border p-3 text-left transition-all focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                      active
                        ? "border-primary/35 bg-primary/10 shadow-sm shadow-primary/10"
                        : "border-transparent bg-white/55 hover:border-border hover:bg-white",
                    )}
                    onClick={() => {
                      setSelectedId(connection.id);
                      setActiveTab("groups");
                      setShowAppSettings(false);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      setSelectedId(connection.id);
                      setActiveTab("groups");
                      setShowAppSettings(false);
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn("mt-0.5 rounded-md p-2", active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}>
                        <Link2 className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold">{connection.name}</p>
                          {connection.syncMode === "auto" ? (
                            <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">Auto</span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{connection.baseUrl}</p>
                      </div>
                      {result ? (
                        <span title={result.message} className="mt-1 shrink-0">
                          {result.ok ? <CheckCircle2 className="size-4 text-emerald-600" /> : <XCircle className="size-4 text-destructive" />}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-3 flex items-center gap-1 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        disabled={testConnection.isPending}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTest(connection.id);
                        }}
                      >
                        <Wifi className="size-3.5" />
                        测试
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditConnection({
                            id: connection.id,
                            name: connection.name,
                            baseUrl: connection.baseUrl,
                            syncMode: connection.syncMode,
                          });
                        }}
                      >
                        <Settings className="size-3.5" />
                        编辑
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-destructive hover:text-destructive"
                        disabled={deleteConnection.isPending}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(connection.id);
                        }}
                      >
                        <Trash2 className="size-3.5" />
                        删除
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-border/80 bg-white/65 px-6 backdrop-blur">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {showAppSettings ? (
                <>
                  <Settings className="size-4" />
                  应用设置
                </>
              ) : selected ? (
                <>
                  <ActiveIcon className="size-4" />
                  {selected.name}
                  <span>/</span>
                  {activeTabMeta.label}
                </>
              ) : (
                "等待连接"
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {showAppSettings ? "管理 Worker 与管理员账号" : selected ? activeTabMeta.description : "添加一个连接后开始管理"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden max-w-[220px] truncate text-sm text-muted-foreground sm:inline">{session?.email}</span>
            <Button variant={showAppSettings ? "secondary" : "ghost"} size="icon" onClick={() => setShowAppSettings((value) => !value)} title="应用设置">
              {showAppSettings ? <ChevronLeft className="size-4" /> : <Settings className="size-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => logout.mutate()} disabled={logout.isPending} title="退出登录">
              <LogOut className="size-4" />
            </Button>
          </div>
        </header>

        {showAppSettings ? (
          <div className="min-h-0 flex-1 overflow-auto p-6">
            <AppSettingsPage />
          </div>
        ) : selected ? (
          <>
            <nav className="shrink-0 border-b border-border/70 bg-white/45 px-5">
              <div className="flex gap-1 overflow-x-auto py-2">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      className={cn(
                        "flex h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors",
                        activeTab === tab.id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-white hover:text-foreground",
                      )}
                      onClick={() => setActiveTab(tab.id)}
                    >
                      <Icon className="size-4" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </nav>
            <section className="min-h-0 flex-1 overflow-auto p-6">
              {activeTab === "groups" ? <GroupsPanel connectionId={selected.id} /> : null}
              {activeTab === "service-status" ? <ServiceStatusPanel connectionId={selected.id} /> : null}
              {activeTab === "bl-sync" ? <BlSyncPanel connectionId={selected.id} /> : null}
              {activeTab === "accounts" ? <AccountsPanel connectionId={selected.id} /> : null}
              {activeTab === "upstream-monitor" ? <UpstreamMonitorPanel connectionId={selected.id} /> : null}
              {activeTab === "announcements" ? <AnnouncementsPanel connectionId={selected.id} /> : null}
              {activeTab === "logs" ? <LogsPanel /> : null}
              {activeTab === "settings" ? <SiteSettingsPanel connectionId={selected.id} /> : null}
            </section>
          </>
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center p-6">
            <div className="max-w-md rounded-md border border-dashed bg-white/70 p-8 text-center shadow-sm">
              <div className="mx-auto flex size-12 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Plus className="size-5" />
              </div>
              <h2 className="mt-4 text-lg font-semibold">添加第一个 Sub2API 连接</h2>
              <p className="mt-2 text-sm text-muted-foreground">连接后即可管理分组倍率、账号调度、公告和站点设置。</p>
              <Button className="mt-5" onClick={openCreateConnection}>
                <Plus className="size-4" />
                添加连接
              </Button>
            </div>
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
    </div>
  );
}
