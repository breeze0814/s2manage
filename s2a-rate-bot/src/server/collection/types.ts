import type { SourceAccountSnapshot } from "../../adapters/source-account-client.ts";
import type { SourceRateSnapshot } from "../../adapters/source-rates.ts";
import type { SourceAuthSession } from "../../adapters/source-rate-client.ts";

export type CollectionSiteType = "sub2api" | "newapi";
export type CollectionAuthMode = "password" | "manual_token";

export type CollectionSiteInput = {
  readonly name: string;
  readonly siteType: CollectionSiteType;
  readonly baseUrl: string;
  readonly authMode: CollectionAuthMode;
  readonly username: string;
  readonly password: string;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly rechargeRatio: number;
  readonly intervalSeconds: number;
  readonly useProxy: boolean;
  readonly enabled: boolean;
};

export type CollectionSiteStored = Omit<CollectionSiteInput, "password" | "accessToken" | "refreshToken"> & {
  readonly id: number;
  readonly passwordEnc: string;
  readonly accessTokenEnc: string;
  readonly refreshTokenEnc: string;
  readonly accountLabel: string | null;
  readonly balance: number | null;
  readonly lastRunAt: string | null;
  readonly lastSuccessAt: string | null;
  readonly lastStatus: "success" | "failed" | null;
  readonly lastError: string | null;
  readonly consecutiveFailures: number;
};

export type CollectionSiteRuntime = Omit<CollectionSiteStored, "passwordEnc" | "accessTokenEnc" | "refreshTokenEnc"> & {
  readonly password: string;
  readonly accessToken: string;
  readonly refreshToken: string;
};

export type CollectionSiteView = Omit<CollectionSiteRuntime, "password" | "accessToken" | "refreshToken"> & {
  readonly hasPassword: boolean;
  readonly hasAccessToken: boolean;
  readonly hasRefreshToken: boolean;
};

export type CollectionOverview = {
  readonly account: SourceAccountSnapshot;
  readonly rates: readonly SourceRateSnapshot[];
  readonly credentials?: SourceAuthSession;
};

export type CollectionCollector = {
  readonly collect: (input: {
    readonly site: CollectionSiteRuntime;
    readonly timeoutMs: number;
    readonly proxyUrl: string | null;
    readonly targetRechargeRatio: number;
  }) => Promise<CollectionOverview>;
};

export type CollectionRequestOptions = {
  readonly timeoutMs: number;
  readonly proxyUrl: string | null;
  readonly targetRechargeRatio: number;
};
