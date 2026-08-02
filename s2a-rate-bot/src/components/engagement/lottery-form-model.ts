import type { LotteryCampaign, LotteryPrize } from "../../server/embeds/types";
import { DEFAULT_MINIMUM_LOTTERY_BALANCE, type LotteryEligibilityCondition } from "../../core/lottery-eligibility";

export type LotteryFormDraft = {
  name: string;
  description: string;
  drawMode: "instant" | "scheduled";
  registrationStart: string;
  registrationEnd: string;
  drawAt: string;
  visibleToUsers: boolean;
  eligibilityConditions: LotteryEligibilityCondition[];
  publicWinners: boolean;
  prizes: LotteryPrize[];
};

export const PRIZE_TYPE_OPTIONS = [
  { value: "balance", label: "余额" },
  { value: "subscription", label: "订阅" },
] as const;

const DEFAULT_PRIZE_VALUE = 10;
const DEFAULT_PROBABILITY = 10;

export function initialLotteryDraft(campaign: LotteryCampaign | null): LotteryFormDraft {
  if (!campaign) {
    return {
      name: "",
      description: "",
      drawMode: "instant",
      registrationStart: "",
      registrationEnd: "",
      drawAt: "",
      visibleToUsers: true,
      eligibilityConditions: [{ type: "minimum_balance", minimum: DEFAULT_MINIMUM_LOTTERY_BALANCE }],
      publicWinners: true,
      prizes: [emptyLotteryPrize()],
    };
  }
  return {
    name: campaign.name,
    description: campaign.description,
    drawMode: campaign.drawMode,
    registrationStart: toInput(campaign.registrationStart),
    registrationEnd: toInput(campaign.registrationEnd),
    drawAt: toInput(campaign.drawAt),
    visibleToUsers: campaign.visibleToUsers,
    eligibilityConditions: [...campaign.eligibilityConditions],
    publicWinners: campaign.publicWinners,
    prizes: campaign.prizes.map((prize) => ({ ...prize })),
  };
}

export function emptyLotteryPrize(): LotteryPrize {
  return { id: crypto.randomUUID(), name: "", type: "balance", value: DEFAULT_PRIZE_VALUE, quantity: 1, probability: DEFAULT_PROBABILITY };
}

export function changeLotteryDrawMode(draft: LotteryFormDraft, drawMode: LotteryFormDraft["drawMode"]): LotteryFormDraft {
  return {
    ...draft,
    drawMode,
    drawAt: drawMode === "instant" ? "" : draft.drawAt,
    prizes: draft.prizes.map((prize) => ({
      ...prize,
      probability: drawMode === "instant" ? prize.probability ?? DEFAULT_PROBABILITY : null,
    })),
  };
}

export function lotteryRequestBody(draft: LotteryFormDraft) {
  return {
    ...draft,
    registrationStart: toIso(draft.registrationStart),
    registrationEnd: toIso(draft.registrationEnd),
    drawAt: draft.drawMode === "scheduled" ? toIso(draft.drawAt) : null,
  };
}

function toIso(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function toInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}
