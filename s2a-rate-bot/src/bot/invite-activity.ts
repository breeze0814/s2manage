export const ACTIVE_REWARD_SETTING_KEY = "invite_activity_active_reward_amount";
export const INACTIVE_REWARD_SETTING_KEY = "invite_activity_inactive_reward_amount";
export const INVITE_ACTIVITY_PERIOD_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;
const SHANGHAI_TIME_ZONE = "Asia/Shanghai";
const MAX_LEADERBOARD_SIZE = 10;

export type InviteActivityPeriod = {
  readonly startDate: string;
  readonly endDate: string;
  readonly startAt: Date;
  readonly endAt: Date;
};

export type InviteActivityRewardConfig = {
  readonly activeRewardAmount: number | null;
  readonly inactiveRewardAmount: number | null;
  readonly configured: boolean;
};

export type AffiliateInvite = {
  readonly inviter_id: number;
  readonly inviter_email: string;
  readonly inviter_username?: string | null;
  readonly invitee_id: number;
};

export type InviteUser = {
  readonly id: number;
  readonly email: string;
  readonly balance?: number | null;
  readonly last_used_at?: string | null;
};

export type InviteActivityLeaderboardEntry = {
  readonly inviterId: number;
  readonly inviterEmail: string;
  readonly inviterUsername: string;
  readonly activeInviteeCount: number;
  readonly inactiveInviteeCount: number;
  readonly total: number;
  readonly rewardAmount: number | null;
};

export type InviteActivitySummary = {
  readonly period: InviteActivityPeriod;
  readonly affiliateEnabled: boolean;
  readonly rewardConfig: InviteActivityRewardConfig;
  readonly periodInviteeCount: number;
  readonly activeInviteeCount: number;
  readonly inactiveInviteeCount: number;
  readonly missingUserCount: number;
  readonly leaderboard: readonly InviteActivityLeaderboardEntry[];
};

type Accumulator = {
  inviterId: number;
  inviterEmail: string;
  inviterUsername: string;
  activeInviteeCount: number;
  inactiveInviteeCount: number;
  total: number;
  rewardAmount: number | null;
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
  const startAt = shanghaiDayStart(startDate);
  return inviteActivityPeriodFromStartAt(startAt);
}

export function inviteActivityPeriodForStartDate(startDate: string, currentDate = new Date()): InviteActivityPeriod {
  const anchorAt = configuredActivityStartAt(startDate, currentDate);
  const currentDayAt = shanghaiDayStart(formatDateInShanghai(currentDate));
  const elapsedDays = Math.floor((currentDayAt.getTime() - anchorAt.getTime()) / DAY_MS);
  const cycleIndex = Math.max(0, Math.floor(elapsedDays / INVITE_ACTIVITY_PERIOD_DAYS));
  return inviteActivityPeriodFromStartAt(new Date(anchorAt.getTime() + cycleIndex * INVITE_ACTIVITY_PERIOD_DAYS * DAY_MS));
}

export function inviteActivitySettlementPeriodForStartDate(startDate: string, currentDate = new Date()): InviteActivityPeriod | null {
  const anchorAt = configuredActivityStartAt(startDate, currentDate);
  const currentDayAt = shanghaiDayStart(formatDateInShanghai(currentDate));
  const elapsedDays = Math.floor((currentDayAt.getTime() - anchorAt.getTime()) / DAY_MS);
  const completedCycles = Math.floor(elapsedDays / INVITE_ACTIVITY_PERIOD_DAYS);
  if (completedCycles <= 0) return null;
  return inviteActivityPeriodFromStartAt(new Date(anchorAt.getTime() + (completedCycles - 1) * INVITE_ACTIVITY_PERIOD_DAYS * DAY_MS));
}

function inviteActivityPeriodFromStartAt(startAt: Date): InviteActivityPeriod {
  const endAt = new Date(startAt.getTime() + INVITE_ACTIVITY_PERIOD_DAYS * DAY_MS);
  return {
    startDate: formatDateInShanghai(startAt),
    endDate: formatDateInShanghai(endAt),
    startAt,
    endAt,
  };
}

function configuredActivityStartAt(startDate: string, currentDate: Date) {
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : formatDateInShanghai(currentDate);
  const startAt = shanghaiDayStart(normalized);
  return Number.isFinite(startAt.getTime()) ? startAt : shanghaiDayStart(formatDateInShanghai(currentDate));
}

function shanghaiDayStart(date: string) {
  return new Date(`${date}T00:00:00+08:00`);
}

export function rewardConfigFromAmounts(input: {
  readonly activeRewardAmount?: number | null;
  readonly inactiveRewardAmount?: number | null;
}): InviteActivityRewardConfig {
  return {
    activeRewardAmount: input.activeRewardAmount ?? null,
    inactiveRewardAmount: input.inactiveRewardAmount ?? null,
    configured: input.activeRewardAmount !== null && input.activeRewardAmount !== undefined
      && input.inactiveRewardAmount !== null && input.inactiveRewardAmount !== undefined,
  };
}

export function rewardConfigFromSettings(settings: Record<string, unknown>): InviteActivityRewardConfig {
  const activeRewardAmount = parseRewardAmount(settings[ACTIVE_REWARD_SETTING_KEY]);
  const inactiveRewardAmount = parseRewardAmount(settings[INACTIVE_REWARD_SETTING_KEY]);
  return {
    activeRewardAmount,
    inactiveRewardAmount,
    configured: activeRewardAmount !== null && inactiveRewardAmount !== null,
  };
}

export function calculateInviteActivitySummary(input: {
  readonly period: InviteActivityPeriod;
  readonly affiliateEnabled: boolean;
  readonly rewardConfig: InviteActivityRewardConfig;
  readonly invites: readonly AffiliateInvite[];
  readonly users: readonly InviteUser[];
}): InviteActivitySummary {
  const usersById = new Map(input.users.map((user) => [user.id, user]));
  const grouped = new Map<number, Accumulator>();
  let missingUserCount = 0;

  for (const invite of input.invites) {
    const current = ensureAccumulator(grouped, invite);
    if (current.inviteeIds.has(invite.invitee_id)) continue;
    current.inviteeIds.add(invite.invitee_id);
    const user = usersById.get(invite.invitee_id);
    if (!user) missingUserCount += 1;
    classifyInvitee(current, isActiveInvitee(user, input.period));
  }

  const entries = [...grouped.values()]
    .map((entry) => finalizeEntry(entry, input.rewardConfig))
    .sort(sortLeaderboard);

  return {
    period: input.period,
    affiliateEnabled: input.affiliateEnabled,
    rewardConfig: input.rewardConfig,
    periodInviteeCount: sum(entries, "total"),
    activeInviteeCount: sum(entries, "activeInviteeCount"),
    inactiveInviteeCount: sum(entries, "inactiveInviteeCount"),
    missingUserCount,
    leaderboard: entries.slice(0, MAX_LEADERBOARD_SIZE),
  };
}

export function buildInviteHelpReply(affiliateEnabled: boolean) {
  return [
    "邀请活动",
    `邀请活动状态：${affiliateEnabled ? "已开启" : "未开启"}`,
    "邀请相关指令：",
    "@bot 邀请：查看邀请活动状态和可用指令",
    "@bot 我的邀请：查看你的本期邀请和奖励",
    "@bot 邀请排行：查看本期邀请排行榜",
  ].join("\n");
}

export function buildInviteLeaderboardReply(summary: InviteActivitySummary) {
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

export function buildMyInviteReply(summary: InviteActivitySummary, sub2UserId: number) {
  const entry = summary.leaderboard.find((item) => item.inviterId === sub2UserId);
  const lines = [
    "我的邀请",
    `三日周期：${summary.period.startDate} 至 ${summary.period.endDate}`,
    `邀请活动状态：${summary.affiliateEnabled ? "已开启" : "未开启"}`,
  ];
  if (!summary.rewardConfig.configured) lines.push("奖励额度：未配置，暂不计算奖励");
  if (!entry) {
    lines.push("你的本期邀请：暂无邀请数据");
  } else {
    lines.push(`你的本期邀请：总计 ${entry.total}，活跃 ${entry.activeInviteeCount}，非活跃 ${entry.inactiveInviteeCount}，奖励 ${formatRewardAmount(entry.rewardAmount)}`);
  }
  return lines.join("\n");
}

function parseRewardAmount(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(numeric) || numeric < 0) throw new Error("邀请活动奖励配置必须是非负数字");
  return numeric;
}

function ensureAccumulator(grouped: Map<number, Accumulator>, invite: AffiliateInvite) {
  const existing = grouped.get(invite.inviter_id);
  if (existing) return existing;
  const created: Accumulator = {
    inviterId: invite.inviter_id,
    inviterEmail: invite.inviter_email,
    inviterUsername: invite.inviter_username ?? "",
    activeInviteeCount: 0,
    inactiveInviteeCount: 0,
    total: 0,
    rewardAmount: null,
    inviteeIds: new Set(),
  };
  grouped.set(invite.inviter_id, created);
  return created;
}

function isActiveInvitee(user: InviteUser | undefined, period: InviteActivityPeriod) {
  if (!user || typeof user.balance !== "number" || user.balance <= 0 || !user.last_used_at) return false;
  const lastUsedAt = new Date(user.last_used_at);
  return Number.isFinite(lastUsedAt.getTime()) && lastUsedAt >= period.startAt && lastUsedAt < period.endAt;
}

function classifyInvitee(entry: Accumulator, active: boolean) {
  entry.total += 1;
  if (active) entry.activeInviteeCount += 1;
  else entry.inactiveInviteeCount += 1;
}

function finalizeEntry(entry: Accumulator, config: InviteActivityRewardConfig): InviteActivityLeaderboardEntry {
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
  };
}

function sortLeaderboard(left: InviteActivityLeaderboardEntry, right: InviteActivityLeaderboardEntry) {
  const leftReward = left.rewardAmount ?? left.total;
  const rightReward = right.rewardAmount ?? right.total;
  return rightReward - leftReward || right.total - left.total || left.inviterId - right.inviterId;
}

function sum(entries: readonly InviteActivityLeaderboardEntry[], key: "activeInviteeCount" | "inactiveInviteeCount" | "total") {
  return entries.reduce((total, entry) => total + entry[key], 0);
}

function formatRewardAmount(value: number | null) {
  if (value === null) return "未配置";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
