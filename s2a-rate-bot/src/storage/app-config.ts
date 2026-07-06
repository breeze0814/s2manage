import type { RateRuleMode } from "../core/rate-rule.ts";
import type { SourceRateSnapshot } from "../adapters/source-rates.ts";

export type TargetSettings = {
  readonly name: string;
  readonly baseUrl: string;
  readonly adminApiKey: string;
};

export type BotSettings = {
  readonly enabled: boolean;
  readonly wsUrl: string;
  readonly token: string;
  readonly targetGroupId: string;
  readonly mentionCommandEnabled: boolean;
  readonly botUserId: string;
};

export type ProxySettings = {
  readonly enabled: boolean;
  readonly httpProxy: string;
  readonly httpsProxy: string;
};

export type WorkerSettings = {
  readonly intervalSeconds: number;
};

export type TargetGroupSnapshot = {
  readonly id: number;
  readonly name: string;
  readonly status: string;
  readonly rate_multiplier: number | null;
};

export type TargetAccountSnapshot = {
  readonly id: number;
  readonly name: string;
  readonly platform: string;
  readonly status: string;
  readonly schedulable: boolean;
  readonly rateMultiplier: number | null;
  readonly priority: number | null;
  readonly groupIds: readonly number[];
};

export type SourceAccountSnapshot = {
  readonly sourceSiteId: number;
  readonly label: string;
  readonly balance: number | null;
};

export type SourceSiteConfig = {
  readonly id: number;
  readonly name: string;
  readonly siteType: "sub2api" | "newapi";
  readonly baseUrl: string;
  readonly authMode: "manual_token" | "password";
  readonly accessToken: string;
  readonly rtToken: string;
  readonly username: string;
  readonly password: string;
  readonly rechargeRatio: number;
  readonly intervalSeconds: number;
  readonly useProxy: boolean;
  readonly account: SourceAccountSnapshot | null;
  readonly rates: readonly SourceRateSnapshot[];
  readonly updatedAt: string;
};

export type SourceOverviewInput = {
  readonly site: Omit<SourceSiteConfig, "account" | "rates" | "updatedAt">;
  readonly account: SourceAccountSnapshot;
  readonly rates: readonly SourceRateSnapshot[];
};

export type GroupRuleSettings = {
  readonly targetGroupId: number;
  readonly targetGroupName: string;
  readonly currentRate: number | null;
  readonly enabled: boolean;
  readonly mode: RateRuleMode;
  readonly offset: number;
  readonly multiplier: number;
  readonly formula: string;
  readonly sourceGroupIds: readonly string[];
};

export type AppConfig = {
  readonly target: TargetSettings | null;
  readonly bot: BotSettings;
  readonly proxy: ProxySettings;
  readonly worker: WorkerSettings;
  readonly targetGroups: readonly TargetGroupSnapshot[];
  readonly accounts: readonly TargetAccountSnapshot[];
  readonly sources: readonly SourceSiteConfig[];
  readonly groupRules: readonly GroupRuleSettings[];
};

export type AppStorage = {
  readonly getAppConfig: () => Promise<AppConfig>;
  readonly saveTargetSettings: (settings: TargetSettings) => Promise<TargetSettings>;
  readonly saveBotSettings: (settings: BotSettings) => Promise<BotSettings>;
  readonly saveProxySettings: (settings: ProxySettings) => Promise<ProxySettings>;
  readonly saveWorkerSettings: (settings: WorkerSettings) => Promise<WorkerSettings>;
  readonly saveTargetGroups: (groups: readonly TargetGroupSnapshot[]) => Promise<void>;
  readonly saveTargetGroup: (group: TargetGroupSnapshot) => Promise<void>;
  readonly saveTargetAccounts: (accounts: readonly TargetAccountSnapshot[]) => Promise<void>;
  readonly saveTargetAccount: (account: TargetAccountSnapshot) => Promise<void>;
  readonly saveGroupRule: (rule: GroupRuleSettings) => Promise<GroupRuleSettings>;
  readonly saveSourceOverview: (input: SourceOverviewInput) => Promise<SourceSiteConfig>;
  readonly close: () => void;
};

export type AppStorageFactory = (databaseUrl: string) => AppStorage;

export const defaultBotSettings: BotSettings = {
  enabled: false,
  wsUrl: "",
  token: "",
  targetGroupId: "",
  mentionCommandEnabled: true,
  botUserId: "",
};

export const defaultProxySettings: ProxySettings = {
  enabled: false,
  httpProxy: "",
  httpsProxy: "",
};

export const defaultWorkerSettings: WorkerSettings = {
  intervalSeconds: 600,
};
