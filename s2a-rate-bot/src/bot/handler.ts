import type { TargetSettings, TargetGroupSnapshot } from "../storage/app-config.ts";
import {
  buildBotHelpReply,
  buildRateCommandReply,
  resolveBotCommand,
  type BotSettings,
  type IncomingBotMessage,
} from "./command.ts";
import {
  buildInviteHelpReply,
  buildInviteLeaderboardReply,
  buildMyInviteReply,
} from "./invite-activity.ts";
import { loadInviteActivitySummary, type InviteActivityClient } from "./scheduler.ts";
import type { BotStorage } from "./storage.ts";

export type BotCommandMessenger = {
  readonly sendGroupMessage: (groupId: string, message: string) => Promise<void>;
  readonly sendPrivateMessage: (userId: string, message: string) => Promise<void>;
};

export async function handleIncomingBotMessage(input: {
  readonly now: Date;
  readonly settings: BotSettings;
  readonly target: TargetSettings;
  readonly targetGroups: readonly TargetGroupSnapshot[];
  readonly storage: BotStorage;
  readonly client: InviteActivityClient;
  readonly messenger: BotCommandMessenger;
  readonly data: unknown;
}) {
  const message = normalizeIncomingBotMessage(input.data);
  const decision = resolveBotCommand({ settings: input.settings, message });
  if (decision.action === "skip") return decision;

  if (decision.action === "reply-help") {
    await replyGroup(input.messenger, message, buildBotHelpReply());
    return decision;
  }
  if (decision.action === "reply-rate") {
    await replyGroup(input.messenger, message, buildRateCommandReply({
      groups: input.targetGroups.map((group) => ({
        id: group.id,
        name: group.name,
        status: group.status,
        rateMultiplier: group.rate_multiplier ?? 0,
      })),
    }));
    return decision;
  }
  if (decision.action === "bind-user") {
    const user = await findUniqueUser(input.client, decision.email);
    await input.storage.upsertUserBinding({
      qqUserId: decision.userId,
      sub2UserId: user.id,
      sub2Email: user.email,
      sub2SnapshotJson: JSON.stringify(user),
    });
    await replyGroup(input.messenger, message, `绑定成功：QQ ${decision.userId} <-> Sub2 ${user.email} (#${user.id})`);
    return decision;
  }
  if (decision.action === "unbind-user") {
    const deleted = await input.storage.deleteUserBinding(decision.userId);
    await replyGroup(input.messenger, message, deleted
      ? `解绑成功：QQ ${deleted.qqUserId} <-> Sub2 ${deleted.sub2Email} (#${deleted.sub2UserId})`
      : "当前 QQ 未绑定任何 Sub2 用户");
    return decision;
  }

  const settings = await input.client.getSettings();
  if (decision.inviteCommand === "help") {
    await replyGroup(input.messenger, message, buildInviteHelpReply(Boolean(settings.affiliate_enabled)));
    return decision;
  }
  const summary = await loadInviteActivitySummary({
    now: input.now,
    client: input.client,
    activityEnabled: input.settings.scheduledStatsEnabled,
    startDate: input.settings.inviteActivityStartDate,
    activeRewardAmount: input.settings.inviteActivityActiveRewardAmount,
    inactiveRewardAmount: input.settings.inviteActivityInactiveRewardAmount,
  });
  if (decision.inviteCommand === "leaderboard") {
    await replyGroup(input.messenger, message, buildInviteLeaderboardReply(summary));
    return decision;
  }
  const binding = await input.storage.findBindingByQqUserId(decision.userId);
  if (!binding) {
    await replyGroup(input.messenger, message, "请先绑定 Sub2 用户后再查询邀请活动");
    return decision;
  }
  await replyGroup(input.messenger, message, buildMyInviteReply(summary, binding.sub2UserId));
  return decision;
}

export function normalizeIncomingBotMessage(data: unknown): IncomingBotMessage {
  const record = data && typeof data === "object" ? data as Record<string, unknown> : {};
  return {
    messageType: text(record.message_type),
    groupId: record.group_id === undefined || record.group_id === null ? "" : String(record.group_id),
    userId: record.user_id === undefined || record.user_id === null ? "" : String(record.user_id),
    text: messageText(record),
  };
}

export function buildMentionReply(userId: string, message: string) {
  const targetUserId = userId.trim();
  const content = message.trim();
  return targetUserId ? `[CQ:at,qq=${targetUserId}] ${content}` : content;
}

async function replyGroup(messenger: BotCommandMessenger, message: IncomingBotMessage, content: string) {
  await messenger.sendGroupMessage(message.groupId, buildMentionReply(message.userId, content));
}

async function findUniqueUser(client: InviteActivityClient, email: string) {
  const result = await client.searchUsers({ page: 1, pageSize: 50, search: email });
  const normalized = email.trim().toLowerCase();
  const matches = result.items.filter((item) => item.email.trim().toLowerCase() === normalized);
  if (matches.length !== 1) throw new Error("未找到唯一匹配的 Sub2 用户");
  return matches[0]!;
}

function messageText(record: Record<string, unknown>) {
  if (typeof record.raw_message === "string") return record.raw_message;
  if (typeof record.message === "string") return record.message;
  return "";
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}
