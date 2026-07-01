import type { Sub2ApiAffiliateInvite, Sub2ApiUser } from "@/server/clients/sub2api-admin";

export const ACTIVE_REWARD_SETTING_KEY = "invite_activity_active_reward_amount";
export const INACTIVE_REWARD_SETTING_KEY = "invite_activity_inactive_reward_amount";
export const INVITE_ACTIVITY_PERIOD_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;
const SHANGHAI_TIME_ZONE = "Asia/Shanghai";
const MAX_LEADERBOARD_SIZE = 10;

export type InviteActivityPeriod = {
  startDate: string;
  endDate: string;
  startAt: Date;
  endAt: Date;
};

export type InviteActivityRewardConfig = {
  activeRewardAmount: number | null;
  inactiveRewardAmount: number | null;
  configured: boolean;
};

export type InviteActivityLeaderboardEntry = {
  inviterId: number;
  inviterEmail: string;
  inviterUsername: string;
  activeInviteeCount: number;
  inactiveInviteeCount: number;
  total: number;
  rewardAmount: number | null;
};

export type InviteActivityRewardSummary = {
  period: InviteActivityPeriod;
  rewardConfig: InviteActivityRewardConfig;
  totalInviteeCount: number;
  activeInviteeCount: number;
  inactiveInviteeCount: number;
  missingUserCount: number;
  entries: InviteActivityLeaderboardEntry[];
  leaderboard: InviteActivityLeaderboardEntry[];
};

type InviterAccumulator = InviteActivityLeaderboardEntry & {
  inviteeIds: Set<number>;
};

export function formatDateInShanghai(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SHANGHAI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function inviteActivityPeriodForDate(date: Date): InviteActivityPeriod {
  const startDate = formatDateInShanghai(date);
  const startAt = shanghaiDateStart(startDate);
  const endAt = new Date(startAt.getTime() + INVITE_ACTIVITY_PERIOD_DAYS * DAY_MS);
  return {
    startDate,
    endDate: formatDateInShanghai(endAt),
    startAt,
    endAt,
  };
}

export function rewardConfigFromSettings(settings: Record<string, unknown>): InviteActivityRewardConfig {
  const activeRewardAmount = parseRewardAmount(settings[ACTIVE_REWARD_SETTING_KEY], ACTIVE_REWARD_SETTING_KEY);
  const inactiveRewardAmount = parseRewardAmount(settings[INACTIVE_REWARD_SETTING_KEY], INACTIVE_REWARD_SETTING_KEY);
  return {
    activeRewardAmount,
    inactiveRewardAmount,
    configured: activeRewardAmount !== null && inactiveRewardAmount !== null,
  };
}

export function calculateInviteActivityRewards(input: {
  period: InviteActivityPeriod;
  rewardConfig: InviteActivityRewardConfig;
  invites: Sub2ApiAffiliateInvite[];
  users: Sub2ApiUser[];
}): InviteActivityRewardSummary {
  const usersById = new Map(input.users.map((user) => [user.id, user]));
  const grouped = new Map<number, InviterAccumulator>();
  let missingUserCount = 0;

  for (const invite of input.invites) {
    const current = ensureAccumulator(grouped, invite);
    if (current.inviteeIds.has(invite.invitee_id)) continue;
    current.inviteeIds.add(invite.invitee_id);

    const user = usersById.get(invite.invitee_id);
    if (!user) missingUserCount += 1;
    addInviteeClassification(current, isActiveInvitee(user, input.period));
  }

  const entries = finalizeEntries([...grouped.values()], input.rewardConfig);
  return {
    period: input.period,
    rewardConfig: input.rewardConfig,
    totalInviteeCount: sumEntries(entries, "total"),
    activeInviteeCount: sumEntries(entries, "activeInviteeCount"),
    inactiveInviteeCount: sumEntries(entries, "inactiveInviteeCount"),
    missingUserCount,
    entries,
    leaderboard: entries.slice(0, MAX_LEADERBOARD_SIZE),
  };
}

function shanghaiDateStart(date: string) {
  return new Date(`${date}T00:00:00+08:00`);
}

function parseRewardAmount(value: unknown, key: string) {
  if (value === undefined || value === null || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(String(value).trim());
  if (Number.isFinite(numeric) && numeric >= 0) return numeric;
  throw new Error(`邀请活动奖励配置 ${key} 必须是非负数字`);
}

function ensureAccumulator(grouped: Map<number, InviterAccumulator>, invite: Sub2ApiAffiliateInvite) {
  const current = grouped.get(invite.inviter_id);
  if (current) return current;
  const created = {
    inviterId: invite.inviter_id,
    inviterEmail: invite.inviter_email,
    inviterUsername: invite.inviter_username ?? "",
    activeInviteeCount: 0,
    inactiveInviteeCount: 0,
    total: 0,
    rewardAmount: null,
    inviteeIds: new Set<number>(),
  };
  grouped.set(invite.inviter_id, created);
  return created;
}

function isActiveInvitee(user: Sub2ApiUser | undefined, period: InviteActivityPeriod) {
  if (!user || typeof user.balance !== "number" || user.balance <= 0) return false;
  if (!user.last_used_at) return false;
  const lastUsedAt = new Date(user.last_used_at);
  if (!Number.isFinite(lastUsedAt.getTime())) return false;
  return lastUsedAt >= period.startAt && lastUsedAt < period.endAt;
}

function addInviteeClassification(entry: InviterAccumulator, active: boolean) {
  entry.total += 1;
  if (active) {
    entry.activeInviteeCount += 1;
    return;
  }
  entry.inactiveInviteeCount += 1;
}

function finalizeEntries(entries: InviterAccumulator[], config: InviteActivityRewardConfig) {
  return entries
    .map((entry) => toLeaderboardEntry(entry, config))
    .sort((left, right) => sortLeaderboard(left, right));
}

function toLeaderboardEntry(entry: InviterAccumulator, config: InviteActivityRewardConfig) {
  const rewardAmount = config.configured
    ? entry.activeInviteeCount * Number(config.activeRewardAmount) + entry.inactiveInviteeCount * Number(config.inactiveRewardAmount)
    : null;
  return {
    inviterId: entry.inviterId,
    inviterEmail: entry.inviterEmail,
    inviterUsername: entry.inviterUsername,
    activeInviteeCount: entry.activeInviteeCount,
    inactiveInviteeCount: entry.inactiveInviteeCount,
    total: entry.total,
    rewardAmount,
  } satisfies InviteActivityLeaderboardEntry;
}

function sortLeaderboard(left: InviteActivityLeaderboardEntry, right: InviteActivityLeaderboardEntry) {
  const leftReward = left.rewardAmount ?? left.total;
  const rightReward = right.rewardAmount ?? right.total;
  return rightReward - leftReward || right.total - left.total || left.inviterId - right.inviterId;
}

function sumEntries(entries: InviteActivityLeaderboardEntry[], key: "activeInviteeCount" | "inactiveInviteeCount" | "total") {
  return entries.reduce((sum, entry) => sum + entry[key], 0);
}
