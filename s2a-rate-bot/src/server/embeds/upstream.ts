import { createJsonHttpClient } from "../../adapters/http-client.ts";
import type { SettingsSnapshot } from "../settings/service.ts";
import {
  createSub2ApiClient,
  normalizeUpstreamUrl,
  sub2ApiSessionFromAdminKey,
  sub2ApiSessionFromToken,
} from "../upstream-platform/index.ts";
import type { CurrentUser, Sub2ApiUserBreakdownQuery } from "../upstream-platform/types.ts";

export type EmbedUpstreamGateway = {
  readonly sourceOrigin: () => Promise<string>;
  readonly currentUser: (sourceOrigin: string, token: string) => Promise<CurrentUser>;
  readonly userBreakdown: (query: Sub2ApiUserBreakdownQuery) => Promise<unknown>;
};

export function createEmbedUpstreamGateway(
  settings: { readonly get: () => Promise<SettingsSnapshot> },
): EmbedUpstreamGateway {
  return {
    sourceOrigin: async () => sourceOrigin(await requireSettings(settings)),
    currentUser: async (origin, token) => {
      const snapshot = await requireSettings(settings);
      assertCurrentOrigin(snapshot, origin);
      return createViewerClient(snapshot, origin, token).fetchCurrentUser();
    },
    userBreakdown: async (query) => {
      const snapshot = await requireSettings(settings);
      return createAdminClient(snapshot).fetchAdminUserBreakdown(query);
    },
  };
}

async function requireSettings(settings: { readonly get: () => Promise<SettingsSnapshot> }) {
  const snapshot = await settings.get();
  if (!snapshot.target) throw new Error("请先配置目标站");
  return snapshot as SettingsSnapshot & { readonly target: NonNullable<SettingsSnapshot["target"]> };
}

function createViewerClient(settings: ConfiguredSettings, origin: string, token: string) {
  return createSub2ApiClient({
    baseUrl: origin,
    http: httpClient(settings),
    session: sub2ApiSessionFromToken(origin, { accessToken: token }),
  });
}

function createAdminClient(settings: ConfiguredSettings) {
  return createSub2ApiClient({
    baseUrl: settings.target.baseUrl,
    http: httpClient(settings),
    session: sub2ApiSessionFromAdminKey(settings.target.baseUrl, settings.target.adminApiKey),
  });
}

function httpClient(settings: ConfiguredSettings) {
  return createJsonHttpClient({
    timeoutMs: settings.worker.timeoutSeconds * 1_000,
    proxyUrl: settings.proxy.enabled ? settings.proxy.proxyUrl : null,
  });
}

function assertCurrentOrigin(settings: ConfiguredSettings, value: string) {
  if (sourceOrigin(settings) !== normalizedOrigin(value)) throw new Error("嵌入来源与当前目标站不一致");
}

function sourceOrigin(settings: ConfiguredSettings) { return normalizedOrigin(settings.target.baseUrl); }
export function normalizedOrigin(value: string) { return new URL(normalizeUpstreamUrl(value)).origin; }

type ConfiguredSettings = SettingsSnapshot & { readonly target: NonNullable<SettingsSnapshot["target"]> };
