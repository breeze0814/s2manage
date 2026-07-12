import type { SourceRateSnapshot } from "../../adapters/source-rates.ts";
import type { CollectionRateChangeType } from "./types.ts";

export type PendingRateChange = {
  readonly groupId: string;
  readonly groupName: string;
  readonly platform: string | null;
  readonly changeType: CollectionRateChangeType;
  readonly oldRate: number | null;
  readonly newRate: number | null;
};

export function compareRateSnapshots(
  previous: readonly SourceRateSnapshot[],
  current: readonly SourceRateSnapshot[],
): PendingRateChange[] {
  const previousById = new Map(previous.map((rate) => [rate.groupId, rate]));
  const currentById = new Map(current.map((rate) => [rate.groupId, rate]));
  const changes = current.flatMap((rate) => compareCurrentRate(rate, previousById.get(rate.groupId)));
  return [...changes, ...deletedRates(previous, currentById)];
}

function compareCurrentRate(rate: SourceRateSnapshot, previous?: SourceRateSnapshot) {
  if (!previous) return [rateChange(rate, "added", null, rate.effectiveRate)];
  if (Object.is(previous.effectiveRate, rate.effectiveRate)) return [];
  return [rateChange(rate, "updated", previous.effectiveRate, rate.effectiveRate)];
}

function deletedRates(
  previous: readonly SourceRateSnapshot[],
  currentById: ReadonlyMap<string, SourceRateSnapshot>,
) {
  return previous
    .filter((rate) => !currentById.has(rate.groupId))
    .map((rate) => rateChange(rate, "deleted", rate.effectiveRate, null));
}

function rateChange(
  rate: SourceRateSnapshot,
  changeType: CollectionRateChangeType,
  oldRate: number | null,
  newRate: number | null,
): PendingRateChange {
  return {
    groupId: rate.groupId,
    groupName: rate.groupName,
    platform: rate.platform ?? null,
    changeType,
    oldRate,
    newRate,
  };
}
