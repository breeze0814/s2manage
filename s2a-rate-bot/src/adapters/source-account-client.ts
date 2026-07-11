import { resolveNewApiAccessToken, resolveSub2ApiAccessToken, type SourceRateRequest } from "./source-rate-client.ts";
import { requestJson } from "./http-client.ts";

const NEW_API_QUOTA_PER_UNIT = 500_000;

export type SourceAccountSnapshot = {
  readonly sourceSiteId: number;
  readonly label: string;
  readonly balance: number | null;
};

type JsonRecord = Record<string, unknown>;

export async function getSub2ApiSourceAccount(input: SourceRateRequest): Promise<SourceAccountSnapshot> {
  const accessToken = await resolveSub2ApiAccessToken(input);
  const payload = await requestAccount(apiV1Url(input.baseUrl, "/auth/me"), accessToken, input);
  const record = expectCodeZeroRecord(payload, "获取账户信息失败");
  return {
    sourceSiteId: input.sourceSiteId,
    label: stringValue(record.email || record.username || record.id || "Sub2API"),
    balance: finiteNumber(record.balance, "账户余额"),
  };
}

export async function getNewApiSourceAccount(input: SourceRateRequest): Promise<SourceAccountSnapshot> {
  const accessToken = await resolveNewApiAccessToken(input);
  const payload = await requestAccount(`${trimBaseUrl(input.baseUrl)}/api/user/self`, accessToken, input);
  const record = asRecord(payload);
  if (record.success !== true) throw new Error(stringValue(record.message) || "获取账户信息失败");
  const data = asRecord(record.data);
  const quota = finiteNumber(data.quota, "账户额度");
  return {
    sourceSiteId: input.sourceSiteId,
    label: stringValue(data.username || data.email || data.id || "NewAPI"),
    balance: quota === null ? null : quota / NEW_API_QUOTA_PER_UNIT,
  };
}

function requestAccount(url: string, accessToken: string, input: SourceRateRequest) {
  return requestJson({
    url,
    method: "GET",
    headers: { accept: "application/json", authorization: `Bearer ${accessToken}` },
    timeoutMs: input.timeoutMs,
    proxyUrl: input.proxyUrl,
  });
}

function expectCodeZeroRecord(payload: unknown, fallback: string) {
  const record = asRecord(payload);
  if (Number(record.code ?? 0) !== 0) throw new Error(stringValue(record.message) || fallback);
  if (!record.data || typeof record.data !== "object" || Array.isArray(record.data)) {
    throw new Error(`${fallback}：响应缺少 data 对象`);
  }
  return record.data as JsonRecord;
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

function finiteNumber(value: unknown, field: string) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new Error(`${field}不是有效数字`);
  return numeric;
}
