import { newApiAuthHeaders, resolveNewApiAccessToken, resolveSub2ApiAccessToken, type SourceRateRequest } from "./source-rate-client.ts";
import { requestJson } from "./http-client.ts";

const NEW_API_QUOTA_PER_UNIT = 500_000;
const NEW_API_USAGE_LOG_TYPE = 2;
const MILLISECONDS_PER_SECOND = 1_000;
const SUB2API_USAGE_TIMEZONE = "Asia/Shanghai";

export type SourceAccountSnapshot = {
  readonly sourceSiteId: number;
  readonly label: string;
  readonly balance: number | null;
  readonly todayConsume: number | null;
  readonly historyRecharge: number | null;
};

type JsonRecord = Record<string, unknown>;

export async function getSub2ApiSourceAccount(input: SourceRateRequest): Promise<SourceAccountSnapshot> {
  const accessToken = await resolveSub2ApiAccessToken(input);
  const [payload, usage] = await Promise.all([
    requestAccount(apiV1Url(input.baseUrl, "/auth/me"), accessToken, input),
    requestSub2ApiUsage(input, accessToken).catch(() => null),
  ]);
  const record = expectCodeZeroRecord(payload, "获取账户信息失败");
  const balance = finiteNumber(record.balance, "账户余额");
  return {
    sourceSiteId: input.sourceSiteId,
    label: stringValue(record.email || record.username || record.id || "Sub2API"),
    balance,
    todayConsume: usage === null ? null : firstFinite(usage, ["today_actual_cost", "todayActualCost"]),
    historyRecharge: sub2ApiHistoryRecharge(record, usage ?? {}, balance),
  };
}

async function requestSub2ApiUsage(input: SourceRateRequest, accessToken: string) {
  try {
    const payload = await requestAccount(apiV1Url(input.baseUrl, "/usage/dashboard/stats"), accessToken, input);
    const usage = expectCodeZeroRecord(payload, "获取账户消费指标失败");
    if (firstFinite(usage, ["today_actual_cost", "todayActualCost"]) !== null) return usage;
  } catch {}
  const range = sub2ApiTodayRange();
  const params = new URLSearchParams({
    start_date: range.startDate,
    end_date: range.endDate,
    timezone: SUB2API_USAGE_TIMEZONE,
  });
  const payload = await requestAccount(apiV1Url(input.baseUrl, `/usage/stats?${params}`), accessToken, input);
  const usage = expectCodeZeroRecord(payload, "获取账户消费指标失败");
  return { ...usage, today_actual_cost: firstFinite(usage, ["total_actual_cost", "totalActualCost"]) };
}

export async function getNewApiSourceAccount(input: SourceRateRequest): Promise<SourceAccountSnapshot> {
  const accessToken = await resolveNewApiAccessToken(input);
  const [account, todayConsumeQuota] = await Promise.all([
    requestNewApiAccount(input, accessToken),
    requestNewApiTodayConsume(input, accessToken),
  ]);
  return {
    sourceSiteId: input.sourceSiteId,
    label: account.label,
    balance: account.quota / NEW_API_QUOTA_PER_UNIT,
    todayConsume: todayConsumeQuota === null ? null : todayConsumeQuota / NEW_API_QUOTA_PER_UNIT,
    historyRecharge: account.historyQuota / NEW_API_QUOTA_PER_UNIT,
  };
}

function sub2ApiHistoryRecharge(account: JsonRecord, usage: JsonRecord, balance: number | null) {
  const total = firstFinite(account, ["total_recharged", "totalRecharged"]);
  if (total !== null && total !== 0) return total;
  const consumed = firstFinite(usage, ["total_actual_cost", "totalActualCost"]);
  return consumed !== null && balance !== null ? consumed + balance : total;
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

async function requestNewApiTodayConsume(input: SourceRateRequest, accessToken: string) {
  const range = todayUnixRange();
  const payload = await requestJson({
    url: `${trimBaseUrl(input.baseUrl)}/api/log/self/stat?type=${NEW_API_USAGE_LOG_TYPE}&start_timestamp=${range.start}&end_timestamp=${range.end}`,
    method: "GET", headers: newApiAuthHeaders(accessToken, input.newApiUserId),
    timeoutMs: input.timeoutMs, proxyUrl: input.proxyUrl,
  });
  const record = asRecord(payload);
  if (record.success === false) throw new Error(stringValue(record.message) || "获取 New API 今日消费失败");
  if (!record.data || typeof record.data !== "object" || Array.isArray(record.data)) {
    throw new Error("获取 New API 今日消费失败：响应缺少 data 对象");
  }
  return firstFinite(record.data as JsonRecord, ["quota", "used_quota", "usedQuota"]);
}

function parseNewApiAccount(payload: unknown) {
  const record = asRecord(payload);
  if (record.success === false) throw new Error(stringValue(record.message) || "接口返回失败");
  const data = asRecord(record.data);
  const quota = newApiRemainingQuota(data);
  if (quota === null) return null;
  return {
    label: stringValue(data.username || data.email || data.id || "NewAPI"),
    quota,
    historyQuota: newApiHistoryQuota(data, quota),
  };
}

function newApiHistoryQuota(data: JsonRecord, remaining: number) {
  const granted = firstFinite(data, ["total", "total_quota", "totalQuota", "total_granted", "totalGranted"]);
  if (granted !== null) return granted;
  const used = firstFinite(data, ["used_quota", "usedQuota", "used"]);
  if (used !== null) return remaining + used;
  const subscriptions = Array.isArray(data.subscriptions) ? data.subscriptions : Array.isArray(data.all_subscriptions) ? data.all_subscriptions : [];
  const totals = subscriptions.map(subscriptionGranted).filter((value): value is number => value !== null);
  return totals.length ? totals.reduce((total, value) => total + value, 0) : remaining;
}

function subscriptionGranted(value: unknown) {
  const row = asRecord(value);
  const subscription = Object.keys(asRecord(row.subscription)).length ? asRecord(row.subscription) : row;
  const granted = firstFinite(subscription, ["amount_total", "total_amount", "totalAmount", "amountTotal", "total_quota", "totalQuota"]);
  if (granted !== null) return granted;
  const remaining = firstFinite(subscription, ["amount_remaining", "remaining_amount", "amountRemaining", "remainingAmount", "remain_quota", "remaining_quota", "remainingQuota", "balance", "remaining"]);
  const used = firstFinite(subscription, ["amount_used", "used_amount", "amountUsed", "usedAmount", "used_quota", "usedQuota", "used"]);
  return remaining !== null && used !== null ? remaining + used : null;
}

function todayUnixRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - 1;
  return { start: Math.floor(start / MILLISECONDS_PER_SECOND), end: Math.floor(end / MILLISECONDS_PER_SECOND) };
}

function sub2ApiTodayRange() {
  const now = new Date();
  const today = dateInTimeZone(now, SUB2API_USAGE_TIMEZONE);
  const yesterday = dateInTimeZone(new Date(now.getTime() - 24 * 60 * 60 * 1_000), SUB2API_USAGE_TIMEZONE);
  return { startDate: yesterday, endDate: today };
}

function dateInTimeZone(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
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
