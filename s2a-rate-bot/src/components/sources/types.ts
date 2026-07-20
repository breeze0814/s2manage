export type SourceSiteView = {
  readonly id: number;
  readonly name: string;
  readonly siteType: "sub2api" | "newapi";
  readonly baseUrl: string;
  readonly websiteUrl: string;
  readonly authMode: "password" | "manual_token";
  readonly username: string;
  readonly newApiUserId: string;
  readonly rechargeRatio: number;
  readonly intervalSeconds: number;
  readonly useProxy: boolean;
  readonly enabled: boolean;
  readonly accountLabel: string | null;
  readonly balance: number | null;
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
  readonly rawRate: number | null;
  readonly effectiveRate: number;
  readonly collectedAt: string;
};

export type SourceSiteForm = {
  name: string;
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
  intervalSeconds: string;
  useProxy: boolean;
  enabled: boolean;
};
