import { lotteryParticipationKey } from "../../core/lottery-participation.ts";
import type { LotteryStore, StoredCampaign } from "./lottery-store-contract.ts";
import {
  EmbedError, type EmbedIdentity, type LotteryCampaign, type LotteryEntry, type LotteryPrize,
} from "./types.ts";

export async function lotteryCampaignDetail(
  store: LotteryStore,
  campaign: StoredCampaign,
  identity?: EmbedIdentity,
  now = new Date(),
): Promise<LotteryCampaign> {
  const entries = await store.listEntries(campaign.id);
  const mine = identity ? userEntries(entries, identity.sub2apiUserId) : [];
  const winners = entries.filter((entry) => entry.status === "won");
  const visibleWinners = !identity || campaign.publicWinners
    ? winners
    : winners.filter((entry) => entry.sub2apiUserId === identity.sub2apiUserId);
  return {
    ...campaign,
    entryCount: entries.filter((entry) => entry.status !== "withdrawn").length,
    winnerCount: winners.length,
    prizeInventory: campaign.prizes.map((prize) => inventoryFor(prize, entries)),
    currentEntry: identity ? currentEntry(campaign, mine, now) : null,
    myEntries: mine.map(redactEntry(identity)),
    winners: visibleWinners.map(redactEntry(identity)),
    lastError: identity ? null : campaign.lastError,
  };
}

export async function lotteryCampaignForViewer(
  store: LotteryStore,
  id: string,
  identity?: EmbedIdentity,
) {
  const campaign = await store.getCampaign(id);
  if (!campaign || (identity && !campaign.visibleToUsers)) throw new EmbedError("抽奖活动不存在", 404);
  return campaign;
}

export function assertLotteryCampaignVisible(campaign: StoredCampaign) {
  if (!campaign.visibleToUsers) throw new EmbedError("抽奖活动不存在", 404);
}

function userEntries(entries: readonly LotteryEntry[], userId: string) {
  return entries.filter((entry) => entry.sub2apiUserId === userId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));
}

function currentEntry(campaign: StoredCampaign, entries: readonly LotteryEntry[], now: Date) {
  const key = lotteryParticipationKey(campaign.participationMode, now);
  return entries.find((entry) => entry.participationKey === key) ?? null;
}

function inventoryFor(prize: LotteryPrize, entries: readonly LotteryEntry[]) {
  const awarded = entries.filter((entry) => entry.prizeId === prize.id && entry.status === "won").length;
  return { prizeId: prize.id, awarded, remaining: Math.max(0, prize.quantity - awarded) };
}

function redactEntry(identity?: EmbedIdentity) {
  return (entry: LotteryEntry): LotteryEntry => !identity || identity.sub2apiUserId === entry.sub2apiUserId
    ? entry
    : { ...entry, sub2apiUserId: "", redemptionCode: null, rewardCodeId: null, rewardStatus: null };
}
