import { getSub2ApiSourceAccount } from "../adapters/source-account-client.ts";
import { collectSub2ApiSourceRates, type SourceRateRequest } from "../adapters/source-rate-client.ts";
import { sourceRateKey, type SourceRateSnapshot } from "../adapters/source-rates.ts";
import { Sub2ApiAdminTarget, type Sub2ApiGroup } from "../adapters/sub2api-admin.ts";
import { resolveRateUpdate } from "../core/rate-rule.ts";
import type { AppStorage, SourceSiteConfig, TargetGroupSnapshot, TargetSettings } from "../storage/app-config.ts";

export type Sub2WorkerSummary = {
  readonly collectedSources: number;
  readonly skippedSources: number;
  readonly failedSources: number;
  readonly updatedGroups: number;
  readonly skippedGroups: number;
  readonly failedGroups: number;
  readonly errors: readonly string[];
};

export type Sub2WorkerCycleInput = {
  readonly storage: AppStorage;
  readonly now?: Date;
  readonly collectSource?: (source: SourceSiteConfig, proxyUrl: string | null) => Promise<SourceOverview>;
  readonly updateGroup?: (target: TargetSettings, groupId: number, nextRate: number) => Promise<Sub2ApiGroup>;
};

type MutableSummary = {
  collectedSources: number;
  skippedSources: number;
  failedSources: number;
  updatedGroups: number;
  skippedGroups: number;
  failedGroups: number;
  errors: string[];
};

type SourceOverview = {
  readonly account: { readonly sourceSiteId: number; readonly label: string; readonly balance: number | null };
  readonly rates: readonly SourceRateSnapshot[];
};

export async function runSub2WorkerCycle(input: Sub2WorkerCycleInput): Promise<Sub2WorkerSummary> {
  const now = input.now ?? new Date();
  const collectSource = input.collectSource ?? collectSub2SourceOverview;
  const updateGroup = input.updateGroup ?? updateSub2TargetGroup;
  const config = await input.storage.getAppConfig();
  const summary = emptySummary();

  for (const source of config.sources.filter((item) => item.siteType === "sub2api")) {
    await collectDueSource({ storage: input.storage, source, proxyUrl: sourceProxyUrl(config, source), collectSource, now, summary });
  }

  const refreshed = await input.storage.getAppConfig();
  const enabledRules = refreshed.groupRules.filter((item) => item.enabled);
  if (!refreshed.target) return missingTargetSummary(summary, enabledRules);
  for (const rule of enabledRules) {
    await applyGroupRule({ storage: input.storage, target: refreshed.target, sources: refreshed.sources, rule, updateGroup, summary });
  }
  return summary;
}

function missingTargetSummary(
  summary: MutableSummary,
  rules: Awaited<ReturnType<AppStorage["getAppConfig"]>>["groupRules"],
) {
  for (const rule of rules) {
    summary.failedGroups += 1;
    summary.errors.push(`目标分组 ${rule.targetGroupName}: 目标站点未配置，无法自动更新目标倍率`);
  }
  return summary;
}

async function collectDueSource(input: {
  readonly storage: AppStorage;
  readonly source: SourceSiteConfig;
  readonly proxyUrl: string | null;
  readonly collectSource: NonNullable<Sub2WorkerCycleInput["collectSource"]>;
  readonly now: Date;
  readonly summary: MutableSummary;
}) {
  if (!sourceIsDue(input.source, input.now)) {
    input.summary.skippedSources += 1;
    return;
  }
  try {
    const overview = await input.collectSource(input.source, input.proxyUrl);
    await input.storage.saveSourceOverview({ site: sourceInput(input.source), ...overview });
    input.summary.collectedSources += 1;
  } catch (error) {
    input.summary.failedSources += 1;
    input.summary.errors.push(`采集站 ${input.source.name}: ${errorMessage(error)}`);
  }
}

async function applyGroupRule(input: {
  readonly storage: AppStorage;
  readonly target: TargetSettings;
  readonly sources: readonly SourceSiteConfig[];
  readonly rule: Awaited<ReturnType<AppStorage["getAppConfig"]>>["groupRules"][number];
  readonly updateGroup: NonNullable<Sub2WorkerCycleInput["updateGroup"]>;
  readonly summary: MutableSummary;
}) {
  try {
    const decision = resolveRateUpdate({
      target: {
        id: input.rule.targetGroupId,
        name: input.rule.targetGroupName,
        currentRate: input.rule.currentRate,
      },
      rule: input.rule,
      sourceRates: selectedSourceRates(input.sources, input.rule.sourceGroupIds),
    });
    if (decision.action === "skip") {
      input.summary.skippedGroups += 1;
      return;
    }
    const group = await input.updateGroup(input.target, decision.targetId, decision.nextRate);
    await input.storage.saveTargetGroup(targetGroupSnapshot(group));
    await input.storage.saveGroupRule({ ...input.rule, currentRate: group.rate_multiplier ?? decision.nextRate });
    input.summary.updatedGroups += 1;
  } catch (error) {
    input.summary.failedGroups += 1;
    input.summary.errors.push(`目标分组 ${input.rule.targetGroupName}: ${errorMessage(error)}`);
  }
}

async function collectSub2SourceOverview(source: SourceSiteConfig, proxyUrl: string | null): Promise<SourceOverview> {
  const request = sourceRequest(source, proxyUrl);
  const [account, rates] = await Promise.all([
    getSub2ApiSourceAccount(request),
    collectSub2ApiSourceRates(request),
  ]);
  return { account, rates };
}

function sourceRequest(source: SourceSiteConfig, proxyUrl: string | null): SourceRateRequest {
  return {
    sourceSiteId: source.id,
    baseUrl: source.baseUrl,
    auth: source.authMode === "password"
      ? { mode: "password", username: source.username, password: source.password }
      : { mode: "manual_token", accessToken: source.accessToken, rtToken: source.rtToken },
    rechargeRatio: source.rechargeRatio,
    proxyUrl,
  };
}

function selectedSourceRates(sources: readonly SourceSiteConfig[], ids: readonly string[]) {
  const byId = new Map<string, SourceRateSnapshot>();
  for (const source of sources) {
    for (const rate of source.rates) {
      byId.set(sourceRateKey(rate), rate);
      byId.set(rate.groupId, rate);
    }
  }
  const values = ids.map((id) => byId.get(id)?.effectiveRate ?? null);
  const missing = ids.filter((id, index) => values[index] === null);
  if (missing.length > 0) throw new Error(`采集源分组不存在: ${missing.join(", ")}`);
  return values;
}

function sourceProxyUrl(config: Awaited<ReturnType<AppStorage["getAppConfig"]>>, source: SourceSiteConfig) {
  if (!source.useProxy || !config.proxy.enabled) return null;
  return config.proxy.httpsProxy || config.proxy.httpProxy || null;
}

function sourceIsDue(source: SourceSiteConfig, now: Date) {
  if (source.intervalSeconds <= 0) return true;
  const updatedAt = new Date(source.updatedAt).getTime();
  if (!Number.isFinite(updatedAt)) return true;
  return now.getTime() - updatedAt >= source.intervalSeconds * 1000;
}

function updateSub2TargetGroup(target: TargetSettings, groupId: number, nextRate: number) {
  return new Sub2ApiAdminTarget(target.baseUrl, target.adminApiKey).updateGroupRateMultiplier(groupId, nextRate);
}

function targetGroupSnapshot(group: Sub2ApiGroup): TargetGroupSnapshot {
  return {
    id: group.id,
    name: group.name,
    status: group.status ?? "active",
    rate_multiplier: group.rate_multiplier ?? null,
  };
}

function sourceInput(source: SourceSiteConfig) {
  const { account, rates, updatedAt, ...site } = source;
  void account;
  void rates;
  void updatedAt;
  return site;
}

function emptySummary(): MutableSummary {
  return {
    collectedSources: 0,
    skippedSources: 0,
    failedSources: 0,
    updatedGroups: 0,
    skippedGroups: 0,
    failedGroups: 0,
    errors: [],
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
