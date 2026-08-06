import { randomInt, randomUUID } from "node:crypto";
import { lotteryParticipationKey } from "../../core/lottery-participation.ts";
import { assertLotteryEligibility, type LotteryEligibilityGateway } from "./lottery-eligibility.ts";
import type {
  DrawAssignment, LotteryRewardJob, LotteryStore, StoredCampaign,
} from "./lottery-store-contract.ts";
import { parseCampaignInput, type CampaignInput } from "./lottery-validation.ts";
import {
  assertLotteryCampaignVisible, lotteryCampaignDetail, lotteryCampaignForViewer,
} from "./lottery-view.ts";
import type { RewardCodeGateway } from "./reward-code-gateway.ts";
import { EmbedError, type EmbedIdentity, type LotteryEntry, type LotteryPrize } from "./types.ts";

const PROBABILITY_SCALE = 1_000_000;
const REWARD_LEASE_MS = 10 * 60 * 1_000;
const MAX_REWARD_BACKOFF_EXPONENT = 6;
const REWARD_BACKOFF_MINUTES = 1;
const DEFAULT_REWARD_BATCH_SIZE = 5;

export type LotteryService = ReturnType<typeof createLotteryService>;

export function createLotteryService(input: LotteryServiceInput) {
  const dependencies: LotteryDependencies = {
    ...input, now: input.now ?? (() => new Date()), id: input.id ?? randomUUID,
    random: input.random ?? ((maximum) => randomInt(maximum)),
  };
  return {
    list: (identity?: EmbedIdentity) => listCampaigns(dependencies, identity),
    get: (id: string, identity?: EmbedIdentity) => getCampaign(dependencies, id, identity),
    create: (raw: unknown) => createCampaign(dependencies, raw),
    update: (id: string, raw: unknown) => updateCampaign(dependencies, id, raw),
    setVisibility: (id: string, visible: boolean) => setCampaignVisibility(dependencies, id, visible),
    cancel: (id: string) => cancelCampaign(dependencies, id),
    draw: (id: string) => drawScheduledCampaign(dependencies, id),
    enter: (id: string, identity: EmbedIdentity) => enterCampaign(dependencies, id, identity),
    withdraw: (id: string, identity: EmbedIdentity) => withdrawEntry(dependencies, id, identity),
    processDue: () => processDue(dependencies),
    processRewards: (limit = DEFAULT_REWARD_BATCH_SIZE) => processRewards(dependencies, limit),
  };
}

async function listCampaigns(input: LotteryDependencies, identity?: EmbedIdentity) {
  const campaigns = (await input.store.listCampaigns()).filter((campaign) => !identity || campaign.visibleToUsers);
  return Promise.all(campaigns.map((campaign) => lotteryCampaignDetail(input.store, campaign, identity, input.now())));
}

async function getCampaign(input: LotteryDependencies, id: string, identity?: EmbedIdentity) {
  const campaign = await lotteryCampaignForViewer(input.store, id, identity);
  return lotteryCampaignDetail(input.store, campaign, identity, input.now());
}

async function createCampaign(input: LotteryDependencies, raw: unknown) {
  const values = parseCampaignInput(raw);
  const timestamp = input.now().toISOString();
  const campaign = campaignRecord(input, { values, id: input.id(), createdAt: timestamp, updatedAt: timestamp });
  return lotteryCampaignDetail(input.store, await input.store.createCampaign(campaign), undefined, input.now());
}

async function updateCampaign(input: LotteryDependencies, id: string, raw: unknown) {
  const current = await requiredCampaign(input.store, id);
  assertCampaignEditable(current);
  const values = parseCampaignInput(raw);
  const updated = campaignRecord(input, { values, id, createdAt: current.createdAt, updatedAt: input.now().toISOString() });
  const saved = await input.store.updateCampaign(updated);
  if (!saved) throw new EmbedError("活动状态或参与记录已变化，无法保存", 409);
  return lotteryCampaignDetail(input.store, saved, undefined, input.now());
}

function campaignRecord(input: LotteryDependencies, record: CampaignRecordInput): StoredCampaign {
  const startsLater = record.values.registrationStart
    && new Date(record.values.registrationStart).getTime() > input.now().getTime();
  return {
    ...record.values, id: record.id,
    prizes: record.values.prizes.map((prize) => ({ ...prize, id: prize.id || input.id() })),
    status: startsLater ? "scheduled" : "open", createdAt: record.createdAt,
    updatedAt: record.updatedAt, drawnAt: null, lastError: null,
  };
}

async function enterCampaign(input: LotteryDependencies, id: string, identity: EmbedIdentity) {
  const campaign = await requiredCampaign(input.store, id);
  const now = input.now();
  assertLotteryCampaignVisible(campaign);
  await assertLotteryEligibility({ conditions: campaign.eligibilityConditions, identity, gateway: input.eligibility, now });
  assertRegistrationOpen(campaign, now);
  const participationKey = lotteryParticipationKey(campaign.participationMode, now);
  const current = await input.store.getEntry(id, identity.sub2apiUserId, participationKey);
  if (current && current.status !== "withdrawn") return current;
  const entry = newEntry(input, id, identity, participationKey, now.toISOString());
  if (campaign.drawMode === "scheduled") return input.store.enterScheduled(entry);
  const jobId = input.id();
  return input.store.settleInstant({ entry, roll: input.random(PROBABILITY_SCALE),
    rewardJobId: jobId, idempotencyKey: `s2a-lottery-${jobId}` });
}

async function withdrawEntry(input: LotteryDependencies, id: string, identity: EmbedIdentity) {
  const campaign = await requiredCampaign(input.store, id);
  const now = input.now();
  assertLotteryCampaignVisible(campaign);
  if (campaign.drawMode === "instant") throw new EmbedError("即时开奖不能撤回抽奖结果", 409);
  assertRegistrationOpen(campaign, now);
  const entry = await input.store.withdraw({ campaignId: id, userId: identity.sub2apiUserId,
    participationKey: lotteryParticipationKey(campaign.participationMode, now), timestamp: now.toISOString() });
  if (!entry) throw new EmbedError("没有可撤回的抽奖报名", 409);
  return entry;
}

async function setCampaignVisibility(input: LotteryDependencies, id: string, visible: boolean) {
  if (typeof visible !== "boolean") throw new EmbedError("活动展示状态无效", 400);
  const campaign = await input.store.setCampaignVisibility(id, visible, input.now().toISOString());
  if (!campaign) throw new EmbedError("抽奖活动不存在", 404);
  return lotteryCampaignDetail(input.store, campaign, undefined, input.now());
}

async function cancelCampaign(input: LotteryDependencies, id: string) {
  const campaign = await input.store.cancelCampaign(id, input.now().toISOString());
  if (!campaign) throw new EmbedError("活动状态已变化，无法取消", 409);
  return lotteryCampaignDetail(input.store, campaign, undefined, input.now());
}

async function drawScheduledCampaign(input: LotteryDependencies, id: string) {
  const campaign = await input.store.drawScheduled({ campaignId: id, timestamp: input.now().toISOString(),
    choose: (entries, prizes) => chooseAssignments(input, entries, prizes), jobId: input.id });
  return lotteryCampaignDetail(input.store, campaign, undefined, input.now());
}

function chooseAssignments(input: LotteryDependencies, entries: readonly LotteryEntry[], prizes: readonly LotteryPrize[]) {
  const candidates = [...entries];
  const slots = prizes.flatMap((prize) => Array.from({ length: prize.quantity }, () => prize));
  const output: DrawAssignment[] = [];
  while (candidates.length && slots.length) {
    const entry = candidates[input.random(candidates.length)];
    if (!entry) throw new Error("定时抽奖候选人选择失败");
    removeUserTickets(candidates, entry.sub2apiUserId);
    const [prize] = slots.splice(input.random(slots.length), 1);
    if (!prize) throw new Error("定时抽奖奖品匹配失败");
    output.push({ entryId: entry.id, prize });
  }
  return output;
}

function removeUserTickets(entries: LotteryEntry[], userId: string) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (entries[index]?.sub2apiUserId === userId) entries.splice(index, 1);
  }
}

async function processDue(input: LotteryDependencies) {
  const timestamp = input.now().toISOString();
  await input.store.advanceDueCampaigns(timestamp);
  const ids = await input.store.listDueScheduledCampaignIds(timestamp);
  const failures: unknown[] = [];
  for (const id of ids) {
    try { await drawScheduledCampaign(input, id); }
    catch (error) {
      failures.push(error);
      await input.store.recordCampaignError(id, errorMessage(error), input.now().toISOString());
    }
  }
  if (failures.length) throw aggregateError("定时抽奖处理失败", failures);
}

async function processRewards(input: LotteryDependencies, limit: number) {
  const staleBefore = new Date(input.now().getTime() - REWARD_LEASE_MS).toISOString();
  const jobs = await input.store.claimRewardJobs({ limit, staleBefore });
  const results = await Promise.allSettled(jobs.map((job) => processRewardJob(input, job)));
  const errors = results.filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map((result) => result.reason);
  if (errors.length) throw aggregateError("抽奖奖励发放失败", errors);
}

async function processRewardJob(input: LotteryDependencies, job: LotteryRewardJob) {
  try {
    const [reward] = await input.rewards.generate({ type: job.type, value: job.value, count: 1 }, job.idempotencyKey);
    if (!reward) throw new Error("目标站未返回抽奖兑换码");
    const saved = await input.store.completeRewardJob({ job, rewardCode: reward.code,
      rewardCodeId: reward.id, timestamp: input.now().toISOString() });
    if (!saved) throw new Error(`奖励任务 ${job.id} 的处理租约已失效`);
  } catch (error) {
    const timestamp = input.now();
    await input.store.failRewardJob({ job, message: errorMessage(error),
      nextAttemptAt: nextRewardAttempt(job, timestamp).toISOString(), timestamp: timestamp.toISOString() });
    throw error;
  }
}

function nextRewardAttempt(job: LotteryRewardJob, now: Date) {
  const exponent = Math.min(job.attemptCount, MAX_REWARD_BACKOFF_EXPONENT);
  return new Date(now.getTime() + (2 ** exponent) * REWARD_BACKOFF_MINUTES * 60_000);
}

function newEntry(input: LotteryDependencies, campaignId: string, identity: EmbedIdentity,
  participationKey: string, timestamp: string): LotteryEntry {
  return { id: input.id(), campaignId, participationKey, sub2apiUserId: identity.sub2apiUserId,
    maskedEmail: maskEmail(identity.sub2apiEmail), status: "entered", prizeId: null, prizeName: null,
    prizeType: null, prizeValue: null, redemptionCode: null, rewardCodeId: null, rewardStatus: null,
    createdAt: timestamp, updatedAt: timestamp };
}

function assertCampaignEditable(campaign: StoredCampaign) {
  if (["closed", "drawing", "drawn", "exhausted", "cancelled"].includes(campaign.status)) {
    throw new EmbedError("已结束、开奖中或已取消的活动不能编辑", 409);
  }
}

function assertRegistrationOpen(campaign: StoredCampaign, now: Date) {
  if (campaign.status !== "open") throw new EmbedError("活动当前不可参与", 409);
  if ((campaign.registrationStart && Date.parse(campaign.registrationStart) > now.getTime())
    || (campaign.registrationEnd && Date.parse(campaign.registrationEnd) <= now.getTime())) {
    throw new EmbedError("当前不在活动时间内", 409);
  }
}

async function requiredCampaign(store: LotteryStore, id: string) {
  const campaign = await store.getCampaign(id);
  if (!campaign) throw new EmbedError("抽奖活动不存在", 404);
  return campaign;
}

function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error); }
function aggregateError(summary: string, errors: readonly unknown[]) {
  return new AggregateError(errors, `${summary}：${errors.map(errorMessage).join("；")}`);
}
function maskEmail(value: string) { const [local, domain] = value.split("@"); return domain ? `${local?.slice(0, 1) || "*"}***@${domain}` : "***"; }

type LotteryServiceInput = Readonly<{ store: LotteryStore; rewards: RewardCodeGateway;
  eligibility: LotteryEligibilityGateway; now?: () => Date; id?: () => string; random?: (maximum: number) => number }>;
type LotteryDependencies = LotteryServiceInput & Readonly<{ now: () => Date; id: () => string; random: (maximum: number) => number }>;
type CampaignRecordInput = Readonly<{ values: CampaignInput; id: string; createdAt: string; updatedAt: string }>;
