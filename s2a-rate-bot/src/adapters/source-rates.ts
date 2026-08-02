export type SourceRateSnapshot = {
  readonly sourceSiteId: number;
  readonly groupId: string;
  readonly groupName: string;
  readonly platform?: string;
  readonly platformOverride?: string | null;
  readonly groupType?: string | null;
  readonly rawRate: number | null;
  readonly effectiveRate: number;
  readonly collectedAt: Date;
  readonly mappingStatus?: "mapped" | "unmapped";
  readonly connected?: boolean;
  readonly connectionId?: string | null;
  readonly connectionStatus?: "provisioning" | "active" | "disconnecting" | "error" | null;
  readonly connectionStage?: string | null;
  readonly connectionError?: string | null;
  readonly pricingMapped?: boolean;
  readonly deleted?: boolean;
  readonly delta?: number | null;
  readonly deltaPercent?: number | null;
};

export type SourceRateAdapter = {
  readonly collectRates: (sourceSiteId: number) => Promise<readonly SourceRateSnapshot[]>;
};

export function sourceRateKey(rate: Pick<SourceRateSnapshot, "sourceSiteId" | "groupId">) {
  return `${rate.sourceSiteId}:${rate.groupId}`;
}
