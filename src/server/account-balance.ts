import { requestText } from "@/server/http";
import type { Sub2ApiAdminClient, Sub2ApiDataAccount } from "@/server/clients/sub2api-admin";
import { getAccountId } from "@/server/account-utils";

export type AccountBalanceStatus = "ok" | "unsupported" | "invalid" | "error";

export type AccountBalanceResult = {
  accountId: number;
  status: AccountBalanceStatus;
  provider?: "sub2api-admin" | "usage" | "new-api";
  planName?: string | null;
  remaining?: number | null;
  used?: number | null;
  total?: number | null;
  unit?: string | null;
  message?: string | null;
  checkedAt: string;
};

type ExportAccountMap = Map<number, Sub2ApiDataAccount>;

function finiteNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function lowerString(value: unknown) {
  return stringValue(value).toLowerCase();
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function deepPickObject(source: unknown, keys: string[]) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const record = source as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  }
  return null;
}

function collectCredentialScopes(credentials: Record<string, unknown>) {
  const scopes: Record<string, unknown>[] = [credentials];
  const nested = deepPickObject(credentials, ["auth", "auth_info", "api", "token", "tokens", "new_api", "newApi", "new_api_auth", "newApiAuth", "provider", "config"]);
  if (nested) scopes.push(nested);
  return scopes;
}

function findCredentialString(credentials: Record<string, unknown>, keys: string[]) {
  for (const scope of collectCredentialScopes(credentials)) {
    for (const key of keys) {
      const value = stringValue(scope[key]);
      if (value) return value;
    }
  }
  return "";
}

function unwrapJson(raw: string) {
  const parsed = JSON.parse(raw) as unknown;
  if (parsed && typeof parsed === "object" && "code" in parsed && "data" in parsed) {
    const envelope = parsed as { code?: unknown; message?: unknown; data?: unknown };
    if (envelope.code !== true && Number(envelope.code) !== 0) throw new Error(stringValue(envelope.message) || "请求失败");
    return envelope.data;
  }
  return parsed;
}

function invalidResult(accountId: number, message: string, checkedAt: string): AccountBalanceResult {
  return { accountId, status: "invalid", remaining: null, unit: null, message, checkedAt };
}

function unsupportedResult(accountId: number, message: string, checkedAt: string): AccountBalanceResult {
  return { accountId, status: "unsupported", remaining: null, unit: null, message, checkedAt };
}

function errorResult(accountId: number, message: string, checkedAt: string): AccountBalanceResult {
  return { accountId, status: "error", remaining: null, unit: null, message, checkedAt };
}

function successResult(accountId: number, provider: AccountBalanceResult["provider"], data: Omit<AccountBalanceResult, "accountId" | "status" | "provider" | "checkedAt">, checkedAt: string): AccountBalanceResult {
  return { accountId, status: "ok", provider, checkedAt, ...data };
}

function parseUsageLikeResponse(accountId: number, payload: unknown, checkedAt: string): AccountBalanceResult | null {
  if (!payload || typeof payload !== "object") return null;
  const response = payload as Record<string, unknown>;

  const remaining = finiteNumber(response.remaining)
    ?? finiteNumber((response.quota as Record<string, unknown> | undefined)?.remaining)
    ?? finiteNumber(response.balance);
  const unit = stringValue(response.unit) || stringValue((response.quota as Record<string, unknown> | undefined)?.unit) || "USD";
  const isValid = response.is_active ?? response.isValid ?? true;
  if (isValid === false) {
    return invalidResult(accountId, stringValue(response.message) || "账号不可用", checkedAt);
  }
  if (remaining === null) return null;

  return successResult(accountId, "usage", { remaining, unit }, checkedAt);
}

function parseNewApiSelfResponse(accountId: number, payload: unknown, checkedAt: string): AccountBalanceResult | null {
  if (!payload || typeof payload !== "object") return null;
  const response = payload as Record<string, unknown>;
  if (response.success === false) {
    return invalidResult(accountId, stringValue(response.message) || "查询失败", checkedAt);
  }

  const data = response.success === true && response.data && typeof response.data === "object"
    ? response.data as Record<string, unknown>
    : response;
  const quota = finiteNumber(data.quota);
  const usedQuota = finiteNumber(data.used_quota);
  if (quota === null && usedQuota === null) return null;

  return successResult(accountId, "new-api", {
    planName: stringValue(data.group) || "默认套餐",
    remaining: quota === null ? null : quota / 500000,
    used: usedQuota === null ? null : usedQuota / 500000,
    total: quota !== null && usedQuota !== null ? (quota + usedQuota) / 500000 : null,
    unit: "USD",
  }, checkedAt);
}

function parseNewApiUsageTokenResponse(accountId: number, payload: unknown, checkedAt: string): AccountBalanceResult | null {
  if (!payload || typeof payload !== "object") return null;
  const response = payload as Record<string, unknown>;
  if (response.success === false) {
    return invalidResult(accountId, stringValue(response.message) || "查询失败", checkedAt);
  }

  const data = response.success === true && response.data && typeof response.data === "object"
    ? response.data as Record<string, unknown>
    : response;
  const quota = finiteNumber(data.quota);
  const usedQuota = finiteNumber(data.used_quota ?? data.used);
  const remaining = finiteNumber(data.remaining ?? data.total_available);
  const balance = finiteNumber(data.balance);
  const total = finiteNumber(data.total ?? data.total_granted);
  const totalUsed = finiteNumber(data.total_used);
  const unlimited = data.unlimited_quota === true;
  const unit = stringValue(data.unit) || "USD";
  const planName = stringValue(data.group) || stringValue(data.plan_name) || stringValue(data.planName) || stringValue(data.name) || "默认套餐";

  const resolvedRemaining = remaining ?? balance ?? quota;
  const resolvedUsed = usedQuota ?? totalUsed;
  if (resolvedRemaining === null && resolvedUsed === null && total === null && !unlimited) return null;

  return successResult(accountId, "new-api", {
    planName,
    remaining: resolvedRemaining === null ? null : resolvedRemaining / 500000,
    used: resolvedUsed === null ? null : resolvedUsed / 500000,
    total: total === null ? (quota !== null && resolvedUsed !== null ? (quota + resolvedUsed) / 500000 : null) : total / 500000,
    unit,
    message: unlimited ? "无限额度" : null,
  }, checkedAt);
}

function parseSub2ApiUsage(accountId: number, payload: unknown, checkedAt: string): AccountBalanceResult | null {
  if (!payload || typeof payload !== "object") return null;
  const response = payload as Record<string, unknown>;
  if (typeof response.error === "string" && response.error.trim()) {
    return errorResult(accountId, response.error.trim(), checkedAt);
  }

  const credits = Array.isArray(response.ai_credits) ? response.ai_credits as Array<Record<string, unknown>> : [];
  if (credits.length > 0) {
    const total = credits.reduce((sum, item) => sum + (finiteNumber(item.amount) ?? 0), 0);
    return successResult(accountId, "sub2api-admin", { remaining: total, unit: "credits" }, checkedAt);
  }

  const windows = [
    ["5h", response.five_hour],
    ["7d", response.seven_day],
    ["7d Sonnet", response.seven_day_sonnet],
    ["1d", response.gemini_shared_daily],
    ["Pro", response.gemini_pro_daily],
    ["Flash", response.gemini_flash_daily],
  ] as const;
  const window = windows.find(([, value]) => value && typeof value === "object");
  if (!window) return null;

  const data = window[1] as Record<string, unknown>;
  const utilization = finiteNumber(data.utilization);
  const limitRequests = finiteNumber(data.limit_requests);
  const usedRequests = finiteNumber(data.used_requests);
  const remainingRequests = limitRequests !== null && usedRequests !== null ? Math.max(0, limitRequests - usedRequests) : null;
  const windowStats = data.window_stats && typeof data.window_stats === "object" ? data.window_stats as Record<string, unknown> : null;
  const cost = finiteNumber(windowStats?.cost);

  return successResult(accountId, "sub2api-admin", {
    planName: window[0],
    remaining: remainingRequests,
    used: cost,
    unit: remainingRequests !== null ? "req" : "%",
    message: utilization !== null ? `使用率 ${formatNumber(utilization)}%` : null,
  }, checkedAt);
}

function formatNumber(value: number) {
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 1) return value.toFixed(2).replace(/\.?0+$/, "");
  return value.toFixed(4).replace(/\.?0+$/, "");
}

async function requestJson(url: string, headers: Record<string, string>, timeoutMs = 12_000) {
  const { status, body } = await requestText({
    method: "GET",
    url,
    headers,
    timeoutMs,
  });
  if (status < 200 || status >= 300) throw new Error(`HTTP ${status}: ${body.slice(0, 160)}`);
  if (!body.trim()) throw new Error("空响应");
  return unwrapJson(body);
}

async function queryUsageEndpoint(accountId: number, credentials: Record<string, unknown>, checkedAt: string) {
  const baseUrl = normalizeBaseUrl(findCredentialString(credentials, ["base_url", "baseUrl", "endpoint", "url"]));
  const apiKey = findCredentialString(credentials, ["api_key", "apiKey", "key", "token", "access_token", "accessToken"]);
  if (!baseUrl || !apiKey) return null;

  const payload = await requestJson(`${baseUrl}/v1/usage`, {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
  });
  return parseUsageLikeResponse(accountId, payload, checkedAt)
    ?? unsupportedResult(accountId, "usage 响应中没有 remaining/quota/balance 字段", checkedAt);
}

async function queryNewApiEndpoint(accountId: number, credentials: Record<string, unknown>, checkedAt: string) {
  const baseUrl = normalizeBaseUrl(findCredentialString(credentials, ["base_url", "baseUrl", "endpoint", "url"]));
  const accessToken = findCredentialString(credentials, ["access_token", "accessToken", "api_key", "apiKey", "token"]);
  if (!baseUrl || !accessToken) return null;

  const userId = findCredentialString(credentials, ["user_id", "userId", "new_api_user", "newApiUser", "chatgpt_user_id", "chatgptUserId"]);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  };
  if (userId) headers["New-Api-User"] = userId;

  const payload = await requestJson(`${baseUrl}/api/user/self`, headers);
  return parseNewApiSelfResponse(accountId, payload, checkedAt)
    ?? unsupportedResult(accountId, "New API /api/user/self 响应中没有 quota/used_quota 字段", checkedAt);
}

async function queryNewApiUsageToken(accountId: number, credentials: Record<string, unknown>, checkedAt: string) {
  const baseUrl = normalizeBaseUrl(findCredentialString(credentials, ["base_url", "baseUrl", "endpoint", "url"]));
  const accessToken = findCredentialString(credentials, ["access_token", "accessToken", "api_key", "apiKey", "token"]);
  if (!baseUrl || !accessToken) return null;

  const payload = await requestJson(`${baseUrl}/api/usage/token`, {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  });
  return parseNewApiUsageTokenResponse(accountId, payload, checkedAt)
    ?? unsupportedResult(accountId, "New API /api/usage/token 响应中没有余额字段", checkedAt);
}

function accountByIdFromExport(accountIds: number[], accounts: Sub2ApiDataAccount[] | undefined): ExportAccountMap {
  const map: ExportAccountMap = new Map();
  const rows = accounts ?? [];
  for (const account of rows) {
    const accountId = getAccountId(account);
    if (accountId && accountIds.includes(accountId)) map.set(accountId, account);
  }

  if (map.size > 0 || rows.length !== accountIds.length) return map;

  for (let index = 0; index < accountIds.length; index += 1) {
    map.set(accountIds[index], rows[index]);
  }
  return map;
}

async function fetchExportAccountMap(client: Sub2ApiAdminClient, accountIds: number[]) {
  const uniqueIds = Array.from(new Set(accountIds.filter((id) => Number.isInteger(id) && id > 0)));
  if (uniqueIds.length === 0) return new Map<number, Sub2ApiDataAccount>();

  try {
    const exported = await client.exportAccountsData(uniqueIds);
    return accountByIdFromExport(uniqueIds, exported.accounts);
  } catch {
    return new Map<number, Sub2ApiDataAccount>();
  }
}

async function queryOne(input: {
  client: Sub2ApiAdminClient;
  accountId: number;
  exportedAccount?: Sub2ApiDataAccount;
  checkedAt: string;
  force: boolean;
}) {
  const { client, accountId, exportedAccount, checkedAt, force } = input;

  try {
    const usage = await client.getAccountUsage(accountId, force ? "active" : "passive", force);
    const parsed = parseSub2ApiUsage(accountId, usage, checkedAt);
    if (parsed) return parsed;
  } catch {
    // Older Sub2API deployments may not expose account usage; fall back to upstream probing.
  }

  const credentials = exportedAccount?.credentials;
  if (!credentials || typeof credentials !== "object") {
    return unsupportedResult(accountId, "无法获取账号凭证，目标 Sub2API 可能不支持账号数据导出", checkedAt);
  }

  const platform = lowerString(exportedAccount?.platform);
  const type = lowerString(exportedAccount?.type);
  const candidates = platform.includes("new") || type.includes("new")
    ? [queryNewApiUsageToken, queryNewApiEndpoint, queryUsageEndpoint]
    : [queryUsageEndpoint, queryNewApiUsageToken, queryNewApiEndpoint];

  let lastError = "";
  for (const candidate of candidates) {
    try {
      const result = await candidate(accountId, credentials, checkedAt);
      if (result) return result;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  if (lastError) return errorResult(accountId, lastError, checkedAt);
  return unsupportedResult(accountId, "缺少 base_url/api_key，或 New API 响应中没有可解析的余额字段", checkedAt);
}

export async function fetchAccountBalances(input: {
  client: Sub2ApiAdminClient;
  accountIds: number[];
  force?: boolean;
  concurrency?: number;
}) {
  const accountIds = Array.from(new Set(input.accountIds.filter((id) => Number.isInteger(id) && id > 0))).slice(0, 200);
  const checkedAt = new Date().toISOString();
  if (accountIds.length === 0) return [];

  const exportedById = await fetchExportAccountMap(input.client, accountIds);
  const concurrency = Math.max(1, Math.min(input.concurrency ?? 4, 8));
  const results = new Map<number, AccountBalanceResult>();
  let cursor = 0;

  async function worker() {
    while (cursor < accountIds.length) {
      const accountId = accountIds[cursor];
      cursor += 1;
      try {
        results.set(accountId, await queryOne({
          client: input.client,
          accountId,
          exportedAccount: exportedById.get(accountId),
          checkedAt,
          force: Boolean(input.force),
        }));
      } catch (error) {
        results.set(accountId, errorResult(accountId, error instanceof Error ? error.message : String(error), checkedAt));
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, accountIds.length) }, () => worker()));
  return accountIds.map((accountId) => results.get(accountId) ?? errorResult(accountId, "查询失败", checkedAt));
}
