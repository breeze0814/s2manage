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
  if (input.site.siteType === "newapi") {
    const [account, rates] = await Promise.all([
      getNewApiSourceAccount(authenticated),
      collectNewApiSourceRates(authenticated),
    ]);
    return { account, rates, credentials };
  }
  const [account, rates] = await Promise.all([
    getSub2ApiSourceAccount(authenticated),
    collectSub2ApiSourceRates(authenticated),
  ]);
  return { account, rates, credentials };
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
