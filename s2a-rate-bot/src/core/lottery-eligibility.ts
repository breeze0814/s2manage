export const DEFAULT_MINIMUM_LOTTERY_BALANCE = 10;

export type LotteryEligibilityCondition =
  | Readonly<{ type: "minimum_balance"; minimum: number }>
  | Readonly<{ type: "redeemed_today" }>
  | Readonly<{ type: "invited_today" }>;

export const DEFAULT_LOTTERY_ELIGIBILITY_CONDITIONS: readonly LotteryEligibilityCondition[] =
  Object.freeze([{ type: "minimum_balance", minimum: DEFAULT_MINIMUM_LOTTERY_BALANCE }]);

export function lotteryEligibilityRequirement(condition: LotteryEligibilityCondition) {
  if (condition.type === "minimum_balance") return `当前余额大于 ${condition.minimum}`;
  if (condition.type === "redeemed_today") return "当天已使用兑换码";
  return "当天已成功邀请好友";
}
