import type { RateRule, RateTarget } from "../core/rate-rule.ts";

export type ConnectionRecord = {
  readonly id: number;
  readonly name: string;
  readonly baseUrl: string;
  readonly adminApiKeyEnc: string;
  readonly enabled: boolean;
};

export type SourceSiteRecord = {
  readonly id: number;
  readonly connectionId: number;
  readonly name: string;
  readonly baseUrl: string;
  readonly siteType: "bl" | "sub2api" | "newapi";
  readonly enabled: boolean;
  readonly intervalSeconds: number;
  readonly rechargeRatio: number;
};

export type RateBindingRecord = {
  readonly id: number;
  readonly connectionId: number;
  readonly sourceSiteId: number;
  readonly sourceGroupIds: readonly string[];
  readonly sourceGroupName: string | null;
  readonly target: RateTarget;
  readonly rule: RateRule;
};

export type JobRunRecord = {
  readonly id: number;
  readonly kind: "worker" | "bot";
  readonly status: "running" | "success" | "failed";
  readonly message: string;
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
};

export type RateBotStorage = {
  readonly listEnabledConnections: () => Promise<readonly ConnectionRecord[]>;
  readonly listDueSourceSites: (connectionId: number, now: Date) => Promise<readonly SourceSiteRecord[]>;
  readonly listRateBindings: (connectionId: number) => Promise<readonly RateBindingRecord[]>;
  readonly recordJobRun: (run: Omit<JobRunRecord, "id">) => Promise<JobRunRecord>;
};
