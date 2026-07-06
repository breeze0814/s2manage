import { formatRateMultiplier } from "../core/rates.ts";

export type BotSettings = {
  readonly enabled: boolean;
  readonly mentionCommandEnabled: boolean;
  readonly targetGroupId: string;
  readonly botUserId: string;
};

export type IncomingBotMessage = {
  readonly messageType: string;
  readonly groupId: string;
  readonly userId: string;
  readonly text: string;
};

export type BotCommandDecision =
  | {
    readonly action: "reply-rate";
    readonly groupId: string;
    readonly userId: string;
  }
  | {
    readonly action: "skip";
    readonly reason: string;
  };

export type RateGroupSnapshot = {
  readonly id: number;
  readonly name: string;
  readonly status: string | null;
  readonly rateMultiplier: number;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractMentionCommand(text: string, botUserId: string) {
  const targetBotUserId = botUserId.trim();
  const normalizedText = text.trim();
  if (!targetBotUserId || !normalizedText) return null;
  const pattern = new RegExp(`^\\[CQ:at,qq=${escapeRegExp(targetBotUserId)}\\]\\s*([\\s\\S]*)$`, "u");
  const match = pattern.exec(normalizedText);
  return match ? (match[1] ?? "").trim() : null;
}

function isRateCommand(commandText: string) {
  return /分组|倍率/.test(commandText);
}

function isActiveGroup(group: RateGroupSnapshot) {
  const status = String(group.status ?? "active").toLowerCase();
  return !["disabled", "disable", "inactive", "off", "0", "false"].includes(status);
}

export function resolveBotCommand(input: {
  readonly settings: BotSettings;
  readonly message: IncomingBotMessage;
}): BotCommandDecision {
  if (!input.settings.enabled) return { action: "skip", reason: "QQBot 未启用" };
  if (!input.settings.mentionCommandEnabled) return { action: "skip", reason: "@ 指令触发未开启" };
  if (input.message.messageType !== "group" || input.message.groupId !== input.settings.targetGroupId.trim()) {
    return {
      action: "skip",
      reason: `非目标 QQ 群消息：收到 ${input.message.groupId || "-"}，目标 ${input.settings.targetGroupId || "-"}`,
    };
  }
  const commandText = extractMentionCommand(input.message.text, input.settings.botUserId);
  if (commandText === null) {
    return { action: "skip", reason: `消息未以 @ 当前 Bot QQ ${input.settings.botUserId} 作为前缀` };
  }
  if (!isRateCommand(commandText)) return { action: "skip", reason: "未匹配到倍率查询指令" };
  return { action: "reply-rate", groupId: input.message.groupId, userId: input.message.userId };
}

export function buildRateCommandReply(input: {
  readonly groups: readonly RateGroupSnapshot[];
  readonly generatedAt?: Date;
}) {
  const generatedAt = (input.generatedAt ?? new Date()).toLocaleString("zh-CN", { hour12: false });
  const activeGroups = input.groups.filter(isActiveGroup);
  const lines = ["当前分组倍率"];
  if (activeGroups.length === 0) {
    lines.push("暂无已开启分组");
  } else {
    lines.push(...activeGroups.map((group) => `- ${group.name}：${formatRateMultiplier(group.rateMultiplier)}`));
  }
  lines.push(`更新时间：${generatedAt}`);
  return lines.join("\n");
}
