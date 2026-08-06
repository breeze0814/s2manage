import { EmbedError, type LotteryEntry, type LotteryPrize } from "../../src/server/embeds/types.ts";
import type {
  InstantSettlement, LotteryRewardJob, LotteryStore, RewardClaim, RewardCompletion,
  RewardFailure, ScheduledDraw, StoredCampaign, Withdrawal,
} from "../../src/server/embeds/lottery-store-contract.ts";

const PROBABILITY_SCALE = 1_000_000;
const REWARD_LEASE_MS = 10 * 60 * 1_000;

type MutableJob = LotteryRewardJob & {
  status: "pending" | "processing" | "fulfilled" | "retryable_failed";
  nextAttemptAt: string;
  lastError: string | null;
};

export function createMemoryLotteryStore(_databaseUrl?: string): LotteryStore {
  const campaigns = new Map<string, StoredCampaign>();
  const entries = new Map<string, LotteryEntry>();
  const jobs = new Map<string, MutableJob>();
  const api: LotteryStore = {
    listCampaigns: async () => [...campaigns.values()],
    getCampaign: async (id) => campaigns.get(id) ?? null,
    createCampaign: async (campaign) => saveCampaign(campaigns, campaign),
    updateCampaign: async (campaign) => updateCampaign(campaigns, entries, campaign),
    setCampaignVisibility: async (id, visible, at) => updateVisibility(campaigns, id, visible, at),
    cancelCampaign: async (id, at) => cancelCampaign(campaigns, id, at),
    listEntries: async (campaignId) => campaignEntries(entries, jobs, campaignId),
    getEntry: async (campaignId, userId, key) => findEntry(entries, jobs, { campaignId, userId, participationKey: key }),
    enterScheduled: async (entry) => enterScheduled(entries, jobs, entry),
    settleInstant: async (input) => settleInstant(campaigns, entries, jobs, input),
    withdraw: async (input) => withdrawEntry(entries, jobs, input),
    drawScheduled: async (input) => drawScheduled(campaigns, entries, jobs, input),
    advanceDueCampaigns: async (at) => advanceCampaigns(campaigns, at),
    listDueScheduledCampaignIds: async (at) => dueCampaignIds(campaigns, at),
    recordCampaignError: async (id, message, at) => recordError(campaigns, id, message, at),
    claimRewardJobs: async (input) => claimJobs(entries, jobs, input),
    completeRewardJob: async (input) => completeJob(campaigns, entries, jobs, input),
    failRewardJob: async (input) => failJob(campaigns, entries, jobs, input),
    close: async () => undefined,
  };
  return api;
}

function saveCampaign(campaigns: Map<string, StoredCampaign>, campaign: StoredCampaign) {
  campaigns.set(campaign.id, campaign);
  return campaign;
}

function updateCampaign(
  campaigns: Map<string, StoredCampaign>,
  entries: Map<string, LotteryEntry>,
  campaign: StoredCampaign,
) {
  const hasEntries = [...entries.values()].some((entry) => entry.campaignId === campaign.id && entry.status !== "withdrawn");
  if (hasEntries || !campaigns.has(campaign.id)) return null;
  return saveCampaign(campaigns, campaign);
}

function updateVisibility(campaigns: Map<string, StoredCampaign>, id: string, visible: boolean, at: string) {
  const campaign = campaigns.get(id);
  if (!campaign) return null;
  return saveCampaign(campaigns, { ...campaign, visibleToUsers: visible, updatedAt: at });
}

function cancelCampaign(campaigns: Map<string, StoredCampaign>, id: string, at: string) {
  const campaign = campaigns.get(id);
  if (!campaign || !["scheduled", "open", "closed"].includes(campaign.status)) return null;
  return saveCampaign(campaigns, { ...campaign, status: "cancelled", updatedAt: at, lastError: null });
}

function campaignEntries(entries: Map<string, LotteryEntry>, jobs: Map<string, MutableJob>, campaignId: string) {
  return [...entries.values()].filter((entry) => entry.campaignId === campaignId)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
    .map((entry) => withRewardStatus(entry, jobs));
}

function findEntry(
  entries: Map<string, LotteryEntry>,
  jobs: Map<string, MutableJob>,
  key: Readonly<{ campaignId: string; userId: string; participationKey: string }>,
) {
  const entry = [...entries.values()].find((item) => item.campaignId === key.campaignId
    && item.sub2apiUserId === key.userId && item.participationKey === key.participationKey);
  return entry ? withRewardStatus(entry, jobs) : null;
}

function enterScheduled(entries: Map<string, LotteryEntry>, jobs: Map<string, MutableJob>, entry: LotteryEntry) {
  const current = findEntry(entries, jobs, entryKey(entry));
  if (current?.status === "entered") return current;
  if (current && current.status !== "withdrawn") throw new EmbedError("当前抽奖记录不能重新报名", 409);
  const next = current ? { ...entry, id: current.id } : entry;
  entries.set(next.id, next);
  return next;
}

function settleInstant(
  campaigns: Map<string, StoredCampaign>, entries: Map<string, LotteryEntry>,
  jobs: Map<string, MutableJob>, input: InstantSettlement,
) {
  const current = findEntry(entries, jobs, entryKey(input.entry));
  if (current) return current;
  const campaign = requiredOpenCampaign(campaigns, input.entry.campaignId, "instant");
  const prize = selectAvailablePrize(campaign, entries, input.roll);
  const entry = prize ? winner(input.entry, prize) : { ...input.entry, status: "not_won" as const };
  entries.set(entry.id, entry);
  if (prize) jobs.set(input.rewardJobId, newJob(input, prize));
  closeExhausted(campaigns, entries, campaign, input.entry.updatedAt);
  return entry;
}

function withdrawEntry(entries: Map<string, LotteryEntry>, jobs: Map<string, MutableJob>, input: Withdrawal) {
  const current = findEntry(entries, jobs, {
    campaignId: input.campaignId, userId: input.userId, participationKey: input.participationKey,
  });
  if (!current || current.status !== "entered") return null;
  const withdrawn = { ...current, status: "withdrawn" as const, updatedAt: input.timestamp };
  entries.set(withdrawn.id, withdrawn);
  return withdrawn;
}

function drawScheduled(
  campaigns: Map<string, StoredCampaign>, entries: Map<string, LotteryEntry>,
  jobs: Map<string, MutableJob>, input: ScheduledDraw,
) {
  const campaign = campaigns.get(input.campaignId);
  if (!campaign) throw new EmbedError("抽奖活动不存在", 404);
  if (campaign.status === "drawn") return campaign;
  if (campaign.drawMode !== "scheduled" || !campaign.drawAt || Date.parse(campaign.drawAt) > Date.parse(input.timestamp)) {
    throw new EmbedError("活动当前不能开奖", 409);
  }
  const active = campaignEntries(entries, jobs, campaign.id).filter((entry) => entry.status === "entered");
  for (const entry of active) entries.set(entry.id, { ...entry, status: "not_won", updatedAt: input.timestamp });
  for (const assignment of input.choose(active, campaign.prizes)) {
    const entry = entries.get(assignment.entryId);
    if (!entry) throw new Error("开奖候选记录不存在");
    const won = winner({ ...entry, updatedAt: input.timestamp }, assignment.prize);
    entries.set(won.id, won);
    const jobId = input.jobId();
    jobs.set(jobId, newJob({ entry: won, rewardJobId: jobId, idempotencyKey: `s2a-lottery-${jobId}`, roll: 0 }, assignment.prize));
  }
  return saveCampaign(campaigns, {
    ...campaign, status: "drawn", drawnAt: input.timestamp, updatedAt: input.timestamp, lastError: null,
  });
}

function advanceCampaigns(campaigns: Map<string, StoredCampaign>, at: string) {
  const now = Date.parse(at);
  for (const campaign of campaigns.values()) {
    if (campaign.status === "scheduled" && (!campaign.registrationStart || Date.parse(campaign.registrationStart) <= now)) {
      saveCampaign(campaigns, { ...campaign, status: "open", updatedAt: at, lastError: null });
    } else if (campaign.status === "open" && campaign.drawMode === "scheduled"
      && campaign.registrationEnd && Date.parse(campaign.registrationEnd) <= now) {
      saveCampaign(campaigns, { ...campaign, status: "closed", updatedAt: at });
    } else if (campaign.status === "open" && campaign.drawMode === "instant"
      && campaign.registrationEnd && Date.parse(campaign.registrationEnd) <= now) {
      saveCampaign(campaigns, { ...campaign, status: "drawn", drawnAt: at, updatedAt: at });
    }
  }
}

function dueCampaignIds(campaigns: Map<string, StoredCampaign>, at: string) {
  const now = Date.parse(at);
  return [...campaigns.values()].filter((campaign) => campaign.status === "closed"
    && campaign.drawMode === "scheduled" && Boolean(campaign.drawAt) && Date.parse(campaign.drawAt!) <= now)
    .map((campaign) => campaign.id);
}

function recordError(campaigns: Map<string, StoredCampaign>, id: string, message: string, at: string) {
  const campaign = campaigns.get(id);
  if (campaign) saveCampaign(campaigns, { ...campaign, lastError: message, updatedAt: at });
}

function claimJobs(entries: Map<string, LotteryEntry>, jobs: Map<string, MutableJob>, input: RewardClaim) {
  const claimTime = new Date(Date.parse(input.staleBefore) + REWARD_LEASE_MS).toISOString();
  const selected = [...jobs.values()].filter((job) => isClaimable(job, claimTime, input.staleBefore)).slice(0, input.limit);
  return selected.map((job) => {
    const attemptCount = job.attemptCount + 1;
    const claimed = { ...job, status: "processing" as const, attemptCount, lockedAt: claimTime,
      lockToken: `${job.id}:${attemptCount}` };
    jobs.set(job.id, claimed);
    setEntryRewardStatus(entries, job.entryId, "processing");
    return claimed;
  });
}

function completeJob(
  campaigns: Map<string, StoredCampaign>, entries: Map<string, LotteryEntry>,
  jobs: Map<string, MutableJob>, input: RewardCompletion,
) {
  const current = jobs.get(input.job.id);
  if (!current || current.status !== "processing" || current.lockToken !== input.job.lockToken) return false;
  jobs.set(current.id, { ...current, status: "fulfilled", lockedAt: "", lockToken: "" });
  const entry = entries.get(current.entryId);
  if (entry) entries.set(entry.id, { ...entry, redemptionCode: input.rewardCode,
    rewardCodeId: input.rewardCodeId, rewardStatus: "fulfilled", updatedAt: input.timestamp });
  const campaign = campaigns.get(current.campaignId);
  if (campaign) saveCampaign(campaigns, { ...campaign, lastError: null, updatedAt: input.timestamp });
  return true;
}

function failJob(
  campaigns: Map<string, StoredCampaign>, entries: Map<string, LotteryEntry>,
  jobs: Map<string, MutableJob>, input: RewardFailure,
) {
  const current = jobs.get(input.job.id);
  if (!current || current.status !== "processing" || current.lockToken !== input.job.lockToken) return false;
  jobs.set(current.id, { ...current, status: "retryable_failed", lockedAt: "", lockToken: "",
    nextAttemptAt: input.nextAttemptAt, lastError: input.message });
  setEntryRewardStatus(entries, current.entryId, "retryable_failed");
  const campaign = campaigns.get(current.campaignId);
  if (campaign) saveCampaign(campaigns, { ...campaign, lastError: input.message, updatedAt: input.timestamp });
  return true;
}

function requiredOpenCampaign(
  campaigns: Map<string, StoredCampaign>, id: string, mode: StoredCampaign["drawMode"],
) {
  const campaign = campaigns.get(id);
  if (!campaign || !campaign.visibleToUsers) throw new EmbedError("抽奖活动不存在", 404);
  if (campaign.drawMode !== mode || campaign.status !== "open") throw new EmbedError("活动当前不可参与", 409);
  return campaign;
}

function selectAvailablePrize(campaign: StoredCampaign, entries: Map<string, LotteryEntry>, roll: number) {
  let boundary = 0;
  for (const prize of campaign.prizes) {
    boundary += Math.round((prize.probability ?? 0) * 10_000);
    const won = [...entries.values()].filter((entry) => entry.campaignId === campaign.id
      && entry.prizeId === prize.id && entry.status === "won").length;
    if (roll < boundary) return won < prize.quantity ? prize : null;
  }
  return null;
}

function closeExhausted(
  campaigns: Map<string, StoredCampaign>, entries: Map<string, LotteryEntry>,
  campaign: StoredCampaign, at: string,
) {
  const winners = [...entries.values()].filter((entry) => entry.campaignId === campaign.id && entry.status === "won").length;
  const inventory = campaign.prizes.reduce((sum, prize) => sum + prize.quantity, 0);
  if (winners >= inventory) saveCampaign(campaigns, { ...campaign, status: "exhausted", drawnAt: at, updatedAt: at });
}

function winner(entry: LotteryEntry, prize: LotteryPrize): LotteryEntry {
  return { ...entry, status: "won", prizeId: prize.id, prizeName: prize.name, prizeType: prize.type,
    prizeValue: prize.value, rewardStatus: "pending" };
}

function newJob(input: InstantSettlement, prize: LotteryPrize): MutableJob {
  return { id: input.rewardJobId, campaignId: input.entry.campaignId, entryId: input.entry.id,
    type: prize.type, value: prize.value, attemptCount: 0, idempotencyKey: input.idempotencyKey,
    lockedAt: "", lockToken: "", status: "pending", nextAttemptAt: input.entry.updatedAt, lastError: null };
}

function withRewardStatus(entry: LotteryEntry, jobs: Map<string, MutableJob>) {
  const job = [...jobs.values()].find((item) => item.entryId === entry.id);
  return job ? { ...entry, rewardStatus: job.status } : entry;
}

function setEntryRewardStatus(entries: Map<string, LotteryEntry>, id: string, status: LotteryEntry["rewardStatus"]) {
  const entry = entries.get(id);
  if (entry) entries.set(id, { ...entry, rewardStatus: status });
}

function isClaimable(job: MutableJob, now: string, staleBefore: string) {
  if (job.status === "processing") return Boolean(job.lockedAt) && job.lockedAt < staleBefore;
  return (job.status === "pending" || job.status === "retryable_failed") && job.nextAttemptAt <= now;
}

function entryKey(entry: LotteryEntry) {
  return { campaignId: entry.campaignId, userId: entry.sub2apiUserId, participationKey: entry.participationKey };
}
