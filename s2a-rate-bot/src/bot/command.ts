import { formatRateMultiplier } from "../core/rates.ts";

export type BotSettings = {
  readonly enabled: boolean;
  readonly mentionCommandEnabled: boolean;
  readonly commandSettings?: Partial<BotCommandSettings>;
  readonly targetGroupId: string;
  readonly botUserId: string;
  readonly scheduledStatsEnabled?: boolean;
  readonly inviteActivityStartDate?: string;
  readonly inviteActivityActiveRewardAmount?: number | null;
  readonly inviteActivityInactiveRewardAmount?: number | null;
};

export type BotCommandSettings = {
  readonly help: boolean;
  readonly rate: boolean;
  readonly bind: boolean;
  readonly unbind: boolean;
  readonly inviteHelp: boolean;
  readonly inviteMine: boolean;
  readonly inviteLeaderboard: boolean;
};

export type IncomingBotMessage = {
  readonly messageType: string;
  readonly groupId: string;
  readonly userId: string;
  readonly text: string;
};

export type InviteCommand = "help" | "my-invite" | "leaderboard";

export type BotCommandDecision =
  | {
    readonly action: "reply-help";
    readonly groupId: string;
    readonly userId: string;
  }
  | {
    readonly action: "reply-rate";
    readonly groupId: string;
    readonly userId: string;
  }
  | {
    readonly action: "bind-user";
    readonly groupId: string;
    readonly userId: string;
    readonly email: string;
  }
  | {
    readonly action: "unbind-user";
    readonly groupId: string;
    readonly userId: string;
  }
  | {
    readonly action: "reply-invite";
    readonly groupId: string;
    readonly userId: string;
    readonly inviteCommand: InviteCommand;
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

function inviteCommand(commandText: string): InviteCommand | null {
  if (commandText === "邀请") return "help";
  if (commandText === "我的邀请") return "my-invite";
  if (commandText === "邀请排行") return "leaderboard";
  return null;
}

function commandEnabled(settings: BotSettings, command: keyof BotCommandSettings) {
  return settings.commandSettings?.[command] !== false;
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

  if (["help", "帮助"].includes(commandText)) {
    if (!commandEnabled(input.settings, "help")) return { action: "skip", reason: "帮助指令已关闭" };
    return { action: "reply-help", groupId: input.message.groupId, userId: input.message.userId };
  }
  const bindMatch = /^绑定\s+(.+)$/u.exec(commandText);
  if (bindMatch) {
    if (!commandEnabled(input.settings, "bind")) return { action: "skip", reason: "绑定指令已关闭" };
    const email = (bindMatch[1] ?? "").trim().toLowerCase();
    if (!email) return { action: "skip", reason: "绑定指令格式应为：绑定 xxxx@example.com" };
    return { action: "bind-user", groupId: input.message.groupId, userId: input.message.userId, email };
  }
  if (commandText === "解绑") {
    if (!commandEnabled(input.settings, "unbind")) return { action: "skip", reason: "解绑指令已关闭" };
    return { action: "unbind-user", groupId: input.message.groupId, userId: input.message.userId };
  }
  const invite = inviteCommand(commandText);
  if (invite) {
    const toggle = invite === "help" ? "inviteHelp" : invite === "my-invite" ? "inviteMine" : "inviteLeaderboard";
    const label = invite === "help" ? "邀请说明" : invite === "my-invite" ? "我的邀请" : "邀请排行";
    if (!commandEnabled(input.settings, toggle)) return { action: "skip", reason: `${label}指令已关闭` };
    return {
      action: "reply-invite",
      groupId: input.message.groupId,
      userId: input.message.userId,
      inviteCommand: invite,
    };
  }
  if (!isRateCommand(commandText)) return { action: "skip", reason: "未匹配到 QQBot 指令" };
  if (!commandEnabled(input.settings, "rate")) return { action: "skip", reason: "倍率查询指令已关闭" };
  return { action: "reply-rate", groupId: input.message.groupId, userId: input.message.userId };
}

export function buildBotHelpReply() {
  return [
    "可触发指令",
    "@bot help / @bot 帮助：查看全部可触发指令",
    "@bot 绑定 <邮箱>：绑定当前 QQ 与用户账号",
    "@bot 解绑：解除当前 QQ 的用户绑定",
    "@bot 邀请：查看邀请活动状态和邀请指令",
    "@bot 我的邀请：查看你的本期邀请和奖励",
    "@bot 邀请排行：查看本期邀请排行榜",
    "@bot 分组 / @bot 倍率 / @bot 当前分组倍率：查看当前已开启分组倍率",
  ].join("\n");
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
