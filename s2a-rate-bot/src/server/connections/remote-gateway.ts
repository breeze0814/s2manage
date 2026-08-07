import { createJsonHttpClient, HttpResponseError } from "../../adapters/http-client.ts";
import {
  resolveNewApiAuthSession, resolveSub2ApiAuthSession, type SourceRateRequest,
} from "../../adapters/source-rate-client.ts";
import type { CollectionService } from "../collection/service.ts";
import type { CollectionSiteRuntime } from "../collection/types.ts";
import type { SettingsService, SettingsSnapshot } from "../settings/service.ts";
import {
  createNewApiClient, createSub2ApiClient, normalizeUpstreamUrl,
  sub2ApiSessionFromAdminKey, sub2ApiSessionFromToken,
} from "../upstream-platform/index.ts";
import type { AdminTarget, NewApiSession, UpstreamKey } from "../upstream-platform/types.ts";
import { buildTargetAccountPayload } from "./account-payload.ts";
import type {
  ConnectionRemoteGateway, ExistingSourceCredential, ExistingTargetAccount,
  ProvisionedCredential,
} from "./types.ts";

const AUTH_RATIO = 1;
const UNUSED_QUOTA_PER_UNIT = 1;

export function createRuntimeConnectionRemoteGateway(input: Readonly<{
  collection: Pick<CollectionService, "runtimeSite">;
  settings: Pick<SettingsService, "get">;
}>): ConnectionRemoteGateway {
  return {
    ensureSourceCredential: (request) => ensureSourceCredential(input, request),
    listSourceCredentials: async (siteId) => sourceOptions(await sourceResourceClient(input, siteId)),
    deleteSourceCredential: async (siteId, credentialId) => {
      const client = await sourceResourceClient(input, siteId);
      await deleteIfPresent(() => client.delete(credentialId));
    },
    ensureTargetAccount: (request) => ensureTargetAccount(input.settings, request),
    listTargetAccounts: async (groupIds) => targetOptions(await listTargetAccounts(await targetClient(input.settings), groupIds)),
    renameTargetAccount: async (accountId, name) => {
      const client = await targetClient(input.settings);
      await client.updateAdminAccount(String(accountId), { name });
    },
    deleteTargetAccount: async (accountId) => {
      const client = await targetClient(input.settings);
      await deleteIfPresent(() => client.deleteAdminAccount(String(accountId)));
    },
  };
}

async function ensureSourceCredential(
  input: RuntimeRemoteInput,
  request: Readonly<{ siteId: number; groupId: string; name: string }>,
) {
  const client = await sourceResourceClient(input, request.siteId);
  const matches = (await client.list())
    .filter((item) => item.name === request.name && item.groupId === request.groupId);
  if (matches.length > 1) throw new Error(`采集站存在多个同名凭据: ${request.name}`);
  if (matches[0]) {
    const key = matches[0].key || await client.readKey(matches[0].id);
    return requireCredential({ id: matches[0].id, key });
  }
  return client.create(request.name, request.groupId);
}

async function ensureTargetAccount(
  settings: Pick<SettingsService, "get">,
  request: Parameters<ConnectionRemoteGateway["ensureTargetAccount"]>[0],
) {
  const client = await targetClient(settings);
  const accounts = await listTargetAccounts(client, request.targetGroupIds);
  const matches = accounts.filter((account) => account.name === request.name);
  if (matches.length > 1) throw new Error(`目标站存在多个同名账号: ${request.name}`);
  if (matches[0]) {
    assertManagedTarget(matches[0], request);
    return { id: positiveId(matches[0].id, "目标转发账号"), name: matches[0].name };
  }
  const createdId = await client.createAdminAccount(buildTargetAccountPayload(request));
  const id = createdId || await findTargetAccountId(client, request.name, request.targetGroupIds[0]!);
  return { id: positiveId(id, "目标转发账号"), name: request.name };
}

async function sourceResourceClient(input: RuntimeRemoteInput, siteId: number): Promise<SourceResourceClient> {
  const [site, settings] = await Promise.all([input.collection.runtimeSite(siteId), input.settings.get()]);
  const http = createJsonHttpClient(httpOptions(settings, site.useProxy));
  const auth = await resolveSourceAuth(site, settings);
  if (site.siteType === "newapi") {
    const client = createNewApiClient({ baseUrl: site.baseUrl, session: newApiSession(site, auth.accessToken), http });
    return {
      create: (name, groupId) => client.createToken(name, groupId).then(requireCredential),
      list: () => client.listTokens(),
      readKey: (id) => client.fetchTokenKey(id),
      delete: (id) => client.deleteToken(id),
    };
  }
  const session = sub2ApiSessionFromToken(site.baseUrl, auth);
  const client = createSub2ApiClient({ baseUrl: site.baseUrl, session, http });
  return {
    create: (name, groupId) => createSub2Credential(client, name, numericGroupId(groupId)),
    list: () => client.listKeys(),
    readKey: async (id) => requiredListedKey(await client.listKeys(), id),
    delete: (id) => client.deleteKey(id),
  };
}

async function listTargetAccounts(
  client: Awaited<ReturnType<typeof targetClient>>,
  targetGroupIds: readonly number[],
) {
  const pages = await Promise.all(targetGroupIds.map((id) => client.listGroupAccounts(String(id))));
  const accounts = new Map<string, AdminTarget>();
  for (const account of pages.flat()) accounts.set(account.id, account);
  return [...accounts.values()];
}

function sourceOptions(client: SourceResourceClient): Promise<readonly ExistingSourceCredential[]> {
  return client.list().then((items) => items.map((item) => ({
    id: item.id, name: item.name, groupId: item.groupId, status: item.status,
  })));
}

function targetOptions(accounts: readonly AdminTarget[]): readonly ExistingTargetAccount[] {
  return accounts.map((account) => ({
    id: positiveId(account.id, "目标转发账号"),
    name: account.name,
    platform: account.platform,
    status: account.status,
    groupIds: account.groupIds.map((id) => positiveId(id, "目标分组")),
  }));
}

function requiredListedKey(keys: readonly UpstreamKey[], id: string) {
  const item = keys.find((key) => key.id === id);
  if (!item?.key) throw new Error(`无法读取采集站凭据 Key: ${id}`);
  return item.key;
}

function assertManagedTarget(
  target: AdminTarget,
  request: Parameters<ConnectionRemoteGateway["ensureTargetAccount"]>[0],
) {
  if (target.platform.trim().toLowerCase() !== request.groupType) {
    throw new Error(`同名目标账号平台不匹配: ${target.name}`);
  }
  const groupIds = new Set(target.groupIds.map((id) => positiveId(id, "目标分组")));
  if (request.targetGroupIds.some((id) => !groupIds.has(id))) {
    throw new Error(`同名目标账号未加入全部目标分组: ${target.name}`);
  }
}

async function deleteIfPresent(task: () => Promise<void>) {
  try {
    await task();
  } catch (error) {
    if (error instanceof HttpResponseError && error.status === 404) return;
    throw error;
  }
}

async function createSub2Credential(
  client: ReturnType<typeof createSub2ApiClient>,
  name: string,
  groupId: number,
) {
  const created = await client.createKey(name, groupId);
  if (created.id) return requireCredential(created);
  const match = (await client.listKeys()).find((key) => key.name === name);
  if (!match?.id) throw new Error(`无法回查新建采集站凭据: ${name}`);
  return requireCredential({ id: match.id, key: created.key });
}

async function resolveSourceAuth(site: CollectionSiteRuntime, settings: SettingsSnapshot) {
  const request = sourceAuthRequest(site, settings);
  return site.siteType === "newapi" ? resolveNewApiAuthSession(request) : resolveSub2ApiAuthSession(request);
}

function sourceAuthRequest(site: CollectionSiteRuntime, settings: SettingsSnapshot): SourceRateRequest {
  return {
    sourceSiteId: site.id, baseUrl: site.baseUrl, newApiUserId: site.newApiUserId,
    auth: site.authMode === "password"
      ? { mode: "password", username: site.username, password: site.password }
      : { mode: "manual_token", accessToken: site.accessToken, rtToken: site.refreshToken },
    rechargeRatio: AUTH_RATIO, targetRechargeRatio: AUTH_RATIO,
    timeoutMs: settings.worker.timeoutSeconds * 1_000,
    proxyUrl: site.useProxy && settings.proxy.enabled ? settings.proxy.proxyUrl : null,
  };
}

function newApiSession(site: CollectionSiteRuntime, encodedToken: string): NewApiSession {
  const separator = encodedToken.lastIndexOf("::");
  const token = separator >= 0 ? encodedToken.slice(0, separator) : encodedToken;
  const userId = separator >= 0 ? encodedToken.slice(separator + 2) : site.newApiUserId;
  if (!userId.trim()) throw new Error("New API 真实对接需要用户 ID");
  const base = { platform: "newapi" as const, baseUrl: normalizeUpstreamUrl(site.baseUrl), userId, tokenType: "Bearer", quotaPerUnit: UNUSED_QUOTA_PER_UNIT };
  return token.startsWith("session:") ? { ...base, cookie: token.slice("session:".length) } : { ...base, accessToken: token };
}

async function targetClient(settingsService: Pick<SettingsService, "get">) {
  const settings = await settingsService.get();
  if (!settings.target) throw new Error("请先配置目标站");
  const http = createJsonHttpClient(httpOptions(settings, true));
  const session = sub2ApiSessionFromAdminKey(settings.target.baseUrl, settings.target.adminApiKey);
  return createSub2ApiClient({ baseUrl: settings.target.baseUrl, session, http });
}

async function findTargetAccountId(
  client: Awaited<ReturnType<typeof targetClient>>,
  name: string,
  targetGroupId: number,
) {
  const accounts = await client.listGroupAccounts(String(targetGroupId));
  const account = accounts.find((item) => item.name === name);
  if (!account) throw new Error(`无法回查新建目标转发账号: ${name}`);
  return account.id;
}

function httpOptions(settings: SettingsSnapshot, useProxy: boolean) {
  return {
    timeoutMs: settings.worker.timeoutSeconds * 1_000,
    proxyUrl: useProxy && settings.proxy.enabled ? settings.proxy.proxyUrl : null,
  };
}

function requireCredential(value: ProvisionedCredential) {
  if (!value.id || !value.key) throw new Error("采集站凭据创建响应缺少资源 ID 或 Key");
  return value;
}

function numericGroupId(value: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error(`Sub2API 分组 ID 无效: ${value}`);
  return id;
}

function positiveId(value: string, label: string) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`${label} ID 无效: ${value}`);
  return id;
}

type RuntimeRemoteInput = Parameters<typeof createRuntimeConnectionRemoteGateway>[0];
type SourceResourceClient = {
  readonly create: (name: string, groupId: string) => Promise<ProvisionedCredential>;
  readonly list: () => Promise<readonly UpstreamKey[]>;
  readonly readKey: (id: string) => Promise<string>;
  readonly delete: (id: string) => Promise<void>;
};
