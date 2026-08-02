export type SourceSiteView = {
  readonly id: number;
  readonly name: string;
  readonly remark: string;
  readonly siteType: "sub2api" | "newapi";
  readonly baseUrl: string;
  readonly websiteUrl: string;
  readonly authMode: "password" | "manual_token";
  readonly username: string;
  readonly newApiUserId: string;
  readonly rechargeRatio: number;
  readonly balanceAlertThreshold: number | null;
  readonly intervalSeconds: number;
  readonly useProxy: boolean;
  readonly enabled: boolean;
  readonly accountLabel: string | null;
  readonly balance: number | null;
  readonly todayConsume: number | null;
  readonly historyRecharge: number | null;
  readonly lastRunAt: string | null;
  readonly lastSuccessAt: string | null;
  readonly lastStatus: "success" | "failed" | null;
  readonly lastError: string | null;
  readonly consecutiveFailures: number;
  readonly hasPassword: boolean;
  readonly hasAccessToken: boolean;
  readonly hasRefreshToken: boolean;
};

export type SourceRateView = {
  readonly sourceSiteId: number;
  readonly groupId: string;
  readonly groupName: string;
  readonly platform?: string;
  readonly platformOverride?: string | null;
  readonly groupType?: string | null;
  readonly rawRate: number | null;
  readonly effectiveRate: number;
  readonly collectedAt: string;
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

export type SourceRateHistoryTarget = {
  readonly siteId: number;
  readonly siteName: string;
  readonly groupId: string;
  readonly groupName: string;
  readonly platform?: string;
  readonly groupType?: string | null;
};

export type SourceRateChangeView = {
  readonly id: number;
  readonly runId: number;
  readonly sourceSiteId: number;
  readonly sourceSiteName: string;
  readonly groupId: string;
  readonly groupName: string;
  readonly platform: string | null;
  readonly changeType: "added" | "updated" | "deleted";
  readonly oldRate: number | null;
  readonly newRate: number | null;
  readonly collectedAt: string;
};

export type SourceRunView = {
  readonly id: number;
  readonly sourceSiteId: number;
  readonly sourceSiteName: string;
  readonly status: "success" | "failed";
  readonly error: string | null;
  readonly groupCount: number;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly durationMs: number;
};

export type SourceSiteForm = {
  name: string;
  remark: string;
  siteType: "sub2api" | "newapi";
  baseUrl: string;
  websiteUrl: string;
  authMode: "password" | "manual_token";
  username: string;
  newApiUserId: string;
  password: string;
  accessToken: string;
  refreshToken: string;
  rechargeRatio: string;
  balanceAlertThreshold: string;
  intervalSeconds: string;
  useProxy: boolean;
  enabled: boolean;
};
