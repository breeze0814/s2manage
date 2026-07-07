import type { BotSettings, TargetSettings } from "../storage/app-config.ts";
import type { BotStorage } from "./storage.ts";
import {
  buildInviteLeaderboardReply,
  calculateInviteActivitySummary,
  inviteActivityPeriodForDate,
  inviteActivityPeriodForStartDate,
  inviteActivitySettlementPeriodForStartDate,
  type InviteActivityPeriod,
  rewardConfigFromAmounts,
  rewardConfigFromSettings,
  type AffiliateInvite,
  type InviteUser,
} from "./invite-activity.ts";

export type InviteActivityClient = {
  readonly getSettings: () => Promise<Record<string, unknown>>;
  readonly listAffiliateInvites: (input: {
    readonly page?: number;
    readonly pageSize?: number;
    readonly startAt?: string;
    readonly endAt?: string;
  }) => Promise<{ readonly items: readonly AffiliateInvite[]; readonly total: number; readonly page: number; readonly page_size: number; readonly pages: number }>;
  readonly searchUsers: (input: {
    readonly page?: number;
    readonly pageSize?: number;
    readonly search?: string;
  }) => Promise<{ readonly items: readonly InviteUser[]; readonly total: number; readonly page: number; readonly page_size: number; readonly pages: number }>;
  readonly generateRedeemCodes: (input: {
    readonly count: number;
    readonly type: "balance";
    readonly value: number;
  }) => Promise<Array<{ readonly id?: number | null; readonly code: string; readonly value?: number }>>;
};

export type BotMessenger = {
  readonly sendPrivateMessage: (userId: string, message: string) => Promise<void>;
};

const INVITES_PAGE_SIZE = 20;
const USERS_PAGE_SIZE = 100;

export async function runInviteActivityStatsCycle(input: {
  readonly now: Date;
  readonly target: TargetSettings;
  readonly bot?: BotSettings;
  readonly storage: BotStorage;
  readonly client: InviteActivityClient;
  readonly messenger: BotMessenger;
}) {
  const currentPeriod = input.bot?.inviteActivityStartDate
    ? inviteActivityPeriodForStartDate(input.bot.inviteActivityStartDate, input.now)
    : inviteActivityPeriodForDate(input.now);
  const settlementPeriod = input.bot?.inviteActivityStartDate
    ? inviteActivitySettlementPeriodForStartDate(input.bot.inviteActivityStartDate, input.now)
    : currentPeriod;
  const summary = await loadInviteActivitySummary({
    now: input.now,
    period: settlementPeriod ?? currentPeriod,
    client: input.client,
    activityEnabled: input.bot?.scheduledStatsEnabled,
    startDate: input.bot?.inviteActivityStartDate,
    activeRewardAmount: input.bot?.inviteActivityActiveRewardAmount,
    inactiveRewardAmount: input.bot?.inviteActivityInactiveRewardAmount,
  });

  const result = { summary, issued: 0, failed: 0, skipped: 0 };
  if (!settlementPeriod) return result;
  if (!summary.affiliateEnabled || !summary.rewardConfig.configured) return result;

  for (const entry of summary.leaderboard) {
    if (entry.rewardAmount === null || entry.rewardAmount <= 0) {
      result.skipped += 1;
      continue;
    }
    const binding = await input.storage.findBindingBySub2UserId(entry.inviterId);
    if (!binding) {
      result.skipped += 1;
      continue;
    }
    const grant = await input.storage.upsertInviteRewardGrant({
      periodStartDate: summary.period.startDate,
      periodEndDate: summary.period.endDate,
      inviterId: entry.inviterId,
      inviterEmail: entry.inviterEmail,
      inviterUsername: entry.inviterUsername,
      activeInviteeCount: entry.activeInviteeCount,
      inactiveInviteeCount: entry.inactiveInviteeCount,
      totalInviteeCount: entry.total,
      rewardAmount: entry.rewardAmount,
    });
    if (grant.status === "issued") {
      result.skipped += 1;
      continue;
    }
    try {
      const [redeemCode] = await input.client.generateRedeemCodes({
        count: 1,
        type: "balance",
        value: entry.rewardAmount,
      });
      if (!redeemCode?.code) throw new Error(`兑换码生成失败：Sub2 用户 ${entry.inviterId}`);
      await input.messenger.sendPrivateMessage(binding.qqUserId, buildRewardPrivateMessage({
        targetName: input.target.name,
        leaderboardMessage: buildInviteLeaderboardReply(summary),
        redeemCode: redeemCode.code,
        rewardAmount: entry.rewardAmount,
      }));
      await input.storage.markInviteRewardIssued(grant.id, {
        id: redeemCode.id ?? null,
        code: redeemCode.code,
      });
      result.issued += 1;
    } catch (error) {
      await input.storage.markInviteRewardFailed(grant.id, errorMessage(error));
      result.failed += 1;
    }
  }
  return result;
}

export async function loadInviteActivitySummary(input: {
  readonly now: Date;
  readonly period?: InviteActivityPeriod;
  readonly client: InviteActivityClient;
  readonly activityEnabled?: boolean;
  readonly startDate?: string;
  readonly activeRewardAmount?: number | null;
  readonly inactiveRewardAmount?: number | null;
}) {
  const period = input.period ?? (input.startDate ? inviteActivityPeriodForStartDate(input.startDate, input.now) : inviteActivityPeriodForDate(input.now));
  const settings = await input.client.getSettings();
  const localRewardConfig = rewardConfigFromAmounts({
    activeRewardAmount: input.activeRewardAmount,
    inactiveRewardAmount: input.inactiveRewardAmount,
  });
  const [invites, users] = await Promise.all([
    fetchAllAffiliateInvites(input.client, period),
    fetchAllUsers(input.client),
  ]);
  return calculateInviteActivitySummary({
    period,
    affiliateEnabled: input.activityEnabled ?? Boolean(settings.affiliate_enabled),
    rewardConfig: localRewardConfig.configured ? localRewardConfig : rewardConfigFromSettings(settings),
    invites,
    users,
  });
}

function buildRewardPrivateMessage(input: {
  readonly targetName: string;
  readonly leaderboardMessage: string;
  readonly redeemCode: string;
  readonly rewardAmount: number;
}) {
  return [
    `${input.targetName} 邀请活动奖励`,
    `奖励额度：${formatAmount(input.rewardAmount)}`,
    `兑换码：${input.redeemCode}`,
    "",
    input.leaderboardMessage,
  ].join("\n");
}

async function fetchAllAffiliateInvites(client: InviteActivityClient, period: { startDate: string; endDate: string }) {
  const rows: AffiliateInvite[] = [];
  for (let page = 1; ; page += 1) {
    const result = await client.listAffiliateInvites({
      page,
      pageSize: INVITES_PAGE_SIZE,
      startAt: period.startDate,
      endAt: period.endDate,
    });
    rows.push(...result.items);
    if (page >= result.pages || result.items.length === 0) return rows;
  }
}

async function fetchAllUsers(client: InviteActivityClient) {
  const rows: InviteUser[] = [];
  for (let page = 1; ; page += 1) {
    const result = await client.searchUsers({ page, pageSize: USERS_PAGE_SIZE });
    rows.push(...result.items);
    if (page >= result.pages || result.items.length === 0) return rows;
  }
}

function formatAmount(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
