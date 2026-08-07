import { z } from "zod";
import type { SecretCipher } from "../crypto.ts";
import { CollectionRefreshSupersededError, type CollectionStore } from "./store.ts";
import type { CollectionChangesQuery, CollectionRunsQuery } from "./history.ts";
import type { CollectionCollector, CollectionRequestOptions, CollectionSiteInput, CollectionSiteRuntime, CollectionSiteStored, CollectionSiteView } from "./types.ts";

export const collectionSiteSchema = z.object({
  name: z.string().trim().min(1, "采集站名称不能为空"),
  remark: z.string().trim().max(200, "备注不能超过 200 个字符").default(""),
  siteType: z.enum(["sub2api", "newapi"]),
  baseUrl: z.string().trim().url("采集站地址无效").transform((value) => value.replace(/\/+$/, "")),
  websiteUrl: z.string().trim().default("").refine(isOptionalHttpUrl, "采集站官网必须是 HTTP 或 HTTPS 地址"),
  authMode: z.enum(["password", "manual_token"]),
  username: z.string().trim().default(""),
  newApiUserId: z.string().trim().default(""),
  password: z.string().default(""),
  accessToken: z.string().trim().default(""),
  refreshToken: z.string().trim().default(""),
  rechargeRatio: z.number().finite().positive("充值倍率必须大于 0"),
  balanceAlertThreshold: z.number().finite().nonnegative("余额告警阈值不能小于 0").nullable().default(null),
  intervalSeconds: z.number().int().positive("采集间隔必须是正整数"),
  useProxy: z.boolean(),
  enabled: z.boolean(),
}).superRefine(validateAuthentication);

export type CollectionService = {
  readonly create: (input: unknown) => Promise<CollectionSiteView>;
  readonly update: (id: number, input: unknown) => Promise<CollectionSiteView>;
  readonly delete: (id: number) => Promise<void>;
  readonly list: () => Promise<CollectionSiteView[]>;
  readonly rates: (siteId?: number) => Promise<Awaited<ReturnType<CollectionStore["rates"]>>>;
  readonly catalog: (siteId?: number) => Promise<Awaited<ReturnType<CollectionStore["catalog"]>>>;
  readonly setRatePlatform: (siteId: number, groupId: string, platform: unknown) => Promise<Awaited<ReturnType<CollectionStore["setRatePlatform"]>>>;
  readonly setRateGroupType: (siteId: number, groupId: string, groupType: unknown) => Promise<Awaited<ReturnType<CollectionStore["setRateGroupType"]>>>;
  readonly runtimeSite: (id: number) => Promise<CollectionSiteRuntime>;
  readonly changes: (query?: CollectionChangesQuery) => Promise<Awaited<ReturnType<CollectionStore["changes"]>>>;
  readonly runs: (query?: CollectionRunsQuery) => Promise<Awaited<ReturnType<CollectionStore["runs"]>>>;
  readonly refresh: (id: number) => Promise<CollectionSiteView>;
  readonly refreshAll: () => Promise<Array<{ id: number; ok: boolean; error?: string }>>;
  readonly refreshAllWithProgress: (onProgress: (event: CollectionRefreshProgressEvent) => void) => Promise<Array<{ id: number; ok: boolean; error?: string }>>;
};

export type CollectionRefreshProgressEvent =
  | { readonly type: "started"; readonly id: number; readonly name: string; readonly total: number }
  | { readonly type: "finished"; readonly id: number; readonly name: string; readonly completed: number; readonly total: number; readonly ok: boolean; readonly error?: string }
  | { readonly type: "complete"; readonly completed: number; readonly total: number };

export function createCollectionService(input: {
  readonly store: CollectionStore;
  readonly cipher: SecretCipher;
  readonly collector: CollectionCollector;
  readonly requestOptions: () => Promise<CollectionRequestOptions>;
  readonly afterRefreshSuccess?: (siteId: number) => Promise<void>;
}): CollectionService {
  return {
    create: (raw) => createSite(input, raw),
    update: (id, raw) => updateSite(input, id, raw),
    delete: async (id) => input.store.delete(id),
    list: async () => (await input.store.list()).map((site) => siteView(site, input.cipher)),
    rates: async (siteId) => input.store.rates(siteId),
    catalog: async (siteId) => input.store.catalog(siteId),
    setRatePlatform: async (siteId, groupId, platform) => input.store.setRatePlatform(siteId, groupId, ratePlatformSchema.parse(platform)),
    setRateGroupType: async (siteId, groupId, groupType) => input.store.setRateGroupType(siteId, groupId, rateGroupTypeSchema.parse(groupType)),
    runtimeSite: async (id) => runtimeSite(await requiredSite(input.store, id), input.cipher),
    changes: async (query) => input.store.changes(query),
    runs: async (query) => input.store.runs(query),
    refresh: (id) => refreshSite(input, id),
    refreshAll: () => refreshAllSites(input),
    refreshAllWithProgress: (onProgress) => refreshAllSites(input, onProgress),
  };
}

const ratePlatformSchema = z.enum(["openai", "anthropic", "gemini", "new-api"]).nullable();
const rateGroupTypeSchema = z.enum(["openai", "anthropic", "gemini", "antigravity"]).nullable();

async function createSite(input: CollectionDependencies, raw: unknown) {
  const site = collectionSiteSchema.parse(raw);
  return siteView(await input.store.create(encryptedSite(site, input.cipher)), input.cipher);
}

async function updateSite(input: CollectionDependencies, id: number, raw: unknown) {
  const current = await requiredSite(input.store, id);
  const parsed = collectionSiteSchema.parse(mergeStoredSecrets(raw, current, input.cipher));
  const site = encryptedSite(parsed, input.cipher, current);
  return siteView(await input.store.update(id, site), input.cipher);
}

async function refreshSite(input: CollectionDependencies, id: number) {
  const stored = await requiredSite(input.store, id);
  if (!stored.enabled) throw new Error("采集站已停用");
  const site = runtimeSite(stored, input.cipher);
  const refreshVersion = await input.store.beginRefresh(id);
  const options = await input.requestOptions();
  const startedAt = new Date().toISOString();
  try {
    const overview = await input.collector.collect({ site, ...options });
    await input.store.recordSuccess({
      siteId: id,
      refreshVersion,
      overview,
      startedAt,
      credentials: encryptedCredentials(overview, input.cipher),
    });
  } catch (error) {
    if (error instanceof CollectionRefreshSupersededError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    await recordRefreshFailure(input.store, { siteId: id, refreshVersion, message, startedAt, originalError: error });
    throw error;
  }
  await input.afterRefreshSuccess?.(id);
  return siteView(await requiredSite(input.store, id), input.cipher);
}

async function recordRefreshFailure(
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
    await store.recordFailure({
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

async function refreshAllSites(input: CollectionDependencies, onProgress?: (event: CollectionRefreshProgressEvent) => void) {
  const sites = (await input.store.list()).filter((site) => site.enabled);
  let completed = 0;
  const results = await Promise.all(sites.map(async (site) => {
    onProgress?.({ type: "started", id: site.id, name: site.name, total: sites.length });
    try {
      const refreshed = await refreshSite(input, site.id);
      const error = refreshed.lastStatus === "partial" ? refreshed.lastError ?? "部分接口采集失败" : undefined;
      const result = { id: site.id, ok: true, ...(error ? { error } : {}) } as const;
      completed += 1;
      onProgress?.({ type: "finished", id: site.id, name: site.name, completed,
        total: sites.length, ok: true, ...(error ? { error } : {}) });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      completed += 1;
      onProgress?.({ type: "finished", id: site.id, name: site.name, completed, total: sites.length, ok: false, error: message });
      return { id: site.id, ok: false, error: message };
    }
  }));
  onProgress?.({ type: "complete", completed, total: sites.length });
  return results;
}

function encryptedSite(site: CollectionSiteInput, cipher: SecretCipher, current?: CollectionSiteStored) {
  return {
    name: site.name, remark: site.remark ?? "", siteType: site.siteType, baseUrl: site.baseUrl, websiteUrl: site.websiteUrl, authMode: site.authMode,
    username: site.username, newApiUserId: site.siteType === "newapi" ? site.newApiUserId : "",
    passwordEnc: encryptedValue(site.password, current?.passwordEnc, cipher),
    accessTokenEnc: encryptedValue(site.accessToken, current?.accessTokenEnc, cipher),
    refreshTokenEnc: encryptedValue(site.refreshToken, current?.refreshTokenEnc, cipher),
    rechargeRatio: site.rechargeRatio, balanceAlertThreshold: site.balanceAlertThreshold ?? null, intervalSeconds: site.intervalSeconds,
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

function isOptionalHttpUrl(value: string) {
  if (!value) return true;
  if (!URL.canParse(value)) return false;
  const protocol = new URL(value).protocol;
  return protocol === "http:" || protocol === "https:";
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

async function requiredSite(store: CollectionStore, id: number) {
  const site = await store.get(id);
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
