import { db } from "@/server/db";
import { decrypt } from "@/server/crypto";
import {
  Sub2ApiAdminClient,
  type Sub2ApiAffiliateInvite,
  type Sub2ApiUser,
} from "@/server/clients/sub2api-admin";
import { extractQqBotCommandText } from "@/server/qqbot-command";
import {
  ACTIVE_REWARD_SETTING_KEY,
  INACTIVE_REWARD_SETTING_KEY,
  calculateInviteActivityRewards,
  inviteActivityPeriodForDate,
  rewardConfigFromSettings,
  type InviteActivityLeaderboardEntry,
  type InviteActivityPeriod,
  type InviteActivityRewardConfig,
} from "@/server/invite-activity-rewards";

type BindingRow = {
  connectionId: number;
  qqUserId: string;
  sub2UserId: number;
  sub2Email: string;
};

type QqBotAffiliateActivityDb = {
  connection?: {
    findUniqueOrThrow(args: { where: { id: number } }): Promise<{ baseUrl: string; adminApiKey: string }>;
  };
  qqBotUserBinding: {
    findUnique(args: { where: { connectionId_qqUserId: { connectionId: number; qqUserId: string } } }): Promise<BindingRow | null>;
  };
};

type QqBotAffiliateActivitySub2Client = Pick<
  Sub2ApiAdminClient,
  "getSettings" | "listAffiliateInvites" | "searchUsers" | "updateSettings"
>;

type ViewerInviteActivity = {
  qqUserId: string;
  sub2UserId: number;
  totalInvitees: number;
  activeInviteeCount: number;
  inactiveInviteeCount: number;
  rewardAmount: number | null;
};

export type QqBotAffiliateActivityCommand = "help" | "my-invite" | "leaderboard";

export type QqBotAffiliateActivitySummary = {
  date: string;
  period: InviteActivityPeriod;
  affiliateEnabled: boolean;
  rewardConfig: InviteActivityRewardConfig;
  periodInviteeCount: number;
  activeInviteeCount: number;
  inactiveInviteeCount: number;
  missingUserCount: number;
  viewer?: ViewerInviteActivity;
  leaderboard: InviteActivityLeaderboardEntry[];
};

const INVITES_PAGE_SIZE = 20;
const USERS_PAGE_SIZE = 100;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function ensureBinding(dbClient: QqBotAffiliateActivityDb, connectionId: number, qqUserId: string) {
  return dbClient.qqBotUserBinding.findUnique({
    where: { connectionId_qqUserId: { connectionId, qqUserId } },
  });
}

function targetGroupSkipReason(message: { messageType: string; groupId: string }, targetGroupId: string) {
  const target = targetGroupId.trim();
  if (!target) return "未配置目标 QQ 群";
  if (message.messageType === "group" && message.groupId === target) return null;
  return `非目标 QQ 群消息：收到 ${message.groupId || "-"}，目标 ${target}`;
}

function formatRewardAmount(value: number | null) {
  if (value === null) return "未配置";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function buildInviteHelpReply(affiliateEnabled: boolean) {
  return [
    "邀请活动",
    `邀请活动状态：${affiliateEnabled ? "已开启" : "未开启"}`,
    "邀请相关指令：",
    "@bot 邀请：查看邀请活动状态和可用指令",
    "@bot 我的邀请：查看你的本期邀请和奖励",
    "@bot 邀请排行：查看本期邀请排行榜",
  ].join("\n");
}

function buildMyInviteReply(summary: QqBotAffiliateActivitySummary) {
  const lines = [
    "我的邀请",
    `三日周期：${summary.period.startDate} 至 ${summary.period.endDate}`,
    `邀请活动状态：${summary.affiliateEnabled ? "已开启" : "未开启"}`,
  ];

  if (!summary.rewardConfig.configured) lines.push("奖励额度：未配置，暂不计算奖励");
  if (summary.viewer) {
    lines.push(`你的本期邀请：总计 ${summary.viewer.totalInvitees}，活跃 ${summary.viewer.activeInviteeCount}，非活跃 ${summary.viewer.inactiveInviteeCount}，奖励 ${formatRewardAmount(summary.viewer.rewardAmount)}`);
  }

  return lines.join("\n");
}

function buildInviteLeaderboardReply(summary: QqBotAffiliateActivitySummary) {
  const lines = [
    "邀请活动排行榜",
    `三日周期：${summary.period.startDate} 至 ${summary.period.endDate}`,
    `周期邀请数：总计 ${summary.periodInviteeCount}，活跃 ${summary.activeInviteeCount}，非活跃 ${summary.inactiveInviteeCount}`,
  ];

  if (!summary.rewardConfig.configured) lines.push("奖励额度：未配置，暂不计算奖励");
  if (summary.leaderboard.length === 0) {
    lines.push("暂无邀请数据");
  } else {
    lines.push(...summary.leaderboard.map((entry, index) =>
      `${index + 1}. ${entry.inviterUsername || entry.inviterEmail} (${entry.inviterEmail})，总计 ${entry.total}，活跃 ${entry.activeInviteeCount}，非活跃 ${entry.inactiveInviteeCount}，奖励 ${formatRewardAmount(entry.rewardAmount)}`,
    ));
  }
  return lines.join("\n");
}

export function resolveQqBotAffiliateActivityCommandDecision(input: {
  settings: Pick<{ enabled: boolean; mentionKeywordEnabled: boolean; targetGroupId: string }, "enabled" | "mentionKeywordEnabled" | "targetGroupId">;
  botUserId: string;
  message: { messageType: string; subType: string; groupId: string; userId: string; text: string };
}) {
  if (!input.settings.enabled) return { action: "skip" as const, reason: "QQBot 未启用" };
  if (!input.settings.mentionKeywordEnabled) return { action: "skip" as const, reason: "@ 关键字触发未开启" };
  const groupSkipReason = targetGroupSkipReason(input.message, input.settings.targetGroupId);
  if (groupSkipReason) return { action: "skip" as const, reason: groupSkipReason };

  const botUserId = input.botUserId.trim();
  if (!botUserId) return { action: "skip" as const, reason: "未获取当前 Bot QQ，无法判断 @ 消息" };

  const commandText = extractQqBotCommandText(input.message.text, botUserId);
  if (commandText === null) return { action: "skip" as const, reason: `消息未以 @ 当前 Bot QQ ${botUserId} 作为前缀` };
  const commandByText: Record<string, QqBotAffiliateActivityCommand> = {
    邀请: "help",
    我的邀请: "my-invite",
    邀请排行: "leaderboard",
  };
  const command = commandByText[commandText];
  if (!command) return { action: "skip" as const, reason: "未匹配到 QQBot 邀请活动指令" };

  return { action: "reply-invite" as const, command };
}

export async function loadQqBotAffiliateActivity(input: {
  connectionId: number;
  qqUserId?: string;
  requireViewerBinding?: boolean;
  currentDate?: Date;
  dbClient?: QqBotAffiliateActivityDb;
  sub2Client?: QqBotAffiliateActivitySub2Client;
}) {
  const dbClient = input.dbClient ?? db;
  const viewerBinding = input.qqUserId ? await ensureBinding(dbClient, input.connectionId, input.qqUserId) : null;
  if (input.qqUserId && input.requireViewerBinding !== false && !viewerBinding) throw new Error("请先绑定 Sub2 用户后再查询邀请活动");

  const sub2Client = await resolveSub2Client(dbClient, input.connectionId, input.sub2Client);
  const settings = await sub2Client.getSettings();
  const period = inviteActivityPeriodForDate(input.currentDate ?? new Date());
  const [periodInvites, users] = await Promise.all([
    fetchAllAffiliateInvites(sub2Client, { startAt: period.startDate, endAt: period.endDate }),
    fetchAllUsers(sub2Client),
  ]);
  const rewardSummary = calculateInviteActivityRewards({
    period,
    rewardConfig: rewardConfigFromSettings(settings),
    invites: periodInvites,
    users,
  });

  return {
    ok: true,
    summary: toQqBotSummary(Boolean(settings.affiliate_enabled), rewardSummary, viewerBinding),
  };
}

export async function handleQqBotAffiliateActivityCommand(input: {
  command?: QqBotAffiliateActivityCommand;
  connectionId: number;
  qqUserId: string;
  dbClient?: QqBotAffiliateActivityDb;
  sub2Client?: QqBotAffiliateActivitySub2Client;
  currentDate?: Date;
  sendReply: (message: string) => Promise<void>;
}) {
  const dbClient = input.dbClient ?? db;
  const sub2Client = await resolveSub2Client(dbClient, input.connectionId, input.sub2Client);
  const settings = await sub2Client.getSettings();
  const command = input.command ?? "my-invite";
  if (command === "help") {
    const message = buildInviteHelpReply(Boolean(settings.affiliate_enabled));
    await input.sendReply(message);
    return { ok: true as const };
  }

  if (!settings.affiliate_enabled) {
    const message = "邀请活动未开启";
    await input.sendReply(message);
    return { ok: false as const, reason: message };
  }

  try {
    const result = await loadQqBotAffiliateActivity({
      connectionId: input.connectionId,
      qqUserId: input.qqUserId,
      requireViewerBinding: command === "my-invite",
      currentDate: input.currentDate,
      dbClient,
      sub2Client,
    });
    const message = command === "leaderboard"
      ? buildInviteLeaderboardReply(result.summary)
      : buildMyInviteReply(result.summary);
    await input.sendReply(message);
    return { ok: true as const, summary: result.summary };
  } catch (error) {
    const message = errorMessage(error);
    await input.sendReply(message);
    return { ok: false as const, reason: message };
  }
}

export async function setQqBotAffiliateActivityEnabled(input: {
  connectionId: number;
  enabled: boolean;
  dbClient?: QqBotAffiliateActivityDb;
  sub2Client?: QqBotAffiliateActivitySub2Client;
}) {
  const dbClient = input.dbClient ?? db;
  const sub2Client = await resolveSub2Client(dbClient, input.connectionId, input.sub2Client);
  await sub2Client.updateSettings({ affiliate_enabled: input.enabled });
  return { ok: true, enabled: input.enabled };
}

export async function setQqBotInviteActivityRewardConfig(input: {
  connectionId: number;
  activeRewardAmount: number;
  inactiveRewardAmount: number;
  dbClient?: QqBotAffiliateActivityDb;
  sub2Client?: QqBotAffiliateActivitySub2Client;
}) {
  const dbClient = input.dbClient ?? db;
  const sub2Client = await resolveSub2Client(dbClient, input.connectionId, input.sub2Client);
  const config = rewardConfigFromSettings({
    [ACTIVE_REWARD_SETTING_KEY]: input.activeRewardAmount,
    [INACTIVE_REWARD_SETTING_KEY]: input.inactiveRewardAmount,
  });
  await sub2Client.updateSettings({
    [ACTIVE_REWARD_SETTING_KEY]: input.activeRewardAmount,
    [INACTIVE_REWARD_SETTING_KEY]: input.inactiveRewardAmount,
  });
  return { ok: true, config };
}

async function resolveSub2Client(
  dbClient: QqBotAffiliateActivityDb,
  connectionId: number,
  sub2Client?: QqBotAffiliateActivitySub2Client,
) {
  if (sub2Client) return sub2Client;
  const connection = await dbClient.connection?.findUniqueOrThrow({ where: { id: connectionId } });
  if (!connection) throw new Error("未找到连接信息");
  return new Sub2ApiAdminClient(connection.baseUrl, decrypt(connection.adminApiKey));
}

async function replyDisabled(sendReply: (message: string) => Promise<void>) {
  const message = "邀请活动未开启";
  await sendReply(message);
  return { ok: false as const, reason: message };
}

function toQqBotSummary(
  affiliateEnabled: boolean,
  rewardSummary: ReturnType<typeof calculateInviteActivityRewards>,
  viewerBinding: BindingRow | null,
) {
  return {
    date: rewardSummary.period.startDate,
    period: rewardSummary.period,
    affiliateEnabled,
    rewardConfig: rewardSummary.rewardConfig,
    periodInviteeCount: rewardSummary.totalInviteeCount,
    activeInviteeCount: rewardSummary.activeInviteeCount,
    inactiveInviteeCount: rewardSummary.inactiveInviteeCount,
    missingUserCount: rewardSummary.missingUserCount,
    ...(viewerBinding ? { viewer: viewerFromLeaderboard(viewerBinding, rewardSummary.entries) } : {}),
    leaderboard: rewardSummary.leaderboard,
  } satisfies QqBotAffiliateActivitySummary;
}

function viewerFromLeaderboard(binding: BindingRow, leaderboard: InviteActivityLeaderboardEntry[]) {
  const entry = leaderboard.find((item) => item.inviterId === binding.sub2UserId);
  return {
    qqUserId: binding.qqUserId,
    sub2UserId: binding.sub2UserId,
    totalInvitees: entry?.total ?? 0,
    activeInviteeCount: entry?.activeInviteeCount ?? 0,
    inactiveInviteeCount: entry?.inactiveInviteeCount ?? 0,
    rewardAmount: entry?.rewardAmount ?? null,
  };
}

async function fetchAllAffiliateInvites(
  sub2Client: QqBotAffiliateActivitySub2Client,
  input: { startAt: string; endAt: string },
) {
  const items: Sub2ApiAffiliateInvite[] = [];
  let page = 1;

  while (true) {
    const result = await sub2Client.listAffiliateInvites({
      page,
      pageSize: INVITES_PAGE_SIZE,
      startAt: input.startAt,
      endAt: input.endAt,
    });
    items.push(...result.items);
    if (page >= result.pages || result.items.length < INVITES_PAGE_SIZE) break;
    page += 1;
  }

  return items;
}

async function fetchAllUsers(sub2Client: QqBotAffiliateActivitySub2Client) {
  const items: Sub2ApiUser[] = [];
  let page = 1;

  while (true) {
    const result = await sub2Client.searchUsers({ page, pageSize: USERS_PAGE_SIZE, search: "" });
    items.push(...result.items);
    if (page >= result.pages || result.items.length < USERS_PAGE_SIZE) break;
    page += 1;
  }

  return items;
}
