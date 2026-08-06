import type { LotteryCampaign, LotteryEntry, LotteryPrize } from "./types.ts";

export type StoredCampaign = Omit<LotteryCampaign,
  "entryCount" | "winnerCount" | "currentEntry" | "myEntries" | "winners" | "prizeInventory">;

export type DrawAssignment = Readonly<{
  entryId: string;
  prize: LotteryPrize;
}>;

export type LotteryRewardJob = Readonly<{
  id: string;
  campaignId: string;
  entryId: string;
  type: LotteryPrize["type"];
  value: number;
  attemptCount: number;
  idempotencyKey: string;
  lockedAt: string;
  lockToken: string;
}>;

export type LotteryStore = Readonly<{
  listCampaigns: () => Promise<StoredCampaign[]>;
  getCampaign: (id: string) => Promise<StoredCampaign | null>;
  createCampaign: (campaign: StoredCampaign) => Promise<StoredCampaign>;
  updateCampaign: (campaign: StoredCampaign) => Promise<StoredCampaign | null>;
  setCampaignVisibility: (id: string, visible: boolean, at: string) => Promise<StoredCampaign | null>;
  cancelCampaign: (id: string, at: string) => Promise<StoredCampaign | null>;
  listEntries: (campaignId: string) => Promise<LotteryEntry[]>;
  getEntry: (campaignId: string, userId: string, participationKey: string) => Promise<LotteryEntry | null>;
  enterScheduled: (entry: LotteryEntry) => Promise<LotteryEntry>;
  settleInstant: (input: InstantSettlement) => Promise<LotteryEntry>;
  withdraw: (input: Withdrawal) => Promise<LotteryEntry | null>;
  drawScheduled: (input: ScheduledDraw) => Promise<StoredCampaign>;
  advanceDueCampaigns: (at: string) => Promise<void>;
  listDueScheduledCampaignIds: (at: string) => Promise<string[]>;
  recordCampaignError: (campaignId: string, message: string, at: string) => Promise<void>;
  claimRewardJobs: (input: RewardClaim) => Promise<LotteryRewardJob[]>;
  completeRewardJob: (input: RewardCompletion) => Promise<boolean>;
  failRewardJob: (input: RewardFailure) => Promise<boolean>;
  close: () => Promise<void>;
}>;

export type InstantSettlement = Readonly<{
  entry: LotteryEntry;
  roll: number;
  rewardJobId: string;
  idempotencyKey: string;
}>;

export type Withdrawal = Readonly<{
  campaignId: string;
  userId: string;
  participationKey: string;
  timestamp: string;
}>;

export type ScheduledDraw = Readonly<{
  campaignId: string;
  timestamp: string;
  choose: (entries: readonly LotteryEntry[], prizes: readonly LotteryPrize[]) => readonly DrawAssignment[];
  jobId: () => string;
}>;

export type RewardClaim = Readonly<{ limit: number; staleBefore: string }>;
export type RewardCompletion = Readonly<{
  job: LotteryRewardJob;
  rewardCode: string;
  rewardCodeId: number;
  timestamp: string;
}>;
export type RewardFailure = Readonly<{
  job: LotteryRewardJob;
  message: string;
  nextAttemptAt: string;
  timestamp: string;
}>;
