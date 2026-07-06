import { normalizeRateMultiplier, toFiniteRate } from "../core/rates.ts";
import { requestJson } from "./http-client.ts";
import type { SourceRateSnapshot } from "./source-rates.ts";

export type SourceRateRequest = {
  readonly sourceSiteId: number;
  readonly baseUrl: string;
  readonly accessToken?: string;
  readonly auth?: SourceAuth;
  readonly rechargeRatio: number;
  readonly timeoutMs?: number;
  readonly proxyUrl?: string | null;
};

export type SourceAuth =
  | {
    readonly mode: "manual_token";
    readonly accessToken: string;
    readonly rtToken?: string;
  }
  | {
    readonly mode: "password";
    readonly username: string;
    readonly password: string;
  };

type JsonRecord = Record<string, unknown>;
type SourceSnapshotInput = {
  readonly request: SourceRateRequest;
  readonly groupId: string;
  readonly groupName: string;
  readonly platform?: string;
  readonly rawRate: number | null;
};

export async function collectSub2ApiSourceRates(input: SourceRateRequest) {
  const accessToken = await resolveSub2ApiAccessToken(input);
  const [groupsPayload, userRatesPayload] = await Promise.all([
    requestJson({
      url: apiV1Url(input.baseUrl, "/groups/available"),
      method: "GET",
      headers: authHeaders(accessToken),
      timeoutMs: input.timeoutMs,
      proxyUrl: input.proxyUrl,
    }),
    requestJson({
      url: apiV1Url(input.baseUrl, "/groups/rates"),
      method: "GET",
      headers: authHeaders(accessToken),
      timeoutMs: input.timeoutMs,
      proxyUrl: input.proxyUrl,
    }),
  ]);
  const groups = expectCodeZeroArray(groupsPayload, "获取分组失败");
  const userRates = expectCodeZeroRecord(userRatesPayload, "获取专属倍率失败");
  return normalizeSub2ApiGroups(input, groups, userRates);
}

export async function collectNewApiSourceRates(input: SourceRateRequest) {
  const accessToken = await resolveNewApiAccessToken(input);
  const payload = await requestJson({
    url: `${trimBaseUrl(input.baseUrl)}/api/pricing`,
    method: "GET",
    headers: authHeaders(accessToken),
    timeoutMs: input.timeoutMs,
    proxyUrl: input.proxyUrl,
  });
  const record = asRecord(payload);
  if (record.success !== true) {
    throw new Error(stringValue(record.message) || "获取 NewAPI 定价失败");
  }
  return normalizeNewApiGroups(input, asRecord(record.group_ratio), asRecord(record.usable_group));
}

export async function resolveSub2ApiAccessToken(input: SourceRateRequest) {
  const auth = normalizeAuth(input);
  if (auth.mode === "manual_token") {
    const accessToken = auth.accessToken.trim();
    if (accessToken) return accessToken;
    return refreshSub2ApiAccessToken(input, auth.rtToken ?? "");
  }
  const payload = await postJson({
    url: apiV1Url(input.baseUrl, "/auth/login"),
    body: { email: auth.username, password: auth.password },
    timeoutMs: input.timeoutMs,
    proxyUrl: input.proxyUrl,
  });
  const data = expectCodeZeroRecord(payload, "登录失败");
  const token = stringValue(data.access_token);
  if (!token) throw new Error("登录响应缺少 access_token");
  return token;
}

export async function resolveNewApiAccessToken(input: SourceRateRequest) {
  const auth = normalizeAuth(input);
  if (auth.mode === "manual_token") {
    const accessToken = auth.accessToken.trim();
    if (!accessToken && auth.rtToken?.trim()) throw new Error("NewAPI 不支持 rtToken 刷新，请填写 accessToken 或使用账号密码");
    if (!accessToken) throw new Error("采集站 accessToken 不能为空");
    return accessToken;
  }
  const payload = await postJson({
    url: `${trimBaseUrl(input.baseUrl)}/api/user/login`,
    body: { username: auth.username, password: auth.password },
    timeoutMs: input.timeoutMs,
    proxyUrl: input.proxyUrl,
  });
  const record = asRecord(payload);
  if (record.success !== true) throw new Error(stringValue(record.message) || "登录失败");
  const data = asRecord(record.data);
  const token = stringValue(data.token || data.access_token);
  if (!token) throw new Error("登录响应缺少 token");
  return token;
}

function normalizeAuth(input: SourceRateRequest): SourceAuth {
  if (input.auth) return input.auth;
  return { mode: "manual_token", accessToken: input.accessToken ?? "" };
}

async function refreshSub2ApiAccessToken(input: SourceRateRequest, rtToken: string) {
  const refreshToken = rtToken.trim();
  if (!refreshToken) throw new Error("采集站 accessToken 或 rtToken 不能为空");
  const payload = await postJson({
    url: apiV1Url(input.baseUrl, "/auth/refresh"),
    body: { refresh_token: refreshToken },
    timeoutMs: input.timeoutMs,
    proxyUrl: input.proxyUrl,
  });
  const data = expectCodeZeroRecord(payload, "刷新 token 失败");
  const token = stringValue(data.access_token);
  if (!token) throw new Error("刷新响应缺少 access_token");
  return token;
}

async function postJson(input: {
  readonly url: string;
  readonly body: JsonRecord;
  readonly timeoutMs?: number;
  readonly proxyUrl?: string | null;
}) {
  return requestJson({
    url: input.url,
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: input.body,
    timeoutMs: input.timeoutMs,
    proxyUrl: input.proxyUrl,
  });
}

function normalizeSub2ApiGroups(
  input: SourceRateRequest,
  groups: readonly unknown[],
  userRates: JsonRecord,
) {
  return groups.map((item) => {
    const group = asRecord(item);
    const groupId = stringValue(group.id);
    if (!groupId) throw new Error("采集站分组缺少 id");
    const defaultRate = toFiniteRate(group.rate_multiplier);
    const userRate = Object.hasOwn(userRates, groupId) ? toFiniteRate(userRates[groupId]) : null;
    return sourceSnapshot({
      request: input,
      groupId,
      groupName: stringValue(group.name) || groupId,
      platform: stringValue(group.platform) || undefined,
      rawRate: userRate ?? defaultRate,
    });
  });
}

function normalizeNewApiGroups(
  input: SourceRateRequest,
  groupRatio: JsonRecord,
  usableGroup: JsonRecord,
) {
  return Object.entries(groupRatio).map(([groupId, ratio]) => {
    const groupName = stringValue(usableGroup[groupId]) || groupId;
    return sourceSnapshot({
      request: input,
      groupId,
      groupName,
      rawRate: toFiniteRate(ratio),
    });
  });
}

function sourceSnapshot(input: SourceSnapshotInput): SourceRateSnapshot {
  if (input.rawRate === null) throw new Error(`分组 ${input.groupId} 缺少有效倍率`);
  const ratio = input.request.rechargeRatio > 0 ? input.request.rechargeRatio : 1;
  return {
    sourceSiteId: input.request.sourceSiteId,
    groupId: input.groupId,
    groupName: input.groupName,
    platform: input.platform,
    rawRate: input.rawRate,
    effectiveRate: normalizeRateMultiplier(input.rawRate / ratio),
    collectedAt: new Date(),
  };
}

function expectCodeZeroArray(payload: unknown, fallback: string) {
  const record = asRecord(payload);
  if (Number(record.code ?? 0) !== 0) throw new Error(stringValue(record.message) || fallback);
  return Array.isArray(record.data) ? record.data : [];
}

function expectCodeZeroRecord(payload: unknown, fallback: string) {
  const record = asRecord(payload);
  if (Number(record.code ?? 0) !== 0) throw new Error(stringValue(record.message) || fallback);
  return asRecord(record.data);
}

function authHeaders(accessToken: string) {
  const token = accessToken.trim();
  if (!token) throw new Error("采集站 accessToken 不能为空");
  return { accept: "application/json", authorization: `Bearer ${token}` };
}

function apiV1Url(baseUrl: string, path: string) {
  return `${trimBaseUrl(baseUrl)}/api/v1${path}`;
}

function trimBaseUrl(baseUrl: string) {
  const trimmed = baseUrl.trim();
  if (!trimmed) throw new Error("baseUrl 不能为空");
  return trimmed.replace(/\/+$/, "");
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function stringValue(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}
