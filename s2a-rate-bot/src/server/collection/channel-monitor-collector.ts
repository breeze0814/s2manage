import { createJsonHttpClient } from "../../adapters/http-client.ts";
import { resolveSub2ApiAuthSession, type SourceRateRequest } from "../../adapters/source-rate-client.ts";
import type { SettingsService } from "../settings/service.ts";
import { createSub2ApiClient, sub2ApiSessionFromToken } from "../upstream-platform/index.ts";
import type { CollectionChannelMonitorCollector, CollectionSiteRuntime } from "./types.ts";

export function createDefaultChannelMonitorCollector(input: {
  readonly settings: Pick<SettingsService, "get">;
}): CollectionChannelMonitorCollector {
  return {
    collect: async (site) => {
      if (site.siteType !== "sub2api") throw new Error("渠道监控仅支持 Sub2API 采集站");
      const settings = await input.settings.get();
      const request = monitorRequest(site, settings);
      const credentials = await resolveSub2ApiAuthSession(request);
      const http = createJsonHttpClient({
        timeoutMs: request.timeoutMs ?? 25_000,
        proxyUrl: request.proxyUrl ?? null,
      });
      const session = sub2ApiSessionFromToken(site.baseUrl, credentials);
      return createSub2ApiClient({ baseUrl: site.baseUrl, session, http }).fetchChannelMonitors();
    },
  };
}

function monitorRequest(
  site: CollectionSiteRuntime,
  settings: Awaited<ReturnType<SettingsService["get"]>>,
): SourceRateRequest {
  return {
    sourceSiteId: site.id,
    baseUrl: site.baseUrl,
    auth: site.authMode === "password"
      ? { mode: "password", username: site.username, password: site.password }
      : { mode: "manual_token", accessToken: site.accessToken, rtToken: site.refreshToken },
    rechargeRatio: site.rechargeRatio,
    targetRechargeRatio: 1,
    timeoutMs: settings.worker.timeoutSeconds * 1_000,
    proxyUrl: site.useProxy && settings.proxy.enabled ? settings.proxy.proxyUrl : null,
  };
}
