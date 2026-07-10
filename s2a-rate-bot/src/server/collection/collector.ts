import { getNewApiSourceAccount, getSub2ApiSourceAccount } from "../../adapters/source-account-client.ts";
import { collectNewApiSourceRates, collectSub2ApiSourceRates, type SourceRateRequest } from "../../adapters/source-rate-client.ts";
import type { CollectionCollector, CollectionSiteRuntime } from "./types.ts";

export function createDefaultCollectionCollector(): CollectionCollector {
  return { collect: (input) => collectSite(input.site, input.timeoutMs, input.proxyUrl) };
}

async function collectSite(site: CollectionSiteRuntime, timeoutMs: number, proxyUrl: string | null) {
  const request = sourceRequest(site, timeoutMs, proxyUrl);
  if (site.siteType === "newapi") {
    const [account, rates] = await Promise.all([
      getNewApiSourceAccount(request),
      collectNewApiSourceRates(request),
    ]);
    return { account, rates };
  }
  const [account, rates] = await Promise.all([
    getSub2ApiSourceAccount(request),
    collectSub2ApiSourceRates(request),
  ]);
  return { account, rates };
}

function sourceRequest(site: CollectionSiteRuntime, timeoutMs: number, proxyUrl: string | null): SourceRateRequest {
  return {
    sourceSiteId: site.id,
    baseUrl: site.baseUrl,
    auth: site.authMode === "password"
      ? { mode: "password", username: site.username, password: site.password }
      : { mode: "manual_token", accessToken: site.accessToken, rtToken: site.refreshToken },
    rechargeRatio: site.rechargeRatio,
    timeoutMs,
    proxyUrl: site.useProxy ? proxyUrl : null,
  };
}
