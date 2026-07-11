import { getNewApiSourceAccount, getSub2ApiSourceAccount } from "../../adapters/source-account-client.ts";
import { collectNewApiSourceRates, collectSub2ApiSourceRates, resolveNewApiAuthSession, resolveSub2ApiAuthSession, type SourceAuthSession, type SourceRateRequest } from "../../adapters/source-rate-client.ts";
import type { CollectionCollector, CollectionSiteRuntime } from "./types.ts";

export function createDefaultCollectionCollector(): CollectionCollector {
  return { collect: (input) => collectSite(input.site, input.timeoutMs, input.proxyUrl, input.targetRechargeRatio) };
}

async function collectSite(site: CollectionSiteRuntime, timeoutMs: number, proxyUrl: string | null, targetRechargeRatio: number) {
  const request = sourceRequest(site, timeoutMs, proxyUrl, targetRechargeRatio);
  const credentials = await resolveCredentials(site, request);
  const authenticated = { ...request, auth: { mode: "manual_token" as const, accessToken: credentials.accessToken } };
  if (site.siteType === "newapi") {
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

function sourceRequest(site: CollectionSiteRuntime, timeoutMs: number, proxyUrl: string | null, targetRechargeRatio: number): SourceRateRequest {
  return {
    sourceSiteId: site.id,
    baseUrl: site.baseUrl,
    auth: site.authMode === "password"
      ? { mode: "password", username: site.username, password: site.password }
      : { mode: "manual_token", accessToken: site.accessToken, rtToken: site.refreshToken },
    rechargeRatio: site.rechargeRatio,
    targetRechargeRatio,
    timeoutMs,
    proxyUrl: site.useProxy ? proxyUrl : null,
  };
}
