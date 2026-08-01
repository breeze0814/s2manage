import type { LotteryStore, StoredCampaign } from "./lottery-store.ts";
import {
  EmbedError,
  type EmbedIdentity,
  type LotteryCampaign,
  type LotteryEntry,
  type LotteryPrize,
} from "./types.ts";

export function lotteryCampaignDetail(
  store: LotteryStore,
  campaign: StoredCampaign,
  identity?: EmbedIdentity,
): LotteryCampaign {
  const entries = store.listEntries(campaign.id);
  const winners = entries.filter((entry) => entry.status === "won");
  const visibleWinners = !identity || campaign.publicWinners
    ? winners
    : winners.filter((entry) => entry.sub2apiUserId === identity.sub2apiUserId);
  return {
    ...campaign,
    entryCount: entries.filter((entry) => entry.status !== "withdrawn").length,
    winnerCount: winners.length,
    prizeInventory: campaign.prizes.map((prize) => inventoryFor(prize, entries)),
    currentEntry: identity
      ? visibleCurrentEntry(campaign,
        entries.find((entry) => entry.sub2apiUserId === identity.sub2apiUserId) ?? null)
      : null,
    winners: visibleWinners.map(redactEntry(identity)),
    lastError: identity ? null : campaign.lastError,
  };
}

export function lotteryCampaignForViewer(
  store: LotteryStore,
  id: string,
  identity?: EmbedIdentity,
) {
  const campaign = store.getCampaign(id);
  if (!campaign || (identity && !campaign.visibleToUsers)) {
    throw new EmbedError("抽奖活动不存在", 404);
  }
  return campaign;
}

export function assertLotteryCampaignVisible(campaign: StoredCampaign) {
  if (!campaign.visibleToUsers) throw new EmbedError("抽奖活动不存在", 404);
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
  return (entry: LotteryEntry): LotteryEntry => !identity
    || identity.sub2apiUserId === entry.sub2apiUserId
    ? entry
    : { ...entry, sub2apiUserId: "", redemptionCode: null, rewardCodeId: null };
}
