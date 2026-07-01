import { randomBytes } from "node:crypto";
import * as net from "node:net";
import * as tls from "node:tls";
import { decrypt } from "@/server/crypto";
import { db } from "@/server/db";
import { getSecretSetting, getSetting, setSecretSetting, setSetting } from "@/server/settings";
import { Sub2ApiAdminClient, type Sub2ApiGroup } from "@/server/clients/sub2api-admin";
import {
  bindQqBotUser,
  resolveQqBotUserBindingCommandDecision,
  unbindQqBotUser,
} from "@/server/qqbot-user-bindings";
import {
  handleQqBotAffiliateActivityCommand,
  resolveQqBotAffiliateActivityCommandDecision,
} from "@/server/qqbot-affiliate-activity";
import { extractQqBotCommandText } from "@/server/qqbot-command";

export type QqBotSettings = {
  enabled: boolean;
  wsUrl: string;
  token: string;
  targetGroupId: string;
  rateChangePushEnabled: boolean;
  sourceChangePrivatePushEnabled: boolean;
  sourceChangePrivatePushQq: string;
  mentionKeywordEnabled: boolean;
  liveRateTestEnabled: boolean;
  keywordRules: string;
  testMessageTemplate: string;
  botUserId: string;
  botNickname: string;
  botLoginUpdatedAt: string | null;
};

type StoredQqBotSettings = Omit<QqBotSettings, "token">;

export type QqBotWsLog = {
  time: string;
  type: string;
  message: string;
};

export type QqBotWsListenerStatus = "idle" | "connecting" | "connected" | "disconnected" | "error";

export type QqBotGroup = {
  groupId: string;
  groupName: string;
  memberCount: number | null;
  maxMemberCount: number | null;
};

export type QqBotIncomingMessage = {
  messageType: string;
  subType: string;
  groupId: string;
  userId: string;
  text: string;
};

export const defaultQqBotSettings: QqBotSettings = {
  enabled: false,
  wsUrl: "ws://localhost:3001",
  token: "",
  targetGroupId: "",
  rateChangePushEnabled: false,
  sourceChangePrivatePushEnabled: false,
  sourceChangePrivatePushQq: "",
  mentionKeywordEnabled: false,
  liveRateTestEnabled: true,
  keywordRules: ["倍率：查询当前开启分组倍率", "最近变动：返回最近分组倍率变动"].join("\n"),
  testMessageTemplate: ["当前分组倍率", "{{connectionName}}", "{{enabledGroupRates}}", "更新时间：{{generatedAt}}"].join("\n"),
  botUserId: "",
  botNickname: "",
  botLoginUpdatedAt: null,
};

function configKey(connectionId: number) {
  return `qqbot_config:${connectionId}`;
}

function tokenKey(connectionId: number) {
  return `qqbot_config:${connectionId}:token`;
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function nullableStringValue(value: unknown, fallback: string | null) {
  return typeof value === "string" ? value : fallback;
}

function normalizeStoredSettings(input: unknown): StoredQqBotSettings {
  const record = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return {
    enabled: booleanValue(record.enabled, defaultQqBotSettings.enabled),
    wsUrl: stringValue(record.wsUrl, defaultQqBotSettings.wsUrl),
    targetGroupId: stringValue(record.targetGroupId, defaultQqBotSettings.targetGroupId),
    rateChangePushEnabled: booleanValue(record.rateChangePushEnabled, defaultQqBotSettings.rateChangePushEnabled),
    sourceChangePrivatePushEnabled: booleanValue(record.sourceChangePrivatePushEnabled, defaultQqBotSettings.sourceChangePrivatePushEnabled),
    sourceChangePrivatePushQq: stringValue(record.sourceChangePrivatePushQq, defaultQqBotSettings.sourceChangePrivatePushQq),
    mentionKeywordEnabled: booleanValue(record.mentionKeywordEnabled, defaultQqBotSettings.mentionKeywordEnabled),
    liveRateTestEnabled: booleanValue(record.liveRateTestEnabled, defaultQqBotSettings.liveRateTestEnabled),
    keywordRules: stringValue(record.keywordRules, defaultQqBotSettings.keywordRules),
    testMessageTemplate: stringValue(record.testMessageTemplate, defaultQqBotSettings.testMessageTemplate),
    botUserId: stringValue(record.botUserId, defaultQqBotSettings.botUserId),
    botNickname: stringValue(record.botNickname, defaultQqBotSettings.botNickname),
    botLoginUpdatedAt: nullableStringValue(record.botLoginUpdatedAt, defaultQqBotSettings.botLoginUpdatedAt),
  };
}

function parseStoredSettings(raw: string) {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export async function getQqBotSettings(connectionId: number): Promise<QqBotSettings> {
  const raw = await getSetting(configKey(connectionId), "");
  const stored = raw ? normalizeStoredSettings(parseStoredSettings(raw)) : normalizeStoredSettings(null);
  const token = await getSecretSetting(tokenKey(connectionId), "");
  return { ...stored, token };
}

export async function saveQqBotSettings(connectionId: number, input: QqBotSettings): Promise<QqBotSettings> {
  const current = await getQqBotSettings(connectionId);
  const stored = normalizeStoredSettings({
    ...input,
    botUserId: input.botUserId || current.botUserId,
    botNickname: input.botNickname || current.botNickname,
    botLoginUpdatedAt: input.botLoginUpdatedAt ?? current.botLoginUpdatedAt,
  });
  await Promise.all([setSetting(configKey(connectionId), JSON.stringify(stored)), setSecretSetting(tokenKey(connectionId), input.token)]);
  return { ...stored, token: input.token };
}

function normalizeBotLoginInfo(value: unknown) {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const userId = record.user_id ?? record.userId;
  const nickname = record.nickname ?? record.nickName;
  return {
    botUserId: userId === undefined || userId === null ? "" : String(userId),
    botNickname: typeof nickname === "string" ? nickname : "",
    botLoginUpdatedAt: new Date().toISOString(),
  };
}

async function saveQqBotLoginInfo(connectionId: number, loginInfo: Pick<QqBotSettings, "botUserId" | "botNickname" | "botLoginUpdatedAt">) {
  const settings = await getQqBotSettings(connectionId);
  const stored = normalizeStoredSettings({ ...settings, ...loginInfo });
  await setSetting(configKey(connectionId), JSON.stringify(stored));
  return stored;
}

function finiteRate(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
}

function isEnabledGroup(group: Sub2ApiGroup) {
  const status = String(group.status ?? "active").toLowerCase();
  return !["disabled", "disable", "inactive", "off", "0", "false"].includes(status);
}

function formatRate(value: unknown) {
  return Number(finiteRate(value).toFixed(6)).toString();
}

export function buildEnabledGroupRatesMessage(input: { connectionName: string; groups: Sub2ApiGroup[]; template: string; generatedAt?: Date }) {
  const enabledGroups = input.groups.filter(isEnabledGroup);
  const enabledGroupRates = enabledGroups.length > 0
    ? enabledGroups.map((group) => `- ${group.name}：${formatRate(group.rate_multiplier)}`).join("\n")
    : "暂无已开启分组";
  const generatedAt = (input.generatedAt ?? new Date()).toLocaleString("zh-CN", { hour12: false });

  return input.template
    .replaceAll("{{connectionName}}", input.connectionName)
    .replaceAll("{{enabledGroupRates}}", enabledGroupRates)
    .replaceAll("{{generatedAt}}", generatedAt);
}

export function buildQqBotRateCommandReplyMessage(input: {
  groups: Sub2ApiGroup[];
  generatedAt?: Date;
}) {
  const enabledGroups = input.groups.filter(isEnabledGroup);
  const generatedAt = (input.generatedAt ?? new Date()).toLocaleString("zh-CN", { hour12: false });
  const lines = ["当前分组倍率"];
  if (enabledGroups.length === 0) {
    lines.push("暂无已开启分组");
  } else {
    lines.push(...enabledGroups.map((group) => `- ${group.name}：${formatRate(group.rate_multiplier)}`));
  }
  lines.push(`更新时间：${generatedAt}`);
  return lines.join("\n");
}

export function buildQqBotTargetGroupRateChangeMessage(input: {
  changedGroupName: string;
  oldRate?: number | null;
  newRate: number;
  groups: Sub2ApiGroup[];
  generatedAt?: Date;
}) {
  const generatedAt = (input.generatedAt ?? new Date()).toLocaleString("zh-CN", { hour12: false });
  const enabledGroups = input.groups.filter(isEnabledGroup);
  const lines = [
    "分组倍率已更新",
    `变动分组：${input.changedGroupName} ${input.oldRate === null || input.oldRate === undefined ? "-" : formatRate(input.oldRate)} -> ${formatRate(input.newRate)}`,
    "",
    "当前分组倍率：",
  ];

  if (enabledGroups.length === 0) {
    lines.push("暂无已开启分组");
  } else {
    lines.push(...enabledGroups.map((group) => `- ${group.name}：${formatRate(group.rate_multiplier)}`));
  }

  lines.push(`更新时间：${generatedAt}`);
  return lines.join("\n");
}

export type QqBotSourceSiteChangeMessageRow = {
  entityType: string;
  entityKey: string;
  field: string;
  oldValue?: string | null;
  newValue?: string | null;
  changeType: string;
  groupName?: string | null;
};

function sourceChangeLabel(change: QqBotSourceSiteChangeMessageRow) {
  return change.groupName || change.entityKey;
}

function sourceChangeValue(value: string | null | undefined) {
  return value === null || value === undefined || value === "" ? "-" : value;
}

export function buildQqBotSourceSiteChangePrivateMessage(input: {
  siteName: string;
  changes: QqBotSourceSiteChangeMessageRow[];
  generatedAt?: Date;
}) {
  const generatedAt = (input.generatedAt ?? new Date()).toLocaleString("zh-CN", { hour12: false });
  const lines = [
    "源站信息变动",
    `源站：${input.siteName}`,
  ];

  if (input.changes.length === 0) {
    lines.push("暂无变动明细");
  } else {
    lines.push(...input.changes.map((change) =>
      `- ${sourceChangeLabel(change)}：${change.field} ${sourceChangeValue(change.oldValue)} -> ${sourceChangeValue(change.newValue)}`,
    ));
  }

  lines.push(`时间：${generatedAt}`);
  return lines.join("\n");
}

function logTime() {
  return new Date().toLocaleTimeString("zh-CN", { hour12: false });
}

const maxWsLogs = 200;
const qqBotRecentLogs = new Map<number, QqBotWsLog[]>();

function createWsLogger(initialLogs: QqBotWsLog[] = [], maxLogs = maxWsLogs) {
  const logs: QqBotWsLog[] = initialLogs;
  const pushLog = (type: string, message: string) => {
    logs.push({ time: logTime(), type, message });
    if (logs.length > maxLogs) {
      logs.splice(0, logs.length - maxLogs);
    }
  };
  return { logs, pushLog };
}

function defaultWsLogs(): QqBotWsLog[] {
  return [
    { time: "--:--:--", type: "listener", message: "等待通过 NapLink 接入 NapCat WebSocket 事件监听" },
    { time: "--:--:--", type: "message", message: "实时接收 NapCat WebSocket 消息并统一格式化输出到日志台" },
  ];
}

function rememberQqBotLogs(connectionId: number, logs: QqBotWsLog[]) {
  qqBotRecentLogs.set(connectionId, logs.slice(-maxWsLogs));
}

function compactJson(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function arrayPayload(value: unknown) {
  if (Array.isArray(value)) return value;
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  if (Array.isArray(record.data)) return record.data;
  if (Array.isArray(record.groups)) return record.groups;
  return [];
}

function nullableNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeQqBotGroups(value: unknown): QqBotGroup[] {
  return arrayPayload(value)
    .map((item) => {
      const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const groupId = record.group_id ?? record.groupId ?? record.id;
      if (groupId === undefined || groupId === null || groupId === "") return null;
      const groupName = record.group_name ?? record.groupName ?? record.name;
      return {
        groupId: String(groupId),
        groupName: typeof groupName === "string" && groupName.trim() ? groupName : `群 ${String(groupId)}`,
        memberCount: nullableNumber(record.member_count ?? record.memberCount),
        maxMemberCount: nullableNumber(record.max_member_count ?? record.maxMemberCount),
      };
    })
    .filter((group): group is QqBotGroup => group !== null);
}

function messageText(record: Record<string, unknown>) {
  if (typeof record.raw_message === "string" && record.raw_message.trim()) return record.raw_message;
  if (typeof record.message === "string" && record.message.trim()) return record.message;
  if (record.message !== undefined) return compactJson(record.message);
  return "";
}

export function normalizeQqBotIncomingMessage(data: unknown): QqBotIncomingMessage {
  const record = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  return {
    messageType: typeof record.message_type === "string" ? record.message_type : "",
    subType: typeof record.sub_type === "string" ? record.sub_type : "",
    groupId: record.group_id === undefined || record.group_id === null ? "" : String(record.group_id),
    userId: record.user_id === undefined || record.user_id === null ? "" : String(record.user_id),
    text: messageText(record),
  };
}

export function isQqBotTargetGroupMessage(message: QqBotIncomingMessage, targetGroupId: string) {
  return message.messageType === "group" && Boolean(targetGroupId.trim()) && message.groupId === targetGroupId.trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isQqBotMentioned(text: string, botUserId: string) {
  const targetBotUserId = botUserId.trim();
  if (!targetBotUserId) return false;
  return new RegExp(`\\[CQ:at,qq=${escapeRegExp(targetBotUserId)}\\]`).test(text);
}

export function isQqBotRateCommand(text: string) {
  return /分组|倍率/.test(text);
}

export function buildQqBotMentionReplyMessage(userId: string, message: string) {
  const targetUserId = userId.trim();
  const content = message.trim();
  return targetUserId ? `[CQ:at,qq=${targetUserId}] ${content}` : content;
}

export function buildQqBotHelpReplyMessage() {
  return [
    "可触发指令",
    "@bot help / @bot 帮助：查看全部可触发指令",
    "@bot 绑定 <邮箱>：绑定当前 QQ 与用户账号",
    "@bot 解绑：解除当前 QQ 的用户绑定",
    "@bot 邀请：查看邀请活动状态和邀请指令",
    "@bot 我的邀请：查看你的今日和历史邀请数据",
    "@bot 邀请排行：查看今日邀请排行榜",
    "@bot 分组 / @bot 倍率 / @bot 当前分组倍率：查看当前已开启分组倍率",
  ].join("\n");
}

type QqBotCommandPrefixDecision =
  | { action: "matched"; message: QqBotIncomingMessage; botUserId: string; commandText: string; reason?: never }
  | { action: "skip"; message: QqBotIncomingMessage; botUserId: string; commandText?: never; reason: string };

function resolveQqBotCommandPrefix(input: {
  settings: Pick<QqBotSettings, "enabled" | "mentionKeywordEnabled" | "targetGroupId" | "botUserId">;
  runtimeBotUserId?: string;
  data?: unknown;
  message?: QqBotIncomingMessage;
  botUserId?: string;
}): QqBotCommandPrefixDecision {
  const message = input.message ?? normalizeQqBotIncomingMessage(input.data);
  const botUserId = (input.botUserId || input.runtimeBotUserId || input.settings.botUserId).trim();

  if (!input.settings.enabled) {
    return { action: "skip", message, botUserId, reason: "QQBot 未启用" };
  }
  if (!input.settings.mentionKeywordEnabled) {
    return { action: "skip", message, botUserId, reason: "@ 关键字触发未开启" };
  }
  if (!isQqBotTargetGroupMessage(message, input.settings.targetGroupId)) {
    return {
      action: "skip",
      message,
      botUserId,
      reason: `非目标 QQ 群消息：收到 ${message.groupId || "-"}，目标 ${input.settings.targetGroupId || "-"}`,
    };
  }
  if (!botUserId) {
    return { action: "skip", message, botUserId, reason: "未获取当前 Bot QQ，无法判断 @ 消息" };
  }

  const commandText = extractQqBotCommandText(message.text, botUserId);
  if (commandText === null) {
    return { action: "skip", message, botUserId, reason: `消息未以 @ 当前 Bot QQ ${botUserId} 作为前缀` };
  }

  return { action: "matched", message, botUserId, commandText };
}

export type QqBotHelpCommandDecision =
  | { action: "reply-help"; message: QqBotIncomingMessage; botUserId: string; reason?: never }
  | { action: "skip"; message: QqBotIncomingMessage; botUserId: string; reason: string };

export function resolveQqBotHelpCommandDecision(input: {
  settings: Pick<QqBotSettings, "enabled" | "mentionKeywordEnabled" | "targetGroupId" | "botUserId">;
  botUserId?: string;
  message: QqBotIncomingMessage;
}): QqBotHelpCommandDecision {
  const prefixDecision = resolveQqBotCommandPrefix({
    settings: input.settings,
    botUserId: input.botUserId,
    message: input.message,
  });

  if (prefixDecision.action === "skip") return prefixDecision;
  if (!["help", "帮助"].includes(prefixDecision.commandText)) {
    return {
      action: "skip",
      message: prefixDecision.message,
      botUserId: prefixDecision.botUserId,
      reason: "未匹配到 QQBot 帮助指令",
    };
  }

  return { action: "reply-help", message: prefixDecision.message, botUserId: prefixDecision.botUserId };
}

export type QqBotMessageCommandDecision =
  | { action: "reply-rate"; message: QqBotIncomingMessage; botUserId: string; reason?: never }
  | { action: "skip"; message: QqBotIncomingMessage; botUserId: string; reason: string };

export function resolveQqBotMessageCommandDecision(input: {
  settings: Pick<QqBotSettings, "enabled" | "mentionKeywordEnabled" | "targetGroupId" | "botUserId">;
  runtimeBotUserId?: string;
  data: unknown;
}): QqBotMessageCommandDecision {
  const prefixDecision = resolveQqBotCommandPrefix({
    settings: input.settings,
    runtimeBotUserId: input.runtimeBotUserId,
    data: input.data,
  });
  if (prefixDecision.action === "skip") return prefixDecision;
  if (!isQqBotRateCommand(prefixDecision.commandText)) {
    return { action: "skip", message: prefixDecision.message, botUserId: prefixDecision.botUserId, reason: "未匹配到 QQBot 指令" };
  }

  return { action: "reply-rate", message: prefixDecision.message, botUserId: prefixDecision.botUserId };
}

function messageCategoryLabel(messageType: string, subType: string) {
  if (messageType === "group" && subType === "normal") return "普通群消息";
  if (messageType === "group") return "群消息";
  if (messageType === "private" && subType === "friend") return "好友私聊";
  if (messageType === "private" && subType === "group") return "群临时会话";
  if (messageType === "private") return "私聊";
  return "所有消息";
}

function formatQqBotMessageLog(data: unknown): QqBotWsLog {
  const message = normalizeQqBotIncomingMessage(data);
  const messageType = message.messageType || "未知类型";
  const subType = message.subType || "未知子类";
  const category = messageCategoryLabel(messageType, subType);
  const groupId = message.groupId;
  const userId = message.userId || "未知用户";
  const text = message.text.slice(0, 120);
  const source = groupId ? `群 ${groupId} 用户 ${userId}` : `用户 ${userId}`;
  return {
    time: logTime(),
    type: "message",
    message: `${category} | ${messageType}/${subType} | ${source}：${text || "空消息"}`,
  };
}

function napLinkUrlWithToken(url: string, token: string) {
  if (!token.trim()) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("access_token", token.trim());
    return parsed.toString();
  } catch {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}access_token=${encodeURIComponent(token.trim())}`;
  }
}

function wsPort(url: URL) {
  if (url.port) return Number(url.port);
  return url.protocol === "wss:" ? 443 : 80;
}

function wsRequestPath(url: URL) {
  return `${url.pathname || "/"}${url.search}`;
}

function socketErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return String(error);
  const code = "code" in error ? String((error as { code?: unknown }).code) : "";
  return code ? `${code}: ${error.message}` : error.message;
}

async function probeTcpPort(url: URL, timeoutMs = 3_000) {
  return await new Promise<{ ok: boolean; message: string }>((resolve) => {
    const port = wsPort(url);
    const socket = net.connect({ host: url.hostname, port });
    const done = (result: { ok: boolean; message: string }) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done({ ok: true, message: `TCP 端口 ${url.hostname}:${port} 可达` }));
    socket.once("timeout", () => done({ ok: false, message: `TCP 端口 ${url.hostname}:${port} 连接超时` }));
    socket.once("error", (error) => done({ ok: false, message: `TCP 端口 ${url.hostname}:${port} 不可达：${socketErrorMessage(error)}` }));
  });
}

async function probeWebSocketHandshake(url: URL, timeoutMs = 3_000) {
  return await new Promise<{ ok: boolean; message: string }>((resolve) => {
    const port = wsPort(url);
    const key = randomBytes(16).toString("base64");
    const request = [
      `GET ${wsRequestPath(url)} HTTP/1.1`,
      `Host: ${url.host}`,
      "Connection: Upgrade",
      "Upgrade: websocket",
      "Sec-WebSocket-Version: 13",
      `Sec-WebSocket-Key: ${key}`,
      "\r\n",
    ].join("\r\n");
    const socket = url.protocol === "wss:"
      ? tls.connect({ host: url.hostname, port, servername: url.hostname })
      : net.connect({ host: url.hostname, port });
    let response = "";

    const done = (result: { ok: boolean; message: string }) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => socket.write(request));
    socket.once("secureConnect", () => socket.write(request));
    socket.on("data", (chunk) => {
      response += chunk.toString("utf8");
      if (!response.includes("\r\n\r\n")) return;
      const statusLine = response.split("\r\n")[0] || "";
      if (/^HTTP\/1\.[01] 101\b/.test(statusLine)) {
        done({ ok: true, message: `WebSocket 握手成功：${statusLine}` });
        return;
      }
      done({ ok: false, message: `WebSocket 握手失败：${statusLine || "无 HTTP 状态行"}` });
    });
    socket.once("timeout", () => done({ ok: false, message: "WebSocket 握手超时" }));
    socket.once("error", (error) => done({ ok: false, message: `WebSocket 握手错误：${socketErrorMessage(error)}` }));
  });
}

async function diagnoseQqBotWsEndpoint(settings: Pick<QqBotSettings, "wsUrl" | "token">, logger: ReturnType<typeof createWsLogger>) {
  const { pushLog } = logger;
  let parsed: URL;

  try {
    parsed = new URL(napLinkUrlWithToken(settings.wsUrl.trim(), settings.token));
  } catch (error) {
    const message = `WebSocket URL 无效：${errorMessage(error)}`;
    pushLog("diagnostic", message);
    return { ok: false, message };
  }

  if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
    const message = `WebSocket URL 协议无效：${parsed.protocol}，请使用 ws:// 或 wss://`;
    pushLog("diagnostic", message);
    return { ok: false, message };
  }

  pushLog("diagnostic", `WebSocket 地址：${parsed.protocol}//${parsed.host}${parsed.pathname || "/"}`);
  const tcp = await probeTcpPort(parsed);
  pushLog("diagnostic", tcp.message);
  if (!tcp.ok) return tcp;

  const handshake = await probeWebSocketHandshake(parsed);
  pushLog("diagnostic", handshake.message);
  return handshake;
}

async function loadNapLink() {
  process.env.WS_NO_BUFFER_UTIL = "1";
  process.env.WS_NO_UTF_8_VALIDATE = "1";
  const { NapLink } = await import("@naplink/naplink");
  return NapLink;
}

async function createQqBotNapLinkClient(
  settings: Pick<QqBotSettings, "wsUrl" | "token">,
  logger = createWsLogger(),
  listeners: {
    onStatus?: (status: QqBotWsListenerStatus) => void;
    onMessage?: (data: unknown) => void | Promise<void>;
  } = {},
) {
  const { logs, pushLog } = logger;
  const NapLink = await loadNapLink();
  const client = new NapLink({
    connection: {
      url: settings.wsUrl.trim(),
      token: settings.token.trim() || undefined,
      timeout: 10_000,
      pingInterval: 0,
    },
    reconnect: {
      enabled: false,
    },
    logging: {
      level: "off",
    },
    api: {
      timeout: 10_000,
      retries: 0,
    },
  });

  client.on("state_change", (state) => {
    const stateText = String(state);
    const normalized = stateText.toLowerCase();
    if (normalized === "connected") listeners.onStatus?.("connected");
    if (normalized === "connecting") listeners.onStatus?.("connecting");
    if (normalized === "disconnected") listeners.onStatus?.("disconnected");
    pushLog("state_change", `连接状态：${stateText}`);
  });
  client.on("connect", () => {
    listeners.onStatus?.("connected");
    pushLog("connect", "NapLink 已连接 NapCat WebSocket");
  });
  client.on("disconnect", () => {
    listeners.onStatus?.("disconnected");
    pushLog("disconnect", "NapLink 已断开");
  });
  client.on("reconnecting", () => {
    listeners.onStatus?.("connecting");
    pushLog("reconnecting", "NapLink 正在重连");
  });
  client.on("connection:restored", () => {
    listeners.onStatus?.("connected");
    pushLog("connection:restored", "NapLink 重连已恢复");
  });
  client.on("connection:lost", () => {
    listeners.onStatus?.("disconnected");
    pushLog("connection:lost", "NapLink 连接已丢失");
  });
  client.on("message", (data) => {
    const log = formatQqBotMessageLog(data);
    pushLog(log.type, log.message);
    void Promise.resolve(listeners.onMessage?.(data)).catch((error) => {
      pushLog("command", `处理 QQBot 消息失败：${errorMessage(error)}`);
    });
  });

  pushLog("listener", "已注册 NapLink connect/disconnect/reconnecting/message 事件监听");
  return { client, logs, pushLog };
}

type QqBotRuntime = {
  client: Awaited<ReturnType<typeof createQqBotNapLinkClient>>["client"];
  logs: QqBotWsLog[];
  pushLog: (type: string, message: string) => void;
  status: QqBotWsListenerStatus;
  startedAt: string;
  groups: QqBotGroup[];
  groupsUpdatedAt: string | null;
  botUserId: string;
  botNickname: string;
  botLoginUpdatedAt: string | null;
};

const qqBotRuntimes = new Map<number, QqBotRuntime>();
const qqBotLastStatus = new Map<number, QqBotWsListenerStatus>();

function runtimeResult(connectionId: number, runtime: QqBotRuntime) {
  const napLinkState = String(runtime.client.getState());
  const connected = runtime.client.isConnected();
  rememberQqBotLogs(connectionId, runtime.logs);
  qqBotLastStatus.set(connectionId, runtime.status);
  return {
    status: runtime.status,
    napLinkState,
    connected,
    running: runtime.status === "connecting" || runtime.status === "connected" || connected,
    startedAt: runtime.startedAt,
    groups: runtime.groups.slice(),
    groupsUpdatedAt: runtime.groupsUpdatedAt,
    botUserId: runtime.botUserId,
    botNickname: runtime.botNickname,
    botLoginUpdatedAt: runtime.botLoginUpdatedAt,
    logs: runtime.logs.slice(),
  };
}

function setRuntimeStatus(connectionId: number, status: QqBotWsListenerStatus) {
  const runtime = qqBotRuntimes.get(connectionId);
  if (runtime) runtime.status = status;
  qqBotLastStatus.set(connectionId, status);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function refreshRuntimeGroups(connectionId: number, runtime: QqBotRuntime) {
  const groups = normalizeQqBotGroups(await runtime.client.getGroupList());
  runtime.groups = groups;
  runtime.groupsUpdatedAt = new Date().toISOString();
  runtime.pushLog("getGroupList", `已获取 ${groups.length} 个 QQ 群`);
  rememberQqBotLogs(connectionId, runtime.logs);
  return groups;
}

async function refreshRuntimeBotLoginInfo(connectionId: number, runtime: QqBotRuntime) {
  const loginInfo = normalizeBotLoginInfo(await runtime.client.getLoginInfo());
  runtime.botUserId = loginInfo.botUserId;
  runtime.botNickname = loginInfo.botNickname;
  runtime.botLoginUpdatedAt = loginInfo.botLoginUpdatedAt;
  await saveQqBotLoginInfo(connectionId, loginInfo);
  runtime.pushLog("getLoginInfo", `已获取当前 Bot QQ：${loginInfo.botUserId || "未知"}${loginInfo.botNickname ? `（${loginInfo.botNickname}）` : ""}`);
  rememberQqBotLogs(connectionId, runtime.logs);
  return loginInfo;
}

async function getSub2ApiClient(connectionId: number) {
  const connection = await db.connection.findUniqueOrThrow({ where: { id: connectionId } });
  return {
    connection,
    sub2Client: new Sub2ApiAdminClient(connection.baseUrl, decrypt(connection.adminApiKey)),
  };
}

async function buildCurrentEnabledGroupRatesMessage(connectionId: number) {
  const { sub2Client } = await getSub2ApiClient(connectionId);
  const groups = await sub2Client.listGroups();
  return buildQqBotRateCommandReplyMessage({ groups });
}

function buildQqBotBindingReplyMessage(input: {
  action: "bind" | "unbind";
  qqUserId: string;
  sub2Email: string;
  sub2UserId: number;
}) {
  const prefix = input.action === "bind" ? "绑定成功" : "解绑成功";
  return `${prefix}：QQ ${input.qqUserId} <-> Sub2 ${input.sub2Email} (#${input.sub2UserId})`;
}

async function sendQqBotReply(runtime: QqBotRuntime, message: QqBotIncomingMessage, content: string) {
  if (message.messageType === "private") {
    await runtime.client.sendPrivateMessage(message.userId, content);
    runtime.pushLog("sendPrivateMessage", `私聊消息已发送到 QQ ${message.userId}`);
    return;
  }
  if (message.messageType === "group") {
    const reply = buildQqBotMentionReplyMessage(message.userId, content);
    await runtime.client.sendGroupMessage(message.groupId, reply);
    runtime.pushLog("sendGroupMessage", `群消息已发送到 QQ 群 ${message.groupId}`);
    return;
  }
  throw new Error(`不支持的消息类型：${message.messageType || "unknown"}`);
}

async function handleQqBotIncomingMessageCommand(connectionId: number, runtime: QqBotRuntime, data: unknown) {
  const settings = await getQqBotSettings(connectionId);
  const message = normalizeQqBotIncomingMessage(data);
  const helpDecision = resolveQqBotHelpCommandDecision({
    settings: {
      enabled: settings.enabled,
      mentionKeywordEnabled: settings.mentionKeywordEnabled,
      targetGroupId: settings.targetGroupId,
      botUserId: settings.botUserId,
    },
    botUserId: runtime.botUserId,
    message,
  });

  if (helpDecision.action === "reply-help") {
    runtime.pushLog("command", `收到 QQ 群 ${message.groupId} 用户 ${message.userId} 帮助指令`);
    await sendQqBotReply(runtime, message, buildQqBotHelpReplyMessage());
    rememberQqBotLogs(connectionId, runtime.logs);
    return;
  }

  const bindingDecision = resolveQqBotUserBindingCommandDecision({
    settings: {
      enabled: settings.enabled,
    },
    botUserId: runtime.botUserId,
    message,
  });

  if (bindingDecision.action === "bind-user" || bindingDecision.action === "unbind-user" || bindingDecision.action === "invalid-bind") {
    if (bindingDecision.action === "invalid-bind") {
      runtime.pushLog("command", `QQBot 绑定指令格式错误：${bindingDecision.reason}`);
      await sendQqBotReply(runtime, message, bindingDecision.reason);
      rememberQqBotLogs(connectionId, runtime.logs);
      return;
    }

    try {
      const { sub2Client } = await getSub2ApiClient(connectionId);
      const result = bindingDecision.action === "bind-user"
        ? await bindQqBotUser({
          db,
          connectionId,
          qqUserId: message.userId,
          email: bindingDecision.email,
          sub2Client,
        })
        : await unbindQqBotUser({
          db,
          connectionId,
          qqUserId: message.userId,
        });
      const reply = buildQqBotBindingReplyMessage({
        action: bindingDecision.action === "bind-user" ? "bind" : "unbind",
        qqUserId: message.userId,
        sub2Email: result.binding.sub2Email,
        sub2UserId: result.binding.sub2UserId,
      });
      runtime.pushLog("command", `${bindingDecision.action === "bind-user" ? "绑定" : "解绑"} QQ ${message.userId} 成功`);
      await sendQqBotReply(runtime, message, reply);
    } catch (error) {
      const errorText = errorMessage(error);
      runtime.pushLog("command", `QQBot 绑定指令失败：${errorText}`);
      await sendQqBotReply(runtime, message, errorText);
    }
    rememberQqBotLogs(connectionId, runtime.logs);
    return;
  }

  const inviteDecision = resolveQqBotAffiliateActivityCommandDecision({
    settings: {
      enabled: settings.enabled,
      mentionKeywordEnabled: settings.mentionKeywordEnabled,
      targetGroupId: settings.targetGroupId,
    },
    botUserId: runtime.botUserId,
    message,
  });

  if (inviteDecision.action === "reply-invite") {
    runtime.pushLog("command", `收到 QQ 群 ${message.groupId} 用户 ${message.userId} 邀请活动指令：${inviteDecision.command}`);
    const result = await handleQqBotAffiliateActivityCommand({
      command: inviteDecision.command,
      connectionId,
      qqUserId: message.userId,
      currentDate: new Date(),
      sendReply: async (content) => sendQqBotReply(runtime, message, content),
    });
    runtime.pushLog("command", result.ok
      ? `邀请活动指令完成：${inviteDecision.command}`
      : `邀请活动指令失败：${result.reason}`);
    rememberQqBotLogs(connectionId, runtime.logs);
    return;
  }

  const decision = resolveQqBotMessageCommandDecision({
    settings,
    runtimeBotUserId: runtime.botUserId,
    data,
  });

  if (decision.action === "skip") {
    runtime.pushLog("command", `跳过消息处理：${decision.reason}`);
    rememberQqBotLogs(connectionId, runtime.logs);
    return;
  }

  runtime.pushLog("command", `收到 QQ 群 ${message.groupId} 用户 ${message.userId} @Bot 指令`);
  const ratesMessage = await buildCurrentEnabledGroupRatesMessage(connectionId);
  runtime.pushLog("command", `匹配分组倍率指令，回复 QQ 群 ${message.groupId} 用户 ${message.userId}`);
  await sendQqBotReply(runtime, message, ratesMessage);
  rememberQqBotLogs(connectionId, runtime.logs);
}

export async function startQqBotWsListener(connectionId: number) {
  const settings = await getQqBotSettings(connectionId);
  const existing = qqBotRuntimes.get(connectionId);
  if (existing) {
    await stopQqBotWsListener(connectionId);
  }

  const previousLogs = qqBotRecentLogs.get(connectionId)?.slice() ?? defaultWsLogs();
  const logger = createWsLogger(previousLogs);
  const { logs, pushLog } = logger;

  if (!settings.wsUrl.trim()) {
    const message = "请先填写 NapCat WebSocket 地址";
    pushLog("validate", message);
    rememberQqBotLogs(connectionId, logs);
    qqBotLastStatus.set(connectionId, "error");
    return { ok: false, message, ...getQqBotWsLogs(connectionId) };
  }

  try {
    const diagnostic = await diagnoseQqBotWsEndpoint(settings, logger);
    if (!diagnostic.ok) {
      rememberQqBotLogs(connectionId, logs);
      qqBotLastStatus.set(connectionId, "error");
      return { ok: false, message: diagnostic.message, ...getQqBotWsLogs(connectionId) };
    }

    let runtime: QqBotRuntime | null = null;
    const created = await createQqBotNapLinkClient(settings, logger, {
      onStatus: (status) => {
        if (runtime) {
          runtime.status = status;
        }
        setRuntimeStatus(connectionId, status);
      },
      onMessage: async (data) => {
        if (!runtime) return;
        await handleQqBotIncomingMessageCommand(connectionId, runtime, data);
      },
    });

    runtime = {
      client: created.client,
      logs,
      pushLog,
      status: "connecting",
      startedAt: new Date().toISOString(),
      groups: [],
      groupsUpdatedAt: null,
      botUserId: settings.botUserId,
      botNickname: settings.botNickname,
      botLoginUpdatedAt: settings.botLoginUpdatedAt,
    };
    qqBotRuntimes.set(connectionId, runtime);
    setRuntimeStatus(connectionId, "connecting");

    pushLog("connect", "开始通过 NapLink 连接 NapCat WebSocket 持续监听");
    await runtime.client.connect();
    runtime.status = "connected";
    setRuntimeStatus(connectionId, "connected");
    const status = await runtime.client.getStatus();
    pushLog("getStatus", `NapCat 状态返回：${compactJson(status)}`);
    try {
      await refreshRuntimeBotLoginInfo(connectionId, runtime);
    } catch (error) {
      pushLog("getLoginInfo", `获取当前 Bot QQ 失败：${errorMessage(error)}`);
    }
    try {
      await refreshRuntimeGroups(connectionId, runtime);
    } catch (error) {
      pushLog("getGroupList", `获取 QQ 群列表失败：${errorMessage(error)}`);
    }

    return {
      ok: true,
      message: "NapLink WebSocket 已开始持续监听",
      napCatStatus: status,
      ...runtimeResult(connectionId, runtime),
    };
  } catch (error) {
    const message = `NapLink WebSocket 监听启动失败：${errorMessage(error)}`;
    pushLog("error", message);
    const failedRuntime = qqBotRuntimes.get(connectionId);
    failedRuntime?.client.disconnect();
    qqBotRuntimes.delete(connectionId);
    rememberQqBotLogs(connectionId, logs);
    qqBotLastStatus.set(connectionId, "error");
    return { ok: false, message, ...getQqBotWsLogs(connectionId) };
  }
}

export async function stopQqBotWsListener(connectionId: number) {
  const runtime = qqBotRuntimes.get(connectionId);
  if (!runtime) {
    const logs = qqBotRecentLogs.get(connectionId)?.slice() ?? defaultWsLogs();
    const logger = createWsLogger(logs);
    logger.pushLog("stop", "当前没有正在运行的 NapLink WebSocket 监听");
    rememberQqBotLogs(connectionId, logs);
    qqBotLastStatus.set(connectionId, "disconnected");
    return {
      ok: true,
      message: "NapLink WebSocket 监听未运行",
      status: "disconnected" as QqBotWsListenerStatus,
      napLinkState: "disconnected",
      connected: false,
      running: false,
      startedAt: null,
      groups: [],
      groupsUpdatedAt: null,
      botUserId: "",
      botNickname: "",
      botLoginUpdatedAt: null,
      logs,
    };
  }

  runtime.pushLog("stop", "停止 NapLink WebSocket 持续监听");
  runtime.status = "disconnected";
  setRuntimeStatus(connectionId, "disconnected");
  runtime.client.disconnect();
  qqBotRuntimes.delete(connectionId);
  rememberQqBotLogs(connectionId, runtime.logs);

  return {
    ok: true,
    message: "NapLink WebSocket 监听已停止",
    status: "disconnected" as QqBotWsListenerStatus,
    napLinkState: "disconnected",
    connected: false,
    running: false,
    startedAt: runtime.startedAt,
    groups: runtime.groups.slice(),
    groupsUpdatedAt: runtime.groupsUpdatedAt,
    botUserId: runtime.botUserId,
    botNickname: runtime.botNickname,
    botLoginUpdatedAt: runtime.botLoginUpdatedAt,
    logs: runtime.logs.slice(),
  };
}

export function getQqBotWsLogs(connectionId: number) {
  const runtime = qqBotRuntimes.get(connectionId);
  if (runtime) return runtimeResult(connectionId, runtime);

  const logs = qqBotRecentLogs.get(connectionId)?.slice() ?? defaultWsLogs();
  const status = qqBotLastStatus.get(connectionId) ?? "idle";
  return {
    status,
    napLinkState: status,
    connected: false,
    running: false,
    startedAt: null,
    groups: [],
    groupsUpdatedAt: null,
    botUserId: "",
    botNickname: "",
    botLoginUpdatedAt: null,
    logs,
  };
}

export async function getQqBotGroups(connectionId: number) {
  const runtime = qqBotRuntimes.get(connectionId);
  if (!runtime || !runtime.client.isConnected()) {
    const snapshot = getQqBotWsLogs(connectionId);
    return {
      ok: false,
      message: "请先连接 NapCat WebSocket",
      groups: runtime?.groups.slice() ?? [],
      groupsUpdatedAt: runtime?.groupsUpdatedAt ?? null,
      logs: snapshot.logs,
    };
  }

  try {
    const groups = await refreshRuntimeGroups(connectionId, runtime);
    return {
      ok: true,
      message: `已获取 ${groups.length} 个 QQ 群`,
      groups,
      groupsUpdatedAt: runtime.groupsUpdatedAt,
      logs: runtime.logs.slice(),
    };
  } catch (error) {
    const message = `获取 QQ 群列表失败：${errorMessage(error)}`;
    runtime.pushLog("getGroupList", message);
    rememberQqBotLogs(connectionId, runtime.logs);
    return {
      ok: false,
      message,
      groups: runtime.groups.slice(),
      groupsUpdatedAt: runtime.groupsUpdatedAt,
      logs: runtime.logs.slice(),
    };
  }
}

export async function testQqBotWsConnection(connectionId: number) {
  const settings = await getQqBotSettings(connectionId);
  if (!settings.wsUrl.trim()) {
    const { logs, pushLog } = createWsLogger();
    const message = "请先填写 NapCat WebSocket 地址";
    pushLog("validate", message);
    rememberQqBotLogs(connectionId, logs);
    qqBotLastStatus.set(connectionId, "error");
    return { ok: false, message, status: null, logs };
  }

  const logger = createWsLogger();
  const { logs, pushLog } = logger;
  let napLinkClient: Awaited<ReturnType<typeof createQqBotNapLinkClient>>["client"] | null = null;
  const rememberTestLogs = (status: QqBotWsListenerStatus) => {
    rememberQqBotLogs(connectionId, logs);
    qqBotLastStatus.set(connectionId, status);
  };
  try {
    const diagnostic = await diagnoseQqBotWsEndpoint(settings, logger);
    if (!diagnostic.ok) {
      rememberTestLogs("error");
      return {
        ok: false,
        message: diagnostic.message,
        status: null,
        logs,
      };
    }

    const { client } = await createQqBotNapLinkClient(settings, logger);
    napLinkClient = client;
    pushLog("connect", "开始通过 NapLink 连接 NapCat WebSocket");
    await client.connect();
    const status = await client.getStatus();
    pushLog("getStatus", `NapCat 状态返回：${compactJson(status)}`);

    rememberTestLogs("disconnected");
    return {
      ok: true,
      message: "NapLink WebSocket 连接正常",
      status,
      logs,
    };
  } catch (error) {
    const message = `NapLink WebSocket 连接失败：${errorMessage(error)}`;
    pushLog("error", message);
    rememberTestLogs("error");
    return {
      ok: false,
      message,
      status: null,
      logs,
    };
  } finally {
    napLinkClient?.disconnect();
    rememberQqBotLogs(connectionId, logs);
  }
}

async function sendWithQqBotClient<T>(
  connectionId: number,
  action: (client: QqBotRuntime["client"], pushLog: QqBotRuntime["pushLog"]) => Promise<T>,
) {
  const runtime = qqBotRuntimes.get(connectionId);
  if (runtime?.client.isConnected()) {
    try {
      const result = await action(runtime.client, runtime.pushLog);
      return { result, logs: runtime.logs.slice() };
    } finally {
      rememberQqBotLogs(connectionId, runtime.logs);
    }
  }

  const settings = await getQqBotSettings(connectionId);
  if (!settings.wsUrl.trim()) throw new Error("请先填写 NapCat WebSocket 地址");

  const { client, logs, pushLog } = await createQqBotNapLinkClient(settings);
  try {
    pushLog("connect", "开始通过 NapLink 临时连接 NapCat WebSocket");
    await client.connect();
    try {
      const loginInfo = normalizeBotLoginInfo(await client.getLoginInfo());
      await saveQqBotLoginInfo(connectionId, loginInfo);
      pushLog("getLoginInfo", `已获取当前 Bot QQ：${loginInfo.botUserId || "未知"}${loginInfo.botNickname ? `（${loginInfo.botNickname}）` : ""}`);
    } catch (error) {
      pushLog("getLoginInfo", `获取当前 Bot QQ 失败：${errorMessage(error)}`);
    }
    const result = await action(client, pushLog);
    return { result, logs };
  } finally {
    client.disconnect();
    rememberQqBotLogs(connectionId, logs);
  }
}

export async function sendQqBotGroupMessage(connectionId: number, groupId: string, message: string) {
  const targetGroupId = groupId.trim();
  const content = message.trim();
  if (!targetGroupId) throw new Error("请先选择目标 QQ 群");
  if (!content) throw new Error("请先填写要发送的消息");

  const sent = await sendWithQqBotClient(connectionId, async (client, pushLog) => {
    pushLog("sendGroupMessage", `开始发送群消息到 QQ 群 ${targetGroupId}`);
    const result = await client.sendGroupMessage(targetGroupId, content);
    pushLog("sendGroupMessage", `群消息已发送到 QQ 群 ${targetGroupId}`);
    return result;
  });

  return {
    ok: true,
    targetType: "group" as const,
    targetId: targetGroupId,
    message: content,
    result: sent.result,
    logs: sent.logs,
  };
}

export async function sendQqBotPrivateMessage(connectionId: number, userId: string, message: string) {
  const targetUserId = userId.trim();
  const content = message.trim();
  if (!targetUserId) throw new Error("请先填写目标 QQ 号");
  if (!content) throw new Error("请先填写要发送的消息");

  const sent = await sendWithQqBotClient(connectionId, async (client, pushLog) => {
    pushLog("sendPrivateMessage", `开始发送私聊消息到 QQ ${targetUserId}`);
    const result = await client.sendPrivateMessage(targetUserId, content);
    pushLog("sendPrivateMessage", `私聊消息已发送到 QQ ${targetUserId}`);
    return result;
  });

  return {
    ok: true,
    targetType: "private" as const,
    targetId: targetUserId,
    message: content,
    result: sent.result,
    logs: sent.logs,
  };
}

export async function sendQqBotManualMessage(connectionId: number, input: { targetType: "group" | "private"; targetId: string; message: string }) {
  if (input.targetType === "private") {
    return sendQqBotPrivateMessage(connectionId, input.targetId, input.message);
  }
  return sendQqBotGroupMessage(connectionId, input.targetId, input.message);
}

export async function sendQqBotTargetGroupRateChangePush(input: {
  connectionId: number;
  changedGroupName: string;
  oldRate?: number | null;
  newRate: number;
  groups: Sub2ApiGroup[];
  generatedAt?: Date;
}) {
  const settings = await getQqBotSettings(input.connectionId);
  if (!settings.enabled || !settings.rateChangePushEnabled || !settings.targetGroupId.trim()) {
    return { ok: false as const, skipped: true as const, reason: "QQBot target group rate change push disabled or incomplete" };
  }

  const message = buildQqBotTargetGroupRateChangeMessage({
    changedGroupName: input.changedGroupName,
    oldRate: input.oldRate,
    newRate: input.newRate,
    groups: input.groups,
    generatedAt: input.generatedAt,
  });
  const sent = await sendQqBotGroupMessage(input.connectionId, settings.targetGroupId, message);
  return { ok: true as const, skipped: false as const, message, logs: sent.logs };
}

export async function sendQqBotSourceSiteChangePrivatePush(input: {
  connectionId: number;
  siteName: string;
  changes: QqBotSourceSiteChangeMessageRow[];
  generatedAt?: Date;
}) {
  const settings = await getQqBotSettings(input.connectionId);
  if (!settings.enabled || !settings.sourceChangePrivatePushEnabled || !settings.sourceChangePrivatePushQq.trim()) {
    return { ok: false as const, skipped: true as const, reason: "QQBot source site change private push disabled or incomplete" };
  }

  const message = buildQqBotSourceSiteChangePrivateMessage({
    siteName: input.siteName,
    changes: input.changes,
    generatedAt: input.generatedAt,
  });
  const sent = await sendQqBotPrivateMessage(input.connectionId, settings.sourceChangePrivatePushQq, message);
  return { ok: true as const, skipped: false as const, message, logs: sent.logs };
}

export async function sendQqBotTestAnalysis(connectionId: number) {
  const [settings, connection] = await Promise.all([
    getQqBotSettings(connectionId),
    db.connection.findUniqueOrThrow({ where: { id: connectionId } }),
  ]);

  if (!settings.enabled) throw new Error("请先启用 QQBot");
  if (!settings.targetGroupId.trim()) throw new Error("请先填写目标 QQ 群号");
  if (!settings.wsUrl.trim()) throw new Error("请先填写 NapCat WebSocket 地址");

  const sub2Client = new Sub2ApiAdminClient(connection.baseUrl, decrypt(connection.adminApiKey));
  const groups = await sub2Client.listGroups();
  const message = buildEnabledGroupRatesMessage({
    connectionName: connection.name,
    groups,
    template: settings.testMessageTemplate,
  });

  const sent = await sendQqBotGroupMessage(connectionId, settings.targetGroupId, message);
  return {
    ok: true,
    groupCount: groups.filter(isEnabledGroup).length,
    message,
    logs: sent.logs,
  };
}
