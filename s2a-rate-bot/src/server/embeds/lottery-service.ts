import { randomInt, randomUUID } from "node:crypto";
import type { DrawAssignment, LotteryStore, StoredCampaign } from "./lottery-store.ts";
import { parseCampaignInput, type CampaignInput } from "./lottery-validation.ts";
import type { RewardCodeGateway } from "./reward-code-gateway.ts";
import { EmbedError, type EmbedIdentity, type LotteryCampaign, type LotteryEntry, type LotteryPrize } from "./types.ts";

export type LotteryService = ReturnType<typeof createLotteryService>;
const PROBABILITY_SCALE = 1_000_000;
export const MINIMUM_LOTTERY_BALANCE = 10;

export function createLotteryService(input: {
  readonly store: LotteryStore;
  readonly rewards: RewardCodeGateway;
  readonly balance?: (identity: EmbedIdentity) => Promise<number | null>;
  readonly now?: () => Date;
  readonly id?: () => string;
  readonly random?: (maximum: number) => number;
}) {
  const dependencies: LotteryDependencies = {
    ...input, now: input.now ?? (() => new Date()), id: input.id ?? randomUUID,
    random: input.random ?? ((maximum: number) => randomInt(maximum)),
    balance: input.balance ?? (async (identity) => identity.sub2apiBalance),
  };
  return {
    list: (identity?: EmbedIdentity) => input.store.listCampaigns()
      .map((campaign) => detail(input.store, campaign, identity)),
    get: (id: string, identity?: EmbedIdentity) => detail(
      input.store, requiredCampaign(input.store, id), identity,
    ),
    create: (raw: unknown) => createCampaign(dependencies, raw),
    update: (id: string, raw: unknown) => updateCampaign(dependencies, id, raw),
    cancel: (id: string) => cancelCampaign(dependencies, id),
    draw: (id: string) => drawScheduledCampaign(dependencies, id),
    enter: (id: string, identity: EmbedIdentity) => enterCampaign(dependencies, id, identity),
    withdraw: (id: string, identity: EmbedIdentity) => withdrawEntry(dependencies, id, identity),
    processDue: () => processDue(dependencies),
  };
}

function createCampaign(input: LotteryDependencies, raw: unknown) {
  const values = parseCampaignInput(raw);
  const timestamp = input.now().toISOString();
  const campaign = campaignRecord(input, {
    values, id: input.id(), createdAt: timestamp, updatedAt: timestamp,
  });
  return detail(input.store, input.store.createCampaign(campaign));
}

function updateCampaign(input: LotteryDependencies, id: string, raw: unknown) {
  const current = requiredCampaign(input.store, id);
  if (current.status === "drawn" || current.status === "exhausted" || current.status === "cancelled") {
    throw new EmbedError("已结束或已取消的活动不能编辑", 409);
  }
  if (current.status === "drawing") {
    throw new EmbedError("开奖处理中不能编辑活动", 409);
  }
  if (input.store.listEntries(id).some((entry) => entry.status !== "withdrawn")) {
    throw new EmbedError("已有参与记录的活动不能编辑", 409);
  }
  const values = parseCampaignInput(raw);
  const updated = campaignRecord(input, {
    values, id, createdAt: current.createdAt, updatedAt: input.now().toISOString(),
  });
  const saved = input.store.updateCampaign(updated);
  if (!saved) throw new EmbedError("活动状态或参与记录已变化，无法保存", 409);
  return detail(input.store, saved);
}

function campaignRecord(
  input: LotteryDependencies,
  record: Readonly<{ values: CampaignInput; id: string; createdAt: string; updatedAt: string }>,
): StoredCampaign {
  const startsLater = record.values.registrationStart
    && new Date(record.values.registrationStart).getTime() > input.now().getTime();
  return {
    ...record.values, id: record.id,
    prizes: record.values.prizes.map((prize) => ({ ...prize, id: prize.id || input.id() })),
    status: startsLater ? "scheduled" : "open",
    createdAt: record.createdAt, updatedAt: record.updatedAt, drawnAt: null, lastError: null,
  };
}

async function enterCampaign(input: LotteryDependencies, id: string, identity: EmbedIdentity) {
  await assertEligibleBalance(input, identity);
  const campaign = requiredCampaign(input.store, id);
  assertRegistrationOpen(campaign, input.now());
  const current = input.store.getEntry(id, identity.sub2apiUserId);
  if (current && current.status !== "withdrawn") return assertTerminalInstant(campaign, current);
  const entry = newEntry(input, id, identity);
  return campaign.drawMode === "instant"
    ? enterInstant(input, campaign, entry)
    : input.store.enter(entry);
}

async function assertEligibleBalance(input: LotteryDependencies, identity: EmbedIdentity) {
  let balance: number | null;
  try {
    balance = await input.balance(identity);
  } catch {
    throw new EmbedError("暂时无法核验账户余额，请稍后重试", 503);
  }
  if (balance === null || balance <= MINIMUM_LOTTERY_BALANCE) {
    throw new EmbedError(`账户余额必须大于 ${MINIMUM_LOTTERY_BALANCE} 才能参与抽奖`, 403);
  }
}

async function enterInstant(input: LotteryDependencies, campaign: StoredCampaign, entry: LotteryEntry) {
  const prize = selectedInstantPrize(input, campaign);
  if (!prize) return input.store.recordInstantLoss({ ...entry, status: "not_won" });
  const reserved = input.store.reserveInstant(entry, prize);
  if (!reserved) return input.store.recordInstantLoss({ ...entry, status: "not_won" });
  try {
    const [reward] = await input.rewards.generate({ type: prize.type, value: prize.value, count: 1 });
    if (!reward) throw new Error("目标站未返回即时抽奖兑换码");
    input.store.completeInstant(reserved.id, reward, input.now().toISOString());
    return requiredEntry(input.store, campaign.id, entry.sub2apiUserId);
  } catch (error) {
    input.store.releaseInstant(reserved.id);
    throw error;
  }
}

function selectedInstantPrize(input: LotteryDependencies, campaign: StoredCampaign) {
  const entries = input.store.listEntries(campaign.id);
  const target = input.random(PROBABILITY_SCALE);
  let boundary = 0;
  for (const prize of campaign.prizes) {
    if (prize.probability === null) throw new Error(`奖品 ${prize.name} 缺少即时中奖率`);
    boundary += Math.round(prize.probability * PROBABILITY_SCALE / 100);
    if (target >= boundary) continue;
    const allocated = entries.filter((entry) => entry.prizeId === prize.id
      && (entry.status === "entered" || entry.status === "won")).length;
    return allocated < prize.quantity ? prize : null;
  }
  return null;
}

function withdrawEntry(input: LotteryDependencies, id: string, identity: EmbedIdentity) {
  const campaign = requiredCampaign(input.store, id);
  if (campaign.drawMode === "instant") throw new EmbedError("即时开奖不能撤回抽奖结果", 409);
  assertRegistrationOpen(campaign, input.now());
  const entry = input.store.withdraw(id, identity.sub2apiUserId, input.now().toISOString());
  if (!entry) throw new EmbedError("没有可撤回的抽奖报名", 409);
  return entry;
}

function cancelCampaign(input: LotteryDependencies, id: string) {
  const campaign = requiredCampaign(input.store, id);
  if (campaign.status === "drawing") throw new EmbedError("开奖处理中不能取消活动", 409);
  if (campaign.status === "drawn" || campaign.status === "exhausted") {
    throw new EmbedError("已产生抽奖结果的活动不能取消", 409);
  }
  const cancelled = input.store.setCampaignStatus(id, "cancelled", input.now().toISOString());
  if (!cancelled) throw new EmbedError("活动状态已变化，无法取消", 409);
  return detail(input.store, cancelled);
}

async function drawScheduledCampaign(input: LotteryDependencies, id: string) {
  const campaign = requiredCampaign(input.store, id);
  if (campaign.drawMode !== "scheduled") throw new EmbedError("即时开奖由用户抽奖时自动完成", 409);
  if (campaign.status === "drawn") return detail(input.store, campaign);
  if (campaign.status === "cancelled") throw new EmbedError("已取消活动不能开奖", 409);
  if (!isReached(campaign.drawAt, input.now())) throw new EmbedError("尚未到定时开奖时间", 409);
  const timestamp = input.now().toISOString();
  const acquired = campaign.status === "drawing"
    ? input.store.resumeDraw(id, timestamp)
    : input.store.startDraw(id, timestamp);
  if (!acquired) return detail(input.store, requiredCampaign(input.store, id));
  try {
    await completeScheduledDraw(input, id, timestamp);
    return detail(input.store, requiredCampaign(input.store, id));
  } catch (error) {
    input.store.recordDrawError(id, errorMessage(error), input.now().toISOString());
    throw error;
  }
}

function chooseAssignments(input: LotteryDependencies, entries: readonly LotteryEntry[], prizes: readonly LotteryPrize[]) {
  const candidates = [...entries];
  const slots = prizes.flatMap((prize) => Array.from({ length: prize.quantity }, () => prize));
  const output: DrawAssignment[] = [];
  while (candidates.length && slots.length) {
    const entry = candidates.splice(input.random(candidates.length), 1)[0];
    const prize = slots.splice(input.random(slots.length), 1)[0];
    if (!entry || !prize) throw new Error("定时抽奖候选人与奖品匹配失败");
    output.push({ entryId: entry.id, prize });
  }
  return output;
}

async function completeScheduledDraw(input: LotteryDependencies, campaignId: string, timestamp: string) {
  const campaign = requiredCampaign(input.store, campaignId);
  let entries = input.store.listEntries(campaignId);
  if (!entries.some((entry) => entry.prizeId !== null)) {
    const candidates = entries.filter((entry) => entry.status === "entered");
    input.store.saveDrawPlan(campaignId, chooseAssignments(input, candidates, campaign.prizes), timestamp);
    entries = input.store.listEntries(campaignId);
  }
  for (const entry of entries.filter(needsReward)) await generatePlannedReward(input, entry);
  input.store.finishDraw(campaignId, input.now().toISOString());
}

async function generatePlannedReward(input: LotteryDependencies, entry: LotteryEntry) {
  if (!entry.prizeType || entry.prizeValue === null) throw new Error("中奖计划缺少奖励配置");
  const [reward] = await input.rewards.generate({ type: entry.prizeType, value: entry.prizeValue, count: 1 });
  if (!reward) throw new Error(`奖品 ${entry.prizeName ?? entry.prizeId} 缺少兑换码`);
  input.store.savePlannedReward(entry.id, reward, input.now().toISOString());
}

async function processDue(input: LotteryDependencies) {
  const now = input.now();
  for (const snapshot of input.store.listCampaigns()) {
    let campaign = snapshot;
    if (campaign.status === "scheduled" && isReached(campaign.registrationStart, now)) {
      campaign = input.store.setCampaignStatus(campaign.id, "open", now.toISOString()) ?? campaign;
    }
    if (campaign.drawMode === "scheduled" && dueCampaign(campaign, now)) {
      await drawScheduledCampaign(input, campaign.id);
    }
    if (campaign.drawMode === "instant" && dueInstantClose(campaign, now)) {
      input.store.setCampaignStatus(campaign.id, "drawn", now.toISOString());
    }
  }
}

function detail(store: LotteryStore, campaign: StoredCampaign, identity?: EmbedIdentity): LotteryCampaign {
  const entries = store.listEntries(campaign.id);
  const winners = entries.filter((entry) => entry.status === "won");
  const visible = !identity || campaign.publicWinners
    ? winners
    : winners.filter((entry) => entry.sub2apiUserId === identity.sub2apiUserId);
  return {
    ...campaign, entryCount: entries.filter((entry) => entry.status !== "withdrawn").length,
    winnerCount: winners.length,
    prizeInventory: campaign.prizes.map((prize) => inventoryFor(prize, entries)),
    currentEntry: identity ? visibleCurrentEntry(campaign,
      entries.find((entry) => entry.sub2apiUserId === identity.sub2apiUserId) ?? null) : null,
    winners: visible.map(redactEntry(identity)),
    lastError: identity ? null : campaign.lastError,
  };
}

function inventoryFor(prize: LotteryPrize, entries: readonly LotteryEntry[]) {
  const awarded = entries.filter((entry) => entry.prizeId === prize.id
    && (entry.status === "entered" || entry.status === "won")).length;
  return { prizeId: prize.id, awarded, remaining: Math.max(0, prize.quantity - awarded) };
}

function visibleCurrentEntry(campaign: StoredCampaign, entry: LotteryEntry | null) {
  if (!entry || campaign.status !== "drawing" || entry.status !== "entered") return entry;
  return { ...entry, prizeId: null, prizeName: null, prizeType: null, prizeValue: null };
}

function redactEntry(identity?: EmbedIdentity) {
  return (entry: LotteryEntry): LotteryEntry => !identity || identity.sub2apiUserId === entry.sub2apiUserId
    ? entry
    : { ...entry, sub2apiUserId: "", redemptionCode: null, rewardCodeId: null };
}

function newEntry(input: LotteryDependencies, campaignId: string, identity: EmbedIdentity): LotteryEntry {
  const timestamp = input.now().toISOString();
  return {
    id: input.id(), campaignId, sub2apiUserId: identity.sub2apiUserId,
    maskedEmail: maskEmail(identity.sub2apiEmail), status: "entered", prizeId: null,
    prizeName: null, prizeType: null, prizeValue: null, redemptionCode: null,
    rewardCodeId: null, createdAt: timestamp, updatedAt: timestamp,
  };
}

function assertTerminalInstant(campaign: StoredCampaign, entry: LotteryEntry) {
  if (campaign.drawMode !== "instant" || entry.status !== "entered") return entry;
  throw new EmbedError("即时抽奖记录仍在处理中，请勿重复提交", 409);
}

function assertRegistrationOpen(campaign: StoredCampaign, now: Date) {
  if (campaign.status !== "open") throw new EmbedError("活动当前不可参与", 409);
  if ((campaign.registrationStart && !isReached(campaign.registrationStart, now))
    || (campaign.registrationEnd && isReached(campaign.registrationEnd, now))) {
    throw new EmbedError("当前不在活动时间内", 409);
  }
}

function isReached(value: string | null, now: Date) { return value ? new Date(value).getTime() <= now.getTime() : false; }
function dueCampaign(value: StoredCampaign, now: Date) {
  if (value.status === "drawing") return value.lastError !== null;
  return value.status !== "drawn" && value.status !== "cancelled" && isReached(value.drawAt, now);
}
function dueInstantClose(value: StoredCampaign, now: Date) { return value.status === "open" && isReached(value.registrationEnd, now); }
function requiredCampaign(store: LotteryStore, id: string) { return required(store.getCampaign(id)); }
function requiredEntry(store: LotteryStore, campaignId: string, userId: string) {
  const entry = store.getEntry(campaignId, userId);
  if (!entry) throw new EmbedError("抽奖记录不存在", 404);
  return entry;
}
function required<T>(value: T | null): T { if (!value) throw new EmbedError("抽奖活动不存在", 404); return value; }
function needsReward(entry: LotteryEntry) { return entry.status === "entered" && entry.prizeId !== null && entry.redemptionCode === null; }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error); }
function maskEmail(value: string) { const [local, domain] = value.split("@"); return domain ? `${local?.slice(0, 1) || "*"}***@${domain}` : "***"; }
type LotteryDependencies = Parameters<typeof createLotteryService>[0] & {
  readonly now: () => Date;
  readonly id: () => string;
  readonly random: (maximum: number) => number;
  readonly balance: (identity: EmbedIdentity) => Promise<number | null>;
};
