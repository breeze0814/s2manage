import { getNewApiSourceAccount, getSub2ApiSourceAccount } from "../../adapters/source-account-client.ts";
import { collectNewApiSourceRates, collectSub2ApiSourceRates, resolveNewApiAuthSession, resolveSub2ApiAuthSession, type SourceAuthSession, type SourceRateRequest } from "../../adapters/source-rate-client.ts";
import type { CollectionCollector, CollectionSiteRuntime } from "./types.ts";

export function createDefaultCollectionCollector(): CollectionCollector {
  return { collect: (input) => collectSite(input) };
}

async function collectSite(input: Parameters<CollectionCollector["collect"]>[0]) {
  const request = sourceRequest(input);
  const credentials = await resolveCredentials(input.site, request);
  const authenticated = { ...request, auth: { mode: "manual_token" as const, accessToken: credentials.accessToken } };
  const [account, rates] = await Promise.allSettled([
    collectAccount(input.site.siteType, authenticated),
    collectRates(input.site.siteType, authenticated),
  ]);
  const errors = collectionErrors(account, rates);
  if (account.status === "rejected" && rates.status === "rejected") {
    throw new AggregateError([account.reason, rates.reason], `采集站数据接口全部失败：${errors.join("；")}`);
  }
  return {
    account: account.status === "fulfilled" ? account.value : null,
    rates: rates.status === "fulfilled" ? rates.value : null,
    errors,
    credentials,
  };
}

function collectAccount(siteType: CollectionSiteRuntime["siteType"], request: SourceRateRequest) {
  return siteType === "newapi" ? getNewApiSourceAccount(request) : getSub2ApiSourceAccount(request);
}

function collectRates(siteType: CollectionSiteRuntime["siteType"], request: SourceRateRequest) {
  return siteType === "newapi" ? collectNewApiSourceRates(request) : collectSub2ApiSourceRates(request);
}

function collectionErrors(
  account: PromiseSettledResult<unknown>,
  rates: PromiseSettledResult<unknown>,
) {
  const errors: string[] = [];
  if (account.status === "rejected") errors.push(`账户信息接口：${errorMessage(account.reason)}`);
  if (rates.status === "rejected") errors.push(`倍率接口：${errorMessage(rates.reason)}`);
  return errors;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function resolveCredentials(site: CollectionSiteRuntime, request: SourceRateRequest): Promise<SourceAuthSession> {
  return site.siteType === "newapi" ? resolveNewApiAuthSession(request) : resolveSub2ApiAuthSession(request);
}

function sourceRequest(input: Parameters<CollectionCollector["collect"]>[0]): SourceRateRequest {
  return {
    sourceSiteId: input.site.id,
    baseUrl: input.site.baseUrl,
    newApiUserId: input.site.newApiUserId,
    auth: input.site.authMode === "password"
      ? { mode: "password", username: input.site.username, password: input.site.password }
      : { mode: "manual_token", accessToken: input.site.accessToken, rtToken: input.site.refreshToken },
    rechargeRatio: input.site.rechargeRatio,
    targetRechargeRatio: input.targetRechargeRatio,
    timeoutMs: input.timeoutMs,
    proxyUrl: input.site.useProxy ? input.proxyUrl : null,
  };
}
