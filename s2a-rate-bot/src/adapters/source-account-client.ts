import { newApiAuthHeaders, resolveNewApiAccessToken, resolveSub2ApiAccessToken, type SourceRateRequest } from "./source-rate-client.ts";
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
  const account = await requestNewApiAccount(input, accessToken);
  return {
    sourceSiteId: input.sourceSiteId,
    label: account.label,
    balance: account.quota / NEW_API_QUOTA_PER_UNIT,
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

function newApiRemainingQuota(data: JsonRecord) {
  const direct = firstFinite(data, ["quota", "remain_quota", "remaining_quota", "remainingQuota", "balance_quota", "balanceQuota", "total_available", "totalAvailable", "balance", "remaining"]);
  if (direct !== null) return direct;
  const total = firstFinite(data, ["total", "total_quota", "totalQuota", "total_granted", "totalGranted"]);
  const used = firstFinite(data, ["used_quota", "usedQuota", "used"]);
  if (total !== null && used !== null) return Math.max(0, total - used);
  return subscriptionRemaining(data);
}

function subscriptionRemaining(data: JsonRecord) {
  const rows = Array.isArray(data.subscriptions) ? data.subscriptions : Array.isArray(data.all_subscriptions) ? data.all_subscriptions : [];
  let total = 0;
  let found = false;
  for (const row of rows) {
    const record = asRecord(row);
    const subscription = Object.keys(asRecord(record.subscription)).length ? asRecord(record.subscription) : record;
    const remaining = firstFinite(subscription, ["amount_remaining", "remaining_amount", "amountRemaining", "remainingAmount", "remain_quota", "remaining_quota", "remainingQuota", "balance", "remaining"]);
    const granted = firstFinite(subscription, ["amount_total", "total_amount", "totalAmount", "amountTotal", "total_quota", "totalQuota"]);
    const used = firstFinite(subscription, ["amount_used", "used_amount", "amountUsed", "usedAmount", "used_quota", "usedQuota", "used"]);
    const value = remaining ?? (granted !== null && used !== null ? Math.max(0, granted - used) : null);
    if (value !== null) { total += value; found = true; }
  }
  return found ? total : null;
}

function firstFinite(record: JsonRecord, keys: readonly string[]) {
  for (const key of keys) {
    const value = finiteNumber(record[key], key);
    if (value !== null) return value;
  }
  return null;
}

async function requestNewApiAccount(input: SourceRateRequest, accessToken: string) {
  const baseUrl = trimBaseUrl(input.baseUrl);
  const failures: string[] = [];
  for (const path of ["/api/subscription/self", "/api/user/self"]) {
    try {
      const payload = await requestJson({
        url: `${baseUrl}${path}`, method: "GET",
        headers: newApiAuthHeaders(accessToken, input.newApiUserId),
        timeoutMs: input.timeoutMs, proxyUrl: input.proxyUrl,
      });
      const account = parseNewApiAccount(payload);
      if (account) return account;
      failures.push(`${path} 响应中没有可解析的余额字段`);
    } catch (error) { failures.push(`${path}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  throw new Error(`获取 New API 余额失败：${failures.join("；")}`);
}

function parseNewApiAccount(payload: unknown) {
  const record = asRecord(payload);
  if (record.success === false) throw new Error(stringValue(record.message) || "接口返回失败");
  const data = asRecord(record.data);
  const quota = newApiRemainingQuota(data);
  if (quota === null) return null;
  return { label: stringValue(data.username || data.email || data.id || "NewAPI"), quota };
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
