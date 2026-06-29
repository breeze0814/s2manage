import { db } from "@/server/db";
import { decrypt } from "@/server/crypto";
import { Sub2ApiAdminClient, type Sub2ApiAffiliateInvite } from "@/server/clients/sub2api-admin";
import { extractQqBotCommandText } from "@/server/qqbot-command";

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
    findMany(args: { where: { connectionId: number } }): Promise<BindingRow[]>;
  };
};

type QqBotAffiliateActivitySub2Client = Pick<Sub2ApiAdminClient, "getSettings" | "listAffiliateInvites" | "updateSettings">;

type InviteLeaderboardEntry = {
  inviterId: number;
  inviterEmail: string;
  inviterUsername: string;
  total: number;
};

export type QqBotAffiliateActivitySummary = {
  date: string;
  affiliateEnabled: boolean;
  todayBoundInviteeCount: number;
  viewer?: {
    qqUserId: string;
    sub2UserId: number;
    totalBoundInvitees: number;
    todayBoundInvitees: number;
  };
  leaderboard: InviteLeaderboardEntry[];
};

const MAX_LEADERBOARD_SIZE = 10;
const PAGE_SIZE = 20;
const SHANGHAI_TIME_ZONE = "Asia/Shanghai";

function formatDateInShanghai(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: SHANGHAI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date).replace(/\//g, "-");
}

function nextDayInShanghai(date: Date) {
  const formatted = formatDateInShanghai(date);
  return new Date(Date.parse(`${formatted}T00:00:00+08:00`) + 24 * 60 * 60 * 1000);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function ensureBinding(dbClient: QqBotAffiliateActivityDb, connectionId: number, qqUserId: string) {
  return dbClient.qqBotUserBinding.findUnique({
    where: { connectionId_qqUserId: { connectionId, qqUserId } },
  });
}

function isBoundInvitee(invite: Sub2ApiAffiliateInvite, bindingsBySub2UserId: Map<number, BindingRow>) {
  return bindingsBySub2UserId.has(invite.invitee_id);
}

function groupLeaderboard(invites: Sub2ApiAffiliateInvite[], bindingsBySub2UserId: Map<number, BindingRow>) {
  const grouped = new Map<number, InviteLeaderboardEntry & { inviteeIds: Set<number> }>();

  for (const invite of invites) {
    if (!isBoundInvitee(invite, bindingsBySub2UserId)) continue;
    const current = grouped.get(invite.inviter_id) ?? {
      inviterId: invite.inviter_id,
      inviterEmail: invite.inviter_email,
      inviterUsername: invite.inviter_username ?? "",
      total: 0,
      inviteeIds: new Set<number>(),
    };
    if (current.inviteeIds.has(invite.invitee_id)) continue;
    current.inviteeIds.add(invite.invitee_id);
    current.total += 1;
    grouped.set(invite.inviter_id, current);
  }

  return [...grouped.values()]
    .sort((left, right) => right.total - left.total || left.inviterId - right.inviterId)
    .slice(0, MAX_LEADERBOARD_SIZE)
    .map((entry) => ({
      inviterId: entry.inviterId,
      inviterEmail: entry.inviterEmail,
      inviterUsername: entry.inviterUsername,
      total: entry.total,
    }));
}

function countViewerInvites(invites: Sub2ApiAffiliateInvite[], bindingsBySub2UserId: Map<number, BindingRow>, sub2UserId: number) {
  const uniqueInvitees = new Set<number>();

  for (const invite of invites) {
    if (invite.inviter_id !== sub2UserId) continue;
    if (!isBoundInvitee(invite, bindingsBySub2UserId)) continue;
    if (uniqueInvitees.has(invite.invitee_id)) continue;
    uniqueInvitees.add(invite.invitee_id);
  }

  return uniqueInvitees.size;
}

function countUniqueBoundInvitees(invites: Sub2ApiAffiliateInvite[], bindingsBySub2UserId: Map<number, BindingRow>) {
  const uniqueInvitees = new Set<number>();
  for (const invite of invites) {
    if (!isBoundInvitee(invite, bindingsBySub2UserId)) continue;
    uniqueInvitees.add(invite.invitee_id);
  }
  return uniqueInvitees.size;
}

function formatLeaderboardLines(entries: InviteLeaderboardEntry[]) {
  if (entries.length === 0) return ["暂无邀请数据"];
  return entries.map((entry, index) => `${index + 1}. ${entry.inviterUsername || entry.inviterEmail} (${entry.inviterEmail})：${entry.total}`);
}

function buildInviteReply(summary: QqBotAffiliateActivitySummary) {
  const lines = [
    "邀请活动统计",
    `统计日期：${summary.date}`,
    `邀请活动状态：${summary.affiliateEnabled ? "已开启" : "未开启"}`,
    `今日已绑定邀请关系：${summary.todayBoundInviteeCount}`,
  ];

  if (summary.viewer) {
    lines.push(`你的邀请人数：总计 ${summary.viewer.totalBoundInvitees}，今日 ${summary.viewer.todayBoundInvitees}`);
  }

  lines.push("邀请活动排行榜：");
  lines.push(...formatLeaderboardLines(summary.leaderboard));
  return lines.join("\n");
}

export function resolveQqBotAffiliateActivityCommandDecision(input: {
  settings: Pick<{ enabled: boolean; mentionKeywordEnabled: boolean; targetGroupId: string }, "enabled" | "mentionKeywordEnabled" | "targetGroupId">;
  botUserId: string;
  message: { messageType: string; subType: string; groupId: string; userId: string; text: string };
}) {
  if (!input.settings.enabled) return { action: "skip" as const, reason: "QQBot 未启用" };
  if (!input.settings.mentionKeywordEnabled) return { action: "skip" as const, reason: "@ 关键字触发未开启" };
  if (!input.settings.targetGroupId.trim()) return { action: "skip" as const, reason: "未配置目标 QQ 群" };

  const botUserId = input.botUserId.trim();
  if (!botUserId) return { action: "skip" as const, reason: "未获取当前 Bot QQ，无法判断 @ 消息" };

  const commandText = extractQqBotCommandText(input.message.text, botUserId);
  if (commandText === null) return { action: "skip" as const, reason: `消息未以 @ 当前 Bot QQ ${botUserId} 作为前缀` };
  if (commandText !== "邀请") return { action: "skip" as const, reason: "未匹配到 QQBot 邀请活动指令" };

  return { action: "reply-invite" as const };
}

export async function loadQqBotAffiliateActivity(input: {
  connectionId: number;
  qqUserId?: string;
  currentDate?: Date;
  dbClient?: QqBotAffiliateActivityDb;
  sub2Client?: QqBotAffiliateActivitySub2Client;
}) {
  const dbClient = input.dbClient ?? db;
  const viewerBinding = input.qqUserId ? await ensureBinding(dbClient, input.connectionId, input.qqUserId) : null;
  if (input.qqUserId && !viewerBinding) throw new Error("请先绑定 Sub2 用户后再查询邀请活动");

  let sub2Client = input.sub2Client;
  if (!sub2Client) {
    const connection = await dbClient.connection?.findUniqueOrThrow({ where: { id: input.connectionId } });
    if (!connection) throw new Error("未找到连接信息");
    sub2Client = new Sub2ApiAdminClient(connection.baseUrl, decrypt(connection.adminApiKey));
  }

  const settings = await sub2Client.getSettings();
  const affiliateEnabled = Boolean(settings.affiliate_enabled);

  const now = input.currentDate ?? new Date();
  const startAt = formatDateInShanghai(now);
  const endAt = formatDateInShanghai(nextDayInShanghai(now));
  const bindings = await dbClient.qqBotUserBinding.findMany({ where: { connectionId: input.connectionId } }) as BindingRow[];
  const bindingsBySub2UserId = new Map(bindings.map((binding) => [binding.sub2UserId, binding]));
  const [allTimeInvites, todayInvites] = await Promise.all([
    fetchAllAffiliateInvites(sub2Client),
    fetchAllAffiliateInvites(sub2Client, { startAt, endAt }),
  ]);
  const todayBoundInviteeCount = countUniqueBoundInvitees(todayInvites, bindingsBySub2UserId);
  const leaderboard = groupLeaderboard(todayInvites, bindingsBySub2UserId);
  const viewer = viewerBinding
    ? {
      qqUserId: viewerBinding.qqUserId,
      sub2UserId: viewerBinding.sub2UserId,
      totalBoundInvitees: countViewerInvites(allTimeInvites, bindingsBySub2UserId, viewerBinding.sub2UserId),
      todayBoundInvitees: countViewerInvites(todayInvites, bindingsBySub2UserId, viewerBinding.sub2UserId),
    }
    : undefined;

  return {
    ok: true,
    summary: {
      date: startAt,
      affiliateEnabled,
      todayBoundInviteeCount,
      ...(viewer ? { viewer } : {}),
      leaderboard,
    } satisfies QqBotAffiliateActivitySummary,
  };
}

export async function handleQqBotAffiliateActivityCommand(input: {
  connectionId: number;
  qqUserId: string;
  dbClient?: QqBotAffiliateActivityDb;
  sub2Client?: QqBotAffiliateActivitySub2Client;
  currentDate?: Date;
  sendReply: (message: string) => Promise<void>;
}) {
  const dbClient = input.dbClient ?? db;
  let sub2Client = input.sub2Client;
  if (!sub2Client) {
    const connection = await dbClient.connection?.findUniqueOrThrow({ where: { id: input.connectionId } });
    if (!connection) throw new Error("未找到连接信息");
    sub2Client = new Sub2ApiAdminClient(connection.baseUrl, decrypt(connection.adminApiKey));
  }

  const settings = await sub2Client.getSettings();
  if (!settings.affiliate_enabled) {
    const message = "邀请活动未开启";
    await input.sendReply(message);
    return { ok: false as const, reason: message };
  }

  try {
    const result = await loadQqBotAffiliateActivity({
      connectionId: input.connectionId,
      qqUserId: input.qqUserId,
      currentDate: input.currentDate,
      dbClient,
      sub2Client,
    });
    const message = buildInviteReply(result.summary);
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
  let sub2Client = input.sub2Client;
  if (!sub2Client) {
    const connection = await dbClient.connection?.findUniqueOrThrow({ where: { id: input.connectionId } });
    if (!connection) throw new Error("未找到连接信息");
    sub2Client = new Sub2ApiAdminClient(connection.baseUrl, decrypt(connection.adminApiKey));
  }

  await sub2Client.updateSettings({ affiliate_enabled: input.enabled });
  return { ok: true, enabled: input.enabled };
}

async function fetchAllAffiliateInvites(
  sub2Client: QqBotAffiliateActivitySub2Client,
  input: { startAt?: string; endAt?: string } = {},
) {
  const items: Sub2ApiAffiliateInvite[] = [];
  let page = 1;

  while (true) {
    const result = await sub2Client.listAffiliateInvites({
      page,
      pageSize: PAGE_SIZE,
      ...(input.startAt ? { startAt: input.startAt } : {}),
      ...(input.endAt ? { endAt: input.endAt } : {}),
    });
    items.push(...result.items);
    if (page >= result.pages || result.items.length < PAGE_SIZE) break;
    page += 1;
  }

  return items;
}
