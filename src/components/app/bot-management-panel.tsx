"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, ListChecks, PauseCircle, Play, Radio, Save, Send, ShieldAlert, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { trpc } from "@/lib/trpc";

type QqBotDraft = {
  enabled: boolean;
  wsUrl: string;
  token: string;
  targetGroupId: string;
  rateChangePushEnabled: boolean;
  mentionKeywordEnabled: boolean;
  liveRateTestEnabled: boolean;
  keywordRules: string;
  testMessageTemplate: string;
  botUserId: string;
  botNickname: string;
  botLoginUpdatedAt: string | null;
};

type QqBotWsLog = {
  time: string;
  type: string;
  message: string;
};

type QqBotGroup = {
  groupId: string;
  groupName: string;
  memberCount: number | null;
  maxMemberCount: number | null;
};

const compactBotLayout = true;

const initialWsLogs: QqBotWsLog[] = [
  { time: "--:--:--", type: "listener", message: "等待通过 NapLink 接入 NapCat WebSocket 事件监听" },
  { time: "--:--:--", type: "message", message: "实时接收 NapCat WebSocket 消息事件，并按类别输出到日志台" },
];

const defaultKeywordRules = ["倍率：查询当前开启分组倍率", "最近变动：返回最近分组倍率变动"].join("\n");

const defaultTestMessageTemplate = [
  "当前分组倍率",
  "{{connectionName}}",
  "{{enabledGroupRates}}",
  "更新时间：{{generatedAt}}",
].join("\n");

const defaultDraft: QqBotDraft = {
  enabled: false,
  wsUrl: "ws://localhost:3001",
  token: "",
  targetGroupId: "",
  rateChangePushEnabled: false,
  mentionKeywordEnabled: false,
  liveRateTestEnabled: true,
  keywordRules: defaultKeywordRules,
  testMessageTemplate: defaultTestMessageTemplate,
  botUserId: "",
  botNickname: "",
  botLoginUpdatedAt: null,
};

function FeatureSwitch({
  id,
  title,
  description,
  checked,
  onChange,
}: {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-2.5 py-2">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm">
          {title}
        </Label>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function qqGroupLabel(group: QqBotGroup) {
  const members = group.memberCount === null ? "" : `，${group.memberCount}${group.maxMemberCount === null ? "" : `/${group.maxMemberCount}`} 人`;
  return `${group.groupName}（${group.groupId}${members}）`;
}

export function BotManagementPanel({ connectionId }: { connectionId: number }) {
  const utils = trpc.useUtils();
  const { showToast } = useToast();
  const [draft, setDraft] = useState<QqBotDraft>(() => ({ ...defaultDraft }));
  const [wsLogs, setWsLogs] = useState<QqBotWsLog[]>(initialWsLogs);
  const [manualMessage, setManualMessage] = useState("");
  const wsLogContainerRef = useRef<HTMLDivElement>(null);
  const connectionLabel = useMemo(() => `Connection #${connectionId}`, [connectionId]);
  const { data: savedSettings, isLoading } = trpc.botSettings.get.useQuery({ connectionId });
  const wsLogsQuery = trpc.botSettings.wsLogs.useQuery(
    { connectionId },
    { refetchInterval: 1_500 },
  );
  const groupsQuery = trpc.botSettings.groups.useQuery(
    { connectionId },
    { enabled: Boolean(wsLogsQuery.data?.connected || wsLogsQuery.data?.running) },
  );
  const saveSettings = trpc.botSettings.save.useMutation({
    onSuccess: async (settings) => {
      setDraft(settings);
      await utils.botSettings.get.invalidate({ connectionId });
      showToast({ title: "QQBot 配置已保存", variant: "success" });
    },
    onError: (error) => {
      showToast({ title: "QQBot 配置保存失败", description: error.message, variant: "error" });
    },
  });
  const sendTestAnalysis = trpc.botSettings.sendTestAnalysis.useMutation({
    onSuccess: (result) => {
      setWsLogs(result.logs);
      showToast({ title: `测试分析已发送`, description: `已发送 ${result.groupCount} 个开启分组的实时倍率`, variant: "success" });
    },
    onError: (error) => {
      showToast({ title: "测试分析发送失败", description: error.message, variant: "error" });
    },
  });
  const sendManualMessage = trpc.botSettings.sendManualMessage.useMutation({
    onSuccess: async (result) => {
      setWsLogs(result.logs);
      setManualMessage("");
      await utils.botSettings.wsLogs.invalidate({ connectionId });
      showToast({ title: "消息已发送", description: `已发送到 QQ 群 ${result.targetId}`, variant: "success" });
    },
    onError: (error) => {
      showToast({ title: "消息发送失败", description: error.message, variant: "error" });
    },
  });
  const testWsConnection = trpc.botSettings.testWsConnection.useMutation({
    onSuccess: (result) => {
      setWsLogs(result.logs);
      if (result.ok) {
        showToast({ title: "测试 WS 成功", description: result.message, variant: "success" });
        return;
      }
      showToast({ title: "测试 WS 失败", description: result.message, variant: "error" });
    },
    onError: (error) => {
      showToast({ title: "测试 WS 失败", description: error.message, variant: "error" });
    },
  });
  const startWsListener = trpc.botSettings.startWsListener.useMutation({
    onSuccess: async (result) => {
      setWsLogs(result.logs);
      await Promise.all([
        utils.botSettings.wsLogs.invalidate({ connectionId }),
        utils.botSettings.groups.invalidate({ connectionId }),
      ]);
      if (result.ok) {
        showToast({ title: "WS 监听已开始", description: result.message, variant: "success" });
        return;
      }
      showToast({ title: "WS 监听启动失败", description: result.message, variant: "error" });
    },
    onError: (error) => {
      showToast({ title: "WS 监听启动失败", description: error.message, variant: "error" });
    },
  });
  const stopWsListener = trpc.botSettings.stopWsListener.useMutation({
    onSuccess: async (result) => {
      setWsLogs(result.logs);
      await Promise.all([
        utils.botSettings.wsLogs.invalidate({ connectionId }),
        utils.botSettings.groups.invalidate({ connectionId }),
      ]);
      showToast({ title: "WS 监听已停止", description: result.message, variant: "success" });
    },
    onError: (error) => {
      showToast({ title: "WS 监听停止失败", description: error.message, variant: "error" });
    },
  });

  useEffect(() => {
    if (!savedSettings) return;
    setDraft(savedSettings);
  }, [savedSettings]);

  useEffect(() => {
    if (!wsLogsQuery.data) return;
    setWsLogs(wsLogsQuery.data.logs);
  }, [wsLogsQuery.data]);

  useEffect(() => {
    const logContainer = wsLogContainerRef.current;
    if (!logContainer) return;
    logContainer.scrollTop = logContainer.scrollHeight;
  }, [wsLogs]);

  const setField = <K extends keyof QqBotDraft>(key: K, value: QqBotDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    saveSettings.mutate({ connectionId, ...draft });
  };

  const handleSendTestAnalysis = async () => {
    try {
      await saveSettings.mutateAsync({ connectionId, ...draft });
      await sendTestAnalysis.mutateAsync({ connectionId });
    } catch {
      // Mutation handlers show the actual error.
    }
  };

  const handleTestWsConnection = async () => {
    try {
      await saveSettings.mutateAsync({ connectionId, ...draft });
      await testWsConnection.mutateAsync({ connectionId });
    } catch {
      // Mutation handlers show the actual error.
    }
  };

  const handleStartWsListener = async () => {
    try {
      await saveSettings.mutateAsync({ connectionId, ...draft });
      await startWsListener.mutateAsync({ connectionId });
    } catch {
      // Mutation handlers show the actual error.
    }
  };

  const handleStopWsListener = async () => {
    await stopWsListener.mutateAsync({ connectionId });
  };

  const listenerStatus = wsLogsQuery.data?.status ?? "idle";
  const listenerRunning = Boolean(wsLogsQuery.data?.running);
  const listenerConnected = Boolean(wsLogsQuery.data?.connected);
  const napLinkState = wsLogsQuery.data?.napLinkState ?? listenerStatus;
  const listenerBadgeVariant = listenerRunning ? "success" : listenerStatus === "error" ? "destructive" : "secondary";
  const listenerBadgeText = listenerRunning ? "监听中" : listenerStatus === "error" ? "异常" : "未监听";
  const listenerStatusText = {
    idle: "未启动",
    connecting: "连接中",
    connected: "已连接",
    disconnected: "已断开",
    error: "异常",
  }[listenerStatus] ?? String(listenerStatus);
  const qqGroups = useMemo(() => {
    const loadedGroups = groupsQuery.data?.groups?.length ? groupsQuery.data.groups : wsLogsQuery.data?.groups ?? [];
    if (!draft.targetGroupId || loadedGroups.some((group) => group.groupId === draft.targetGroupId)) return loadedGroups;
    return [
      ...loadedGroups,
      {
        groupId: draft.targetGroupId,
        groupName: "当前配置群",
        memberCount: null,
        maxMemberCount: null,
      },
    ];
  }, [draft.targetGroupId, groupsQuery.data?.groups, wsLogsQuery.data?.groups]);
  const listenerStartedAtText = wsLogsQuery.data?.startedAt
    ? new Date(wsLogsQuery.data.startedAt).toLocaleString("zh-CN", { hour12: false })
    : "-";
  const botUserId = wsLogsQuery.data?.botUserId || draft.botUserId;
  const botNickname = wsLogsQuery.data?.botNickname || draft.botNickname;
  const botLabel = botUserId ? `${botUserId}${botNickname ? `（${botNickname}）` : ""}` : "未获取";
  const isActionPending = isLoading
    || saveSettings.isPending
    || sendTestAnalysis.isPending
    || sendManualMessage.isPending
    || testWsConnection.isPending
    || startWsListener.isPending
    || stopWsListener.isPending;
  const canSendManualMessage = Boolean(draft.targetGroupId.trim() && manualMessage.trim() && !isActionPending);

  const handleSendManualMessage = async () => {
    try {
      await sendManualMessage.mutateAsync({
        connectionId,
        targetType: "group",
        targetId: draft.targetGroupId,
        message: manualMessage,
      });
    } catch {
      // Mutation handlers show the actual error.
    }
  };

  return (
    <div className="space-y-3" data-layout={compactBotLayout ? "compactBotLayout" : undefined}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Bot className="size-4 text-primary" />
            QQBot 管理
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{connectionLabel}，仅保留基础配置、功能开关、测试分析和 WS 实时日志。</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={draft.enabled ? "success" : "secondary"}>{draft.enabled ? "已启用" : "未启用"}</Badge>
          <Button variant="outline" size="sm" onClick={handleTestWsConnection} disabled={isActionPending}>
            <Radio className="size-4" />
            {testWsConnection.isPending ? "测试中..." : "测试 WS"}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isLoading || saveSettings.isPending}>
            <Save className="size-4" />
            {saveSettings.isPending ? "保存中..." : "保存配置"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="px-3 py-2.5">
          <CardTitle className="flex items-center gap-2 text-sm">
            <SlidersHorizontal className="size-4 text-primary" />
            基本配置
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 px-3 pb-3 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="qqbot-ws-url" className="text-xs">
              NapCat WebSocket 地址
            </Label>
            <Input id="qqbot-ws-url" value={draft.wsUrl} placeholder="ws://localhost:3001" onChange={(event) => setField("wsUrl", event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qqbot-token" className="text-xs">
              NapCat Token
            </Label>
            <Input
              id="qqbot-token"
              type="password"
              value={draft.token}
              placeholder="可选"
              autoComplete="new-password"
              onChange={(event) => setField("token", event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qqbot-target-group-id" className="text-xs">
              目标 QQ 群号
            </Label>
            <Select value={draft.targetGroupId} onValueChange={(value) => setField("targetGroupId", value)}>
              <SelectTrigger id="qqbot-target-group-id">
                <SelectValue placeholder={groupsQuery.isLoading ? "加载群组..." : "选择 QQ 群"} />
              </SelectTrigger>
              <SelectContent>
                {qqGroups.map((group) => (
                  <SelectItem key={group.groupId} value={group.groupId}>
                    {qqGroupLabel(group)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              群组列表：已加载 {qqGroups.length} 个群{groupsQuery.isFetching ? "，正在刷新" : ""}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 xl:grid-cols-[minmax(320px,0.9fr)_minmax(420px,1.1fr)]">
        <div className="space-y-3" data-layout="botOpsLeftColumn">
          <Card>
            <CardHeader className="px-3 py-2.5">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ListChecks className="size-4 text-primary" />
                功能列表
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 px-3 pb-3">
              <FeatureSwitch
                id="qqbot-enabled"
                title="启用 QQBot"
                description="控制当前连接是否开启 QQBot 能力。"
                checked={draft.enabled}
                onChange={(checked) => setField("enabled", checked)}
              />
              <FeatureSwitch
                id="qqbot-rate-change-push"
                title="分组倍率变动推送"
                description="采集后检测到分组倍率变化时发送说明。"
                checked={draft.rateChangePushEnabled}
                onChange={(checked) => setField("rateChangePushEnabled", checked)}
              />
              <FeatureSwitch
                id="qqbot-mention-keyword"
                title="@ 关键字触发"
                description="群聊 @ 机器人并命中关键字后触发操作。"
                checked={draft.mentionKeywordEnabled}
                onChange={(checked) => setField("mentionKeywordEnabled", checked)}
              />
              <FeatureSwitch
                id="qqbot-live-rate-test"
                title="测试分析"
                description="发送当前分组倍率下已开启分组的实时倍率。"
                checked={draft.liveRateTestEnabled}
                onChange={(checked) => setField("liveRateTestEnabled", checked)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="px-3 py-2.5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Send className="size-4 text-primary" />
                  测试分析
                </CardTitle>
                <Button variant="outline" size="sm" onClick={handleSendTestAnalysis} disabled={isActionPending}>
                  <Send className="size-4" />
                  {sendTestAnalysis.isPending ? "发送中..." : "发送测试分析"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 px-3 pb-3">
              <p className="rounded-md border border-border/70 px-2.5 py-2 text-xs leading-5 text-muted-foreground">
                测试信息将发送当前分组倍率下已开启分组的实时倍率。
              </p>
              <div className="grid gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="qqbot-test-template" className="text-xs">
                    测试消息模板
                  </Label>
                  <Textarea
                    id="qqbot-test-template"
                    className="min-h-24"
                    value={draft.testMessageTemplate}
                    onChange={(event) => setField("testMessageTemplate", event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="qqbot-keyword-rules" className="text-xs">
                    关键字规则
                  </Label>
                  <Textarea
                    id="qqbot-keyword-rules"
                    className="min-h-24"
                    value={draft.keywordRules}
                    onChange={(event) => setField("keywordRules", event.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2 rounded-md border border-border/70 px-2.5 py-2">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <Label htmlFor="qqbot-manual-message" className="text-xs">
                    消息发送
                  </Label>
                  <span className="text-xs text-muted-foreground">
                    发送到：{draft.targetGroupId ? `QQ 群 ${draft.targetGroupId}` : "请选择群组"}
                  </span>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Textarea
                    id="qqbot-manual-message"
                    className="min-h-20 flex-1"
                    value={manualMessage}
                    placeholder="输入要发送到当前 QQ 群的消息"
                    onChange={(event) => setManualMessage(event.target.value)}
                  />
                  <Button className="sm:self-end" size="sm" onClick={handleSendManualMessage} disabled={!canSendManualMessage}>
                    <Send className="size-4" />
                    {sendManualMessage.isPending ? "发送中..." : "发送消息"}
                  </Button>
                </div>
              </div>
              <div className="flex items-start gap-2 rounded-md border border-dashed border-amber-400/40 bg-amber-500/10 px-2.5 py-2 text-xs leading-5 text-amber-700 dark:text-amber-300">
                <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
                <span>发送测试分析会读取当前连接已开启分组的实时倍率，并通过 NapLink 连接 NapCat WebSocket 发送到目标 QQ 群。</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card data-layout="botLogsRightColumn">
          <CardHeader className="px-3 py-2.5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Radio className="size-4 text-primary" />
                  WS 实时日志
                </CardTitle>
                <Badge variant={listenerBadgeVariant}>{listenerBadgeText}</Badge>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleStartWsListener} disabled={isActionPending} title="开始监听 NapCat WebSocket 事件">
                  <Play className="size-4" />
                  {startWsListener.isPending ? "启动中..." : "开始监听"}
                </Button>
                <Button variant="outline" size="sm" onClick={handleStopWsListener} disabled={stopWsListener.isPending || !listenerRunning} title="停止监听 NapCat WebSocket 事件">
                  <PauseCircle className="size-4" />
                  {stopWsListener.isPending ? "停止中..." : "停止监听"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <div className="mb-2 grid gap-2 rounded-md border border-border/70 px-2.5 py-2 text-xs text-muted-foreground sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="min-w-0">
                <span className="text-foreground">当前 WS 状态：</span>
                <span>{listenerStatusText}</span>
              </div>
              <div className="min-w-0">
                <span className="text-foreground">NapLink：</span>
                <span>{napLinkState}{listenerConnected ? " / 已连接" : ""}</span>
              </div>
              <div className="min-w-0 truncate" title={botLabel}>
                <span className="text-foreground">Bot QQ：</span>
                <span>{botLabel}</span>
              </div>
              <div className="min-w-0 truncate" title={draft.wsUrl}>
                <span className="text-foreground">地址：</span>
                <span>{draft.wsUrl || "-"}</span>
              </div>
              <div className="min-w-0 truncate" title={listenerStartedAtText}>
                <span className="text-foreground">启动时间：</span>
                <span>{listenerStartedAtText}</span>
              </div>
            </div>
            <div
              ref={wsLogContainerRef}
              className="max-h-[620px] min-h-[420px] overflow-auto rounded-md border border-border/70 bg-slate-950 px-3 py-2 font-mono text-xs leading-6 text-slate-100 dark:bg-black/40"
            >
              {wsLogs.map((log, index) => (
                <div key={`${log.time}-${log.type}-${index}`} className="grid gap-2 border-b border-white/10 py-1 last:border-b-0 sm:grid-cols-[72px_132px_minmax(0,1fr)]">
                  <span className="text-slate-400">{log.time}</span>
                  <span className="text-sky-300">{log.type}</span>
                  <span className="min-w-0 break-words">{log.message}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
