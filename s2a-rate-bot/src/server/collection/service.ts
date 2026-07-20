import { z } from "zod";
import type { SecretCipher } from "../crypto.ts";
import { CollectionRefreshSupersededError, type CollectionChangesQuery, type CollectionStore } from "./store.ts";
import type { CollectionCollector, CollectionRequestOptions, CollectionSiteInput, CollectionSiteRuntime, CollectionSiteStored, CollectionSiteView } from "./types.ts";

export const collectionSiteSchema = z.object({
  name: z.string().trim().min(1, "采集站名称不能为空"),
  siteType: z.enum(["sub2api", "newapi"]),
  baseUrl: z.string().trim().url("采集站地址无效").transform((value) => value.replace(/\/+$/, "")),
  authMode: z.enum(["password", "manual_token"]),
  username: z.string().trim().default(""),
  newApiUserId: z.string().trim().default(""),
  password: z.string().default(""),
  accessToken: z.string().trim().default(""),
  refreshToken: z.string().trim().default(""),
  rechargeRatio: z.number().finite().positive("充值倍率必须大于 0"),
  intervalSeconds: z.number().int().positive("采集间隔必须是正整数"),
  useProxy: z.boolean(),
  enabled: z.boolean(),
}).superRefine(validateAuthentication);

export type CollectionService = {
  readonly create: (input: unknown) => Promise<CollectionSiteView>;
  readonly update: (id: number, input: unknown) => Promise<CollectionSiteView>;
  readonly delete: (id: number) => Promise<void>;
  readonly list: () => Promise<CollectionSiteView[]>;
  readonly rates: (siteId?: number) => Promise<ReturnType<CollectionStore["rates"]>>;
  readonly setRatePlatform: (siteId: number, groupId: string, platform: unknown) => Promise<ReturnType<CollectionStore["setRatePlatform"]>>;
  readonly changes: (query?: CollectionChangesQuery) => Promise<ReturnType<CollectionStore["changes"]>>;
  readonly refresh: (id: number) => Promise<CollectionSiteView>;
  readonly refreshAll: () => Promise<Array<{ id: number; ok: boolean; error?: string }>>;
};

export function createCollectionService(input: {
  readonly store: CollectionStore;
  readonly cipher: SecretCipher;
  readonly collector: CollectionCollector;
  readonly requestOptions: () => Promise<CollectionRequestOptions>;
}): CollectionService {
  return {
    create: (raw) => createSite(input, raw),
    update: (id, raw) => updateSite(input, id, raw),
    delete: async (id) => input.store.delete(id),
    list: async () => input.store.list().map((site) => siteView(site, input.cipher)),
    rates: async (siteId) => input.store.rates(siteId),
    setRatePlatform: async (siteId, groupId, platform) => input.store.setRatePlatform(siteId, groupId, ratePlatformSchema.parse(platform)),
    changes: async (query) => input.store.changes(query),
    refresh: (id) => refreshSite(input, id),
    refreshAll: () => refreshAllSites(input),
  };
}

const ratePlatformSchema = z.enum(["openai", "anthropic", "gemini", "new-api"]).nullable();

async function createSite(input: CollectionDependencies, raw: unknown) {
  const site = collectionSiteSchema.parse(raw);
  return siteView(input.store.create(encryptedSite(site, input.cipher)), input.cipher);
}

async function updateSite(input: CollectionDependencies, id: number, raw: unknown) {
  const current = requiredSite(input.store, id);
  const parsed = collectionSiteSchema.parse(mergeStoredSecrets(raw, current, input.cipher));
  const site = encryptedSite(parsed, input.cipher, current);
  return siteView(input.store.update(id, site), input.cipher);
}

async function refreshSite(input: CollectionDependencies, id: number) {
  const stored = requiredSite(input.store, id);
  if (!stored.enabled) throw new Error("采集站已停用");
  const site = runtimeSite(stored, input.cipher);
  const refreshVersion = input.store.beginRefresh(id);
  const options = await input.requestOptions();
  const startedAt = new Date().toISOString();
  try {
    const overview = await input.collector.collect({ site, ...options });
    input.store.recordSuccess({
      siteId: id,
      refreshVersion,
      overview,
      startedAt,
      credentials: encryptedCredentials(overview, input.cipher),
    });
    return siteView(requiredSite(input.store, id), input.cipher);
  } catch (error) {
    if (error instanceof CollectionRefreshSupersededError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    recordRefreshFailure(input.store, { siteId: id, refreshVersion, message, startedAt, originalError: error });
    throw error;
  }
}

function recordRefreshFailure(
  store: CollectionStore,
  input: Readonly<{
    siteId: number;
    refreshVersion: number;
    message: string;
    startedAt: string;
    originalError: unknown;
  }>,
) {
  try {
    store.recordFailure({
      siteId: input.siteId,
      refreshVersion: input.refreshVersion,
      error: input.message,
      startedAt: input.startedAt,
    });
  } catch (error) {
    if (error instanceof CollectionRefreshSupersededError) throw error;
    throw new AggregateError([input.originalError, error], "采集失败且无法记录失败状态");
  }
}

function encryptedCredentials(overview: Awaited<ReturnType<CollectionCollector["collect"]>>, cipher: SecretCipher) {
  if (!overview.credentials) return undefined;
  return {
    accessTokenEnc: cipher.encrypt(overview.credentials.accessToken),
    refreshTokenEnc: overview.credentials.refreshToken ? cipher.encrypt(overview.credentials.refreshToken) : undefined,
  };
}

async function refreshAllSites(input: CollectionDependencies) {
  const sites = input.store.list().filter((site) => site.enabled);
  return Promise.all(sites.map(async (site) => {
    try {
      await refreshSite(input, site.id);
      return { id: site.id, ok: true };
    } catch (error) {
      return { id: site.id, ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }));
}

function encryptedSite(site: CollectionSiteInput, cipher: SecretCipher, current?: CollectionSiteStored) {
  return {
    name: site.name, siteType: site.siteType, baseUrl: site.baseUrl, authMode: site.authMode,
    username: site.username, newApiUserId: site.siteType === "newapi" ? site.newApiUserId : "",
    passwordEnc: encryptedValue(site.password, current?.passwordEnc, cipher),
    accessTokenEnc: encryptedValue(site.accessToken, current?.accessTokenEnc, cipher),
    refreshTokenEnc: encryptedValue(site.refreshToken, current?.refreshTokenEnc, cipher),
    rechargeRatio: site.rechargeRatio, intervalSeconds: site.intervalSeconds,
    useProxy: site.useProxy, enabled: site.enabled,
  };
}

function encryptedValue(value: string, current: string | undefined, cipher: SecretCipher) {
  return value ? cipher.encrypt(value) : current ?? cipher.encrypt("");
}

function mergeStoredSecrets(raw: unknown, current: CollectionSiteStored, cipher: SecretCipher) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const values = raw as Record<string, unknown>;
  const stored = runtimeSite(current, cipher);
  return {
    ...values,
    password: stringValue(values.password) || stored.password,
    accessToken: stringValue(values.accessToken) || stored.accessToken,
    refreshToken: stringValue(values.refreshToken) || stored.refreshToken,
  };
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function runtimeSite(site: CollectionSiteStored, cipher: SecretCipher): CollectionSiteRuntime {
  const { passwordEnc, accessTokenEnc, refreshTokenEnc, ...publicSite } = site;
  return { ...publicSite, password: cipher.decrypt(passwordEnc), accessToken: cipher.decrypt(accessTokenEnc), refreshToken: cipher.decrypt(refreshTokenEnc) };
}

function siteView(site: CollectionSiteStored, cipher: SecretCipher): CollectionSiteView {
  const runtime = runtimeSite(site, cipher);
  const { password, accessToken, refreshToken, ...view } = runtime;
  return { ...view, hasPassword: Boolean(password), hasAccessToken: Boolean(accessToken), hasRefreshToken: Boolean(refreshToken) };
}

function requiredSite(store: CollectionStore, id: number) {
  const site = store.get(id);
  if (!site) throw new Error(`采集站不存在: ${id}`);
  return site;
}

function validateAuthentication(site: CollectionSiteInput, context: z.RefinementCtx) {
  if (site.authMode === "password") return validatePasswordAuthentication(site, context);
  if (site.siteType === "newapi") return validateNewApiToken(site, context);
  validateSub2ApiToken(site, context);
}

function validatePasswordAuthentication(site: CollectionSiteInput, context: z.RefinementCtx) {
  if (!site.username || !site.password) context.addIssue({ code: "custom", message: "账号密码认证需要用户名和密码" });
}

function validateNewApiToken(site: CollectionSiteInput, context: z.RefinementCtx) {
  if (!site.accessToken) context.addIssue({ code: "custom", message: "New API Token 认证需要 Access Token" });
}

function validateSub2ApiToken(site: CollectionSiteInput, context: z.RefinementCtx) {
  if (!site.accessToken && !site.refreshToken) context.addIssue({ code: "custom", message: "Token 认证需要 Access Token 或 Refresh Token" });
}

type CollectionDependencies = Parameters<typeof createCollectionService>[0];
