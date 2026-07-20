import { normalizeRateMultiplier, toFiniteRate } from "../core/rates.ts";
import { requestJson, requestJsonResponse } from "./http-client.ts";
import type { SourceRateSnapshot } from "./source-rates.ts";

export type SourceRateRequest = {
  readonly sourceSiteId: number;
  readonly baseUrl: string;
  readonly accessToken?: string;
  readonly auth?: SourceAuth;
  readonly rechargeRatio: number;
  readonly targetRechargeRatio: number;
  readonly newApiUserId?: string;
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

export type SourceAuthSession = {
  readonly accessToken: string;
  readonly refreshToken?: string;
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
    headers: newApiAuthHeaders(accessToken, input.newApiUserId),
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
  return (await resolveSub2ApiAuthSession(input)).accessToken;
}

export async function resolveSub2ApiAuthSession(input: SourceRateRequest): Promise<SourceAuthSession> {
  const auth = normalizeAuth(input);
  if (auth.mode === "manual_token") {
    const normalized = normalizeNewApiToken(auth.accessToken);
    const accessToken = input.newApiUserId?.trim() && !normalized.includes("::") ? `${normalized}::${input.newApiUserId.trim()}` : normalized;
    if (accessToken) return { accessToken, refreshToken: optionalToken(auth.rtToken) };
    return refreshSub2ApiAuthSession(input, auth.rtToken ?? "");
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
  return { accessToken: token, refreshToken: optionalToken(data.refresh_token) };
}

export async function resolveNewApiAccessToken(input: SourceRateRequest) {
  return (await resolveNewApiAuthSession(input)).accessToken;
}

export async function resolveNewApiAuthSession(input: SourceRateRequest): Promise<SourceAuthSession> {
  const auth = normalizeAuth(input);
  if (auth.mode === "manual_token") return manualNewApiSession(auth);
  return loginNewApiSession(input, auth);
}

function manualNewApiSession(auth: Extract<SourceAuth, { mode: "manual_token" }>) {
  const accessToken = auth.accessToken.trim();
  if (!accessToken && auth.rtToken?.trim()) throw new Error("NewAPI 不支持 rtToken 刷新，请填写 accessToken 或使用账号密码");
  if (!accessToken) throw new Error("采集站 accessToken 不能为空");
  return { accessToken };
}

async function loginNewApiSession(input: SourceRateRequest, auth: Extract<SourceAuth, { mode: "password" }>) {
  const response = await requestJsonResponse({
    url: `${trimBaseUrl(input.baseUrl)}/api/user/login`,
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: { username: auth.username, password: auth.password },
    timeoutMs: input.timeoutMs,
    proxyUrl: input.proxyUrl,
  });
  const payload = response.data;
  const record = asRecord(payload);
  if (record.success !== true) throw new Error(stringValue(record.message) || "登录失败");
  const data = asRecord(record.data);
  const userId = stringValue(data.id || input.newApiUserId);
  const cookie = sessionCookie(response.headers["set-cookie"]);
  const token = cookie ? `session:${cookie}` : normalizeNewApiToken(stringValue(data.token || data.access_token));
  if (!token) throw new Error("登录响应缺少 session token");
  return { accessToken: userId ? `${token}::${userId}` : token, refreshToken: optionalToken(data.refresh_token) };
}

function normalizeAuth(input: SourceRateRequest): SourceAuth {
  if (input.auth) return input.auth;
  return { mode: "manual_token", accessToken: input.accessToken ?? "" };
}

async function refreshSub2ApiAuthSession(input: SourceRateRequest, rtToken: string): Promise<SourceAuthSession> {
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
  return { accessToken: token, refreshToken: optionalToken(data.refresh_token) ?? refreshToken };
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
      platform: "new-api",
      rawRate: toFiniteRate(ratio),
    });
  });
}

function sourceSnapshot(input: SourceSnapshotInput): SourceRateSnapshot {
  if (input.rawRate === null) throw new Error(`分组 ${input.groupId} 缺少有效倍率`);
  return {
    sourceSiteId: input.request.sourceSiteId,
    groupId: input.groupId,
    groupName: input.groupName,
    platform: input.platform,
    rawRate: input.rawRate,
    effectiveRate: normalizeRateMultiplier(
      input.rawRate * input.request.targetRechargeRatio / input.request.rechargeRatio,
    ),
    collectedAt: new Date(),
  };
}

function expectCodeZeroArray(payload: unknown, fallback: string) {
  const record = asRecord(payload);
  if (Number(record.code ?? 0) !== 0) throw new Error(stringValue(record.message) || fallback);
  if (!Array.isArray(record.data)) throw new Error(`${fallback}：响应缺少 data 数组`);
  return record.data;
}

function expectCodeZeroRecord(payload: unknown, fallback: string) {
  const record = asRecord(payload);
  if (Number(record.code ?? 0) !== 0) throw new Error(stringValue(record.message) || fallback);
  if (!record.data || typeof record.data !== "object" || Array.isArray(record.data)) {
    throw new Error(`${fallback}：响应缺少 data 对象`);
  }
  return record.data as JsonRecord;
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

export function newApiAuthHeaders(accessToken: string, configuredUserId?: string) {
  const normalized = normalizeNewApiToken(accessToken);
  const separator = normalized.lastIndexOf("::");
  const token = separator >= 0 ? normalized.slice(0, separator) : normalized;
  const userId = separator >= 0 ? normalized.slice(separator + 2) : configuredUserId?.trim() ?? "";
  const headers: Record<string, string> = { accept: "application/json" };
  if (userId) headers["New-Api-User"] = userId;
  if (token.startsWith("session:")) headers.cookie = token.slice("session:".length);
  else if (token && token !== "public") headers.authorization = `Bearer ${token}`;
  return headers;
}

function normalizeNewApiToken(value: string) {
  const token = value.trim().replace(/^bearer\s+/i, "");
  if (token.includes("=") && !token.startsWith("session:")) return `session:${token}`;
  return token;
}

function sessionCookie(value?: string) {
  return (value ?? "").split(/\r?\n/).map((cookie) => cookie.split(";")[0]?.trim() ?? "").filter(Boolean).join("; ");
}

function optionalToken(value: unknown) {
  const token = stringValue(value).trim();
  return token || undefined;
}
