export type TargetAccountView = {
  readonly id: number;
  readonly name: string;
  readonly platform: string;
  readonly status: string;
  readonly rateMultiplier: number | null;
  readonly priority: number | null;
  readonly groupIds: readonly number[];
  readonly binding: AccountSourceBinding | null;
  readonly lastTest: AccountTestState | null;
};

export type AccountSourceBinding = { readonly sourceSiteId: number; readonly sourceGroupId: string };
export type AccountTestState = {
  readonly status: "available" | "unavailable" | "error";
  readonly message: string;
  readonly latencyMs: number;
  readonly model?: string;
  readonly testedAt: string;
};

export type AccountSourceSite = { readonly id: number; readonly name: string };
export type AccountSourceRate = {
  readonly sourceSiteId: number;
  readonly groupId: string;
  readonly groupName: string;
  readonly platform?: string;
  readonly effectiveRate: number;
};

export type AccountTestSummary = {
  readonly total: number;
  readonly available: number;
  readonly unavailable: number;
  readonly errors: number;
};

export type AccountGroupOption = {
  readonly id: number;
  readonly name: string;
  readonly rate_multiplier?: number | null;
};
