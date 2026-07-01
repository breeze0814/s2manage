"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BotActivityPanel } from "@/components/app/bot-activity-panel";
import {
  BasicConfigCard,
  BotHeader,
  FeatureCommandCard,
  ManualMessageCard,
  type QqBotDraft,
  type QqBotGroup,
  type QqBotWsLog,
} from "@/components/app/bot-management-panel-parts";
import { WsLogsCard } from "@/components/app/bot-management-logs-card";
import { useToast } from "@/components/ui/toast";
import { trpc } from "@/lib/trpc";

const compactBotLayout = true;

const initialWsLogs: QqBotWsLog[] = [
  { time: "--:--:--", type: "listener", message: "等待通过 NapLink 接入 NapCat WebSocket 事件监听" },
  { time: "--:--:--", type: "message", message: "实时接收 NapCat WebSocket 消息事件，并按类别输出到日志台" },
];

const supportedCommandGuide = [
  "@Bot 分组 / 倍率：查询当前开启分组倍率",
  "@Bot 邀请：查询当前三日邀请活动统计",
  "@Bot 绑定 <邮箱>：绑定当前 QQ 与 Sub2 用户",
  "@Bot 解绑：解除当前 QQ 绑定",
].join("\n");

const defaultDraft: QqBotDraft = {
  enabled: false,
  wsUrl: "ws://localhost:3001",
  token: "",
  targetGroupId: "",
  rateChangePushEnabled: false,
  sourceChangePrivatePushEnabled: false,
  sourceChangePrivatePushQq: "",
  mentionKeywordEnabled: false,
  keywordRules: supportedCommandGuide,
  botUserId: "",
  botNickname: "",
  botLoginUpdatedAt: null,
};

function listenerStatusText(status: string) {
  return {
    idle: "未启动",
    connecting: "连接中",
    connected: "已连接",
    disconnected: "已断开",
    error: "异常",
  }[status] ?? status;
}

function listenerBadge(status: string, running: boolean) {
  if (running) return { variant: "success" as const, text: "监听中" };
  if (status === "error") return { variant: "destructive" as const, text: "异常" };
  return { variant: "secondary" as const, text: "未监听" };
}

function mergeConfiguredGroup(groups: QqBotGroup[], targetGroupId: string) {
  if (!targetGroupId || groups.some((group) => group.groupId === targetGroupId)) return groups;
  return [
    ...groups,
    {
      groupId: targetGroupId,
      groupName: "当前配置群",
      memberCount: null,
      maxMemberCount: null,
    },
  ];
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
  const wsLogsQuery = trpc.botSettings.wsLogs.useQuery({ connectionId }, { refetchInterval: 1_500 });
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
      showToast({ title: result.ok ? "测试 WS 成功" : "测试 WS 失败", description: result.message, variant: result.ok ? "success" : "error" });
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
      showToast({ title: result.ok ? "WS 监听已开始" : "WS 监听启动失败", description: result.message, variant: result.ok ? "success" : "error" });
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
    if (savedSettings) setDraft(savedSettings);
  }, [savedSettings]);

  useEffect(() => {
    if (wsLogsQuery.data) setWsLogs(wsLogsQuery.data.logs);
  }, [wsLogsQuery.data]);

  useEffect(() => {
    const logContainer = wsLogContainerRef.current;
    if (logContainer) logContainer.scrollTop = logContainer.scrollHeight;
  }, [wsLogs]);

  const setField = <K extends keyof QqBotDraft>(key: K, value: QqBotDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };
  const saveCurrentSettings = () => saveSettings.mutate({ connectionId, ...draft });
  const saveAndRun = async (work: () => Promise<unknown>) => {
    await saveSettings.mutateAsync({ connectionId, ...draft });
    await work();
  };
  const actionPending = isLoading
    || saveSettings.isPending
    || sendManualMessage.isPending
    || testWsConnection.isPending
    || startWsListener.isPending
    || stopWsListener.isPending;
  const status = wsLogsQuery.data?.status ?? "idle";
  const running = Boolean(wsLogsQuery.data?.running);
  const badge = listenerBadge(status, running);
  const loadedGroups = groupsQuery.data?.groups?.length ? groupsQuery.data.groups : wsLogsQuery.data?.groups ?? [];
  const qqGroups = mergeConfiguredGroup(loadedGroups, draft.targetGroupId);
  const botUserId = wsLogsQuery.data?.botUserId || draft.botUserId;
  const botNickname = wsLogsQuery.data?.botNickname || draft.botNickname;
  const botLabel = botUserId ? `${botUserId}${botNickname ? `（${botNickname}）` : ""}` : "未获取";
  const startedAt = wsLogsQuery.data?.startedAt;
  const listenerStartedAtText = startedAt ? new Date(startedAt).toLocaleString("zh-CN", { hour12: false }) : "-";

  const handleSendManualMessage = async () => {
    await sendManualMessage.mutateAsync({
      connectionId,
      targetType: "group",
      targetId: draft.targetGroupId,
      message: manualMessage,
    });
  };

  return (
    <div className="space-y-3" data-layout={compactBotLayout ? "compactBotLayout" : undefined}>
      <BotHeader
        actionDisabled={actionPending}
        connectionLabel={connectionLabel}
        enabled={draft.enabled}
        isLoading={isLoading}
        onSave={saveCurrentSettings}
        onTestWs={() => saveAndRun(() => testWsConnection.mutateAsync({ connectionId })).catch(() => undefined)}
        saving={saveSettings.isPending}
        testingWs={testWsConnection.isPending}
      />
      <BasicConfigCard draft={draft} groups={qqGroups} groupsFetching={groupsQuery.isFetching} groupsLoading={groupsQuery.isLoading} setField={setField} />
      <div className="grid items-start gap-3 xl:grid-cols-[minmax(320px,0.86fr)_minmax(460px,1.14fr)]">
        <div className="space-y-3" data-layout="botOpsLeftColumn">
          <FeatureCommandCard activitySlot={<BotActivityPanel connectionId={connectionId} />} commandGuide={supportedCommandGuide} draft={draft} setField={setField} />
          <ManualMessageCard
            canSend={Boolean(draft.targetGroupId.trim() && manualMessage.trim() && !actionPending)}
            message={manualMessage}
            onMessageChange={setManualMessage}
            onSend={() => handleSendManualMessage().catch(() => undefined)}
            sending={sendManualMessage.isPending}
            targetGroupId={draft.targetGroupId}
          />
        </div>
        <WsLogsCard
          botLabel={botLabel}
          connected={Boolean(wsLogsQuery.data?.connected)}
          listenerBadgeText={badge.text}
          listenerBadgeVariant={badge.variant}
          listenerStartedAtText={listenerStartedAtText}
          listenerStatusText={listenerStatusText(status)}
          logContainerRef={wsLogContainerRef}
          logs={wsLogs}
          napLinkState={wsLogsQuery.data?.napLinkState ?? status}
          onStart={() => saveAndRun(() => startWsListener.mutateAsync({ connectionId })).catch(() => undefined)}
          onStop={() => stopWsListener.mutateAsync({ connectionId }).catch(() => undefined)}
          running={running}
          startDisabled={actionPending}
          startPending={startWsListener.isPending}
          stopPending={stopWsListener.isPending}
          wsUrl={draft.wsUrl}
        />
      </div>
    </div>
  );
}
