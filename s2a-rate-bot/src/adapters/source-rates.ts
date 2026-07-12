export type SourceRateSnapshot = {
  readonly sourceSiteId: number;
  readonly groupId: string;
  readonly groupName: string;
  readonly platform?: string;
  readonly platformOverride?: string | null;
  readonly rawRate: number | null;
  readonly effectiveRate: number;
  readonly collectedAt: Date;
};

export type SourceRateAdapter = {
  readonly collectRates: (sourceSiteId: number) => Promise<readonly SourceRateSnapshot[]>;
};

export function sourceRateKey(rate: Pick<SourceRateSnapshot, "sourceSiteId" | "groupId">) {
  return `${rate.sourceSiteId}:${rate.groupId}`;
}
