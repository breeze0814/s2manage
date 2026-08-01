import {
  lotteryEligibilityRequirement,
  type LotteryEligibilityCondition,
} from "../../core/lottery-eligibility.ts";
import { EmbedError, type EmbedIdentity } from "./types.ts";

export type LotteryEligibilityGateway = {
  readonly currentBalance: (identity: EmbedIdentity) => Promise<number | null>;
  readonly redeemedToday: (identity: EmbedIdentity, now: Date) => Promise<boolean>;
  readonly invitedToday: (identity: EmbedIdentity, now: Date) => Promise<boolean>;
};

export async function assertLotteryEligibility(input: Readonly<{
  conditions: readonly LotteryEligibilityCondition[];
  identity: EmbedIdentity;
  gateway: LotteryEligibilityGateway;
  now: Date;
}>) {
  const failures = (await Promise.all(input.conditions.map((condition) =>
    failedRequirement({ ...input, condition })))).filter((value): value is string => value !== null);
  if (failures.length) throw new EmbedError(`参与条件未满足：${failures.join("；")}`, 403);
}

async function failedRequirement(input: Readonly<{
  condition: LotteryEligibilityCondition;
  identity: EmbedIdentity;
  gateway: LotteryEligibilityGateway;
  now: Date;
}>) {
  const requirement = lotteryEligibilityRequirement(input.condition);
  try {
    if (input.condition.type === "minimum_balance") {
      const balance = await input.gateway.currentBalance(input.identity);
      return balance !== null && balance > input.condition.minimum ? null : requirement;
    }
    const passed = input.condition.type === "redeemed_today"
      ? await input.gateway.redeemedToday(input.identity, input.now)
      : await input.gateway.invitedToday(input.identity, input.now);
    return passed ? null : requirement;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new EmbedError(`暂时无法核验“${requirement}”：${detail}`, 503);
  }
}
