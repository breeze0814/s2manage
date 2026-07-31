import { HttpResponseError, type JsonResponseHttpClient } from "../../adapters/http-client.ts";
import type {
  AdminGroup,
  AdminTarget,
  BalanceFilter,
  CurrentUser,
  DateRange,
  NewApiChannelCreate,
  NewApiChannelState,
  NewApiMetricsPayload,
  NewApiSession,
  KeyUsageStat,
  Sub2ApiAccountBulkUpdate,
  Sub2ApiAdminUsersQuery,
  Sub2ApiMetricsPayload,
  Sub2ApiSession,
  Sub2ApiUserBreakdownQuery,
  UpstreamKey,
  UpstreamRecord,
} from "./types.ts";
import { UpstreamProtocolError } from "./types.ts";

const PAGE_SIZE = 100;
const MAX_PAGES = 100;
const DEFAULT_QUOTA_PER_UNIT = 500_000;
const JSON_HEADERS = { accept: "application/json", "content-type": "application/json; charset=utf-8" };

type ClientInput<Session> = {
  readonly baseUrl: string;
  readonly http: JsonResponseHttpClient;
  readonly session?: Session;
};

type RemoteRequester = <T = unknown>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: UpstreamRecord,
) => Promise<T>;

export function normalizeUpstreamUrl(value: string) {
  const candidate = value.trim().match(/^https?:\/\//i) ? value.trim() : `https://${value.trim()}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new UpstreamProtocolError("上游站点地址无效", "invalid_response");
  }
  if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname) {
    throw new UpstreamProtocolError("上游站点地址只允许 http/https", "invalid_response");
  }
  parsed.search = "";
  parsed.hash = "";
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.toString().replace(/\/+$/, "");
}

export function createNewApiClient(input: ClientInput<NewApiSession>) {
  const baseUrl = normalizeUpstreamUrl(input.baseUrl);
  const session = () => requireNewApiSession(input.session, baseUrl);
  const request = <T = unknown>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: UpstreamRecord) =>
    input.http.request<T>({ url: `${baseUrl}${path}`, method, headers: newApiHeaders(session()), body });

  async function login(username: string, password: string): Promise<NewApiSession> {
    const response = await input.http.requestResponse<unknown>({
      url: `${baseUrl}/api/user/login`, method: "POST", headers: JSON_HEADERS, body: { username, password },
    });
    const root = record(response.data);
    if (root.success === false) throw new UpstreamProtocolError("New API 登录失败", "auth");
    const data = dataRecord(response.data);
    const userId = stringField(data, "id", "user_id", "userId");
    const cookie = cookieHeader(response.headers["set-cookie"] ?? "");
    if (!userId || !cookie) throw new UpstreamProtocolError("New API 登录响应缺少 Cookie 或用户 ID", "auth");
    const authenticated: NewApiSession = {
      platform: "newapi", baseUrl, userId, cookie, tokenType: "Bearer", quotaPerUnit: DEFAULT_QUOTA_PER_UNIT,
    };
    const quotaPerUnit = await fetchNewApiQuotaPerUnit(input.http, authenticated);
    return { ...authenticated, quotaPerUnit };
  }

  async function verifyAdmin() {
    const current = await fetchCurrentUser();
    const role = numberField(current.raw, "role");
    if (role === null || role < 10) throw new UpstreamProtocolError("New API 用户不是管理员", "auth");
    return current;
  }

  async function fetchCurrentUser(): Promise<CurrentUser> {
    return parseCurrentUser(await request("GET", "/api/user/self"));
  }

  async function fetchStatus() {
    return dataRecord(await request("GET", "/api/status"));
  }

  async function fetchMetrics(range = todayUnixRange()): Promise<NewApiMetricsPayload> {
    const self = dataRecord(await request("GET", "/api/user/self"));
    const stat = await optionalRecord(() => request("GET", statPath(range.start, range.end)));
    const groups = await fetchGroupsRecord().catch(() => ({}));
    const pricing = await optionalRecord(() => request("GET", "/api/pricing"));
    return { self, stat, groups, pricing };
  }

  async function fetchGroupsRecord() {
    try {
      return record(await request("GET", "/api/user/self/groups"));
    } catch {
      return record(await request("GET", "/api/user/groups"));
    }
  }

  async function fetchAdminGroups() {
    const [groups, pricing] = await Promise.all([
      fetchGroupsRecord(), optionalRecord(() => request("GET", "/api/pricing")),
    ]);
    return parseNewApiGroups(groups, pricing);
  }

  async function fetchAdminAllGroups() {
    const payload = unwrapArray(await request("GET", "/api/group/"));
    const visibleGroups = await fetchAdminGroups().catch(() => []);
    if (!payload.length) return visibleGroups;
    const byName = new Map(visibleGroups.map((group) => [group.name, group]));
    return payload.map((item) => {
      const name = typeof item === "string" ? item.trim() : parseAdminGroup(item).name;
      return byName.get(name) ?? { id: name, name, platform: "newapi", status: "active", multiplier: null, raw: { name } };
    }).filter((group) => group.name);
  }

  async function fetchUsageStats(range: DateRange) {
    const timestamps = dateRangeToUnix(range);
    const payload = dataRecord(await request("GET", statPath(timestamps.start, timestamps.end)));
    return quotaAmount(payload, session().quotaPerUnit);
  }

  async function fetchGroupDailyStats(groups: readonly string[], range = todayUnixRange()) {
    const output: Array<{ groupName: string; amount: number }> = [];
    for (const groupName of groups.filter((name) => name && name !== "default")) {
      const path = `${statPath(range.start, range.end)}&group=${encodeURIComponent(groupName)}`;
      const payload = dataRecord(await request("GET", path));
      output.push({ groupName, amount: quotaAmount(payload, session().quotaPerUnit) });
    }
    return output;
  }

  async function listTokens(): Promise<readonly UpstreamKey[]> {
    return unwrapArray(await request("GET", `/api/token/?p=1&page_size=${PAGE_SIZE}`)).map(parseNewApiToken);
  }

  async function fetchKeyUsageToday(): Promise<readonly KeyUsageStat[]> {
    const tokens = await listPaged(
      (page) => request("GET", `/api/token/?p=${page}&page_size=${PAGE_SIZE}`),
      parseNewApiToken,
    );
    const range = todayUnixRange();
    const stats = await mapConcurrent(tokens.filter((token) => token.id && token.name), 4, async (token) => {
      let path = `${statPath(range.start, range.end)}&token_name=${encodeURIComponent(token.name)}`;
      if (token.groupName) path += `&group=${encodeURIComponent(token.groupName)}`;
      const amount = quotaAmount(dataRecord(await request("GET", path)), session().quotaPerUnit);
      return { keyId: token.id, keyName: token.name, groupName: token.groupName || "Ungrouped", amount };
    });
    return stats.filter((stat) => stat.amount > 0);
  }

  async function createToken(name: string, group: string) {
    await request("POST", "/api/token/", {
      name, remain_quota: 0, unlimited_quota: true, expired_time: -1,
      model_limits_enabled: false, model_limits: "", allow_ips: "", group, cross_group_retry: false,
    });
    const id = await findByName((page) => request("GET", `/api/token/?p=${page}&page_size=${PAGE_SIZE}`), name);
    return { id, key: await fetchTokenKey(id) };
  }

  async function fetchTokenKey(tokenId: string) {
    const key = stringField(dataRecord(await request("POST", `/api/token/${pathId(tokenId)}/key`)), "key");
    if (!key) throw new UpstreamProtocolError("New API Token key 响应无效", "invalid_response");
    return key;
  }

  async function deleteToken(tokenId: string) {
    await request("DELETE", `/api/token/${pathId(tokenId)}`);
  }

  async function listGroupChannels(groupName: string): Promise<readonly AdminTarget[]> {
    if (!groupName.trim()) return [];
    try {
      return await listPaged((page) => request("GET", `/api/channel/search?group=${encodeURIComponent(groupName)}&p=${page}&page_size=${PAGE_SIZE}`), parseNewApiChannel);
    } catch {
      const channels = await listPaged((page) => request("GET", `/api/channel/?p=${page}&page_size=${PAGE_SIZE}`), parseNewApiChannel);
      return channels.filter((channel) => channel.groupIds.includes(groupName.trim()));
    }
  }

  async function createChannel(channel: NewApiChannelCreate) {
    await request("POST", "/api/channel/", {
      mode: "single", multi_key_mode: "", batch_add_set_key_prefix_2_name: false,
      channel: {
        type: channel.channelType, key: channel.key, name: channel.name, base_url: channel.baseUrl,
        models: "", group: channel.groups.join(","), status: 1, weight: 0, priority: 0, auto_ban: 1,
        model_mapping: "", tag: "", setting: "", param_override: "", header_override: "",
      },
    });
    return findByName((page) => request("GET", `/api/channel/?p=${page}&page_size=${PAGE_SIZE}`), channel.name);
  }

  async function deleteChannel(channelId: string) {
    await request("DELETE", `/api/channel/${pathId(channelId)}`);
  }

  async function fetchChannelKey(channelId: string) {
    try {
      const key = stringField(dataRecord(await request("POST", `/api/channel/${pathId(channelId)}/key`)), "key");
      if (!key) throw new UpstreamProtocolError("New API Channel key 响应无效", "invalid_response");
      return key;
    } catch (error) {
      if (error instanceof HttpResponseError && (error.status === 401 || error.status === 403)) {
        throw new UpstreamProtocolError("New API 需要 root 权限或安全验证", "auth");
      }
      throw error;
    }
  }

  async function updateChannelWeightStatus(channelId: string, state: NewApiChannelState) {
    await updateChannel(channelId, state);
  }

  async function updateChannelPriority(channelId: string, priority: number) {
    await updateChannel(channelId, { priority });
  }

  async function updateChannel(channelId: string, patch: UpstreamRecord) {
    const original = dataRecord(await request("GET", `/api/channel/${pathId(channelId)}`));
    if (!Object.keys(original).length) throw new UpstreamProtocolError("New API Channel 详情响应无效", "invalid_response");
    const allowed = pick(original, [
      "id", "type", "key", "name", "base_url", "models", "group", "status", "weight", "priority",
      "auto_ban", "model_mapping", "tag", "setting", "param_override", "header_override",
    ]);
    const numericId = Number(channelId);
    await request("PUT", "/api/channel/", { id: Number.isSafeInteger(numericId) ? numericId : channelId, ...allowed, ...patch });
  }

  async function updateGroupRatio(groupName: string, multiplier: number) {
    const options = dataRecord(await request("GET", "/api/option/"));
    const raw = stringField(options, "GroupRatio") || "{}";
    let ratios: Record<string, number>;
    try {
      ratios = JSON.parse(raw) as Record<string, number>;
    } catch (error) {
      throw new UpstreamProtocolError(`New API GroupRatio 无效: ${String(error)}`, "invalid_response");
    }
    ratios[groupName] = multiplier;
    await request("PUT", "/api/option/", { key: "GroupRatio", value: JSON.stringify(ratios) });
  }

  async function listUsersPage(page = 1, pageSize = PAGE_SIZE) {
    return request("GET", `/api/user/?p=${positivePage(page)}&page_size=${positivePageSize(pageSize)}`);
  }

  async function fetchAdminSiteBalance(filter: BalanceFilter = { excludeAdmin: true }) {
    const users = await listPaged((page) => listUsersPage(page, PAGE_SIZE), record);
    return sumBalances(users, filter, (user) => {
      if (filter.excludeAdmin && (numberField(user, "role") ?? 0) >= 10) return null;
      const quota = numberField(user, "quota");
      return quota === null ? null : quota / session().quotaPerUnit;
    });
  }

  return {
    login, verifyAdmin, fetchCurrentUser, fetchStatus, fetchMetrics, fetchAdminGroups, fetchAdminAllGroups,
    fetchUsageStats, fetchGroupDailyStats, listTokens, fetchKeyUsageToday, createToken, fetchTokenKey, deleteToken,
    listGroupChannels, createChannel, deleteChannel, fetchChannelKey, updateChannelWeightStatus,
    updateChannelPriority, updateGroupRatio, listUsersPage, fetchAdminSiteBalance,
  };
}

export function createSub2ApiClient(input: ClientInput<Sub2ApiSession>) {
  const baseUrl = normalizeUpstreamUrl(input.baseUrl);
  const session = () => requireSub2ApiSession(input.session, baseUrl);
  const userRequest = <T = unknown>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: UpstreamRecord) =>
    input.http.request<T>({ url: `${baseUrl}${path}`, method, headers: sub2ApiUserHeaders(session()), body });
  const adminRequest = <T = unknown>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: UpstreamRecord) =>
    input.http.request<T>({ url: `${baseUrl}${path}`, method, headers: sub2ApiAdminHeaders(session()), body });

  async function login(email: string, password: string): Promise<Sub2ApiSession> {
    const data = dataRecord(await input.http.request({
      url: `${baseUrl}/api/v1/auth/login`, method: "POST", headers: JSON_HEADERS, body: { email, password },
    }));
    return parseSub2ApiSession(baseUrl, data);
  }

  async function refresh(): Promise<Sub2ApiSession> {
    const current = session();
    if (!current.refreshToken) return current;
    const data = dataRecord(await input.http.request({
      url: `${baseUrl}/api/v1/auth/refresh`, method: "POST", headers: JSON_HEADERS,
      body: { refresh_token: current.refreshToken },
    }));
    return parseSub2ApiSession(baseUrl, data, current);
  }

  async function verifyAdmin() {
    const current = session();
    if (current.adminApiKey) {
      await adminRequest("GET", `/api/v1/admin/groups?page=1&page_size=1`);
      return;
    }
    const user = await fetchCurrentUser();
    if (user.role.toLowerCase() !== "admin") throw new UpstreamProtocolError("Sub2API 用户不是管理员", "auth");
  }

  async function fetchCurrentUser(): Promise<CurrentUser> {
    return parseCurrentUser(await userRequest("GET", "/api/v1/auth/me"));
  }

  async function fetchMetrics(): Promise<Sub2ApiMetricsPayload> {
    const self = dataRecord(await userRequest("GET", "/api/v1/auth/me"));
    const usage = await optionalRecord(() => userRequest("GET", "/api/v1/usage/dashboard/stats"));
    const availableGroups = await optionalArray(() => userRequest("GET", "/api/v1/groups/available"));
    const groupRates = await optionalArray(() => userRequest("GET", "/api/v1/groups/rates"));
    return { self, usage, availableGroups, groupRates };
  }

  async function fetchAvailableGroups() {
    const available = await userRequest("GET", "/api/v1/groups/available");
    const rates = await userRequest("GET", "/api/v1/groups/rates").catch(() => ({}));
    return { available: unwrapArray(available), rates: unwrapArray(rates) };
  }

  async function fetchAdminGroups(): Promise<readonly AdminGroup[]> {
    return listPaged((page) => adminRequest("GET", `/api/v1/admin/groups?page=${page}&page_size=${PAGE_SIZE}`), parseAdminGroup);
  }

  async function fetchAdminUsageStats(range: DateRange) {
    return dataRecord(await adminRequest("GET", `/api/v1/admin/usage/stats?${dateRangeQuery(range)}`));
  }

  async function fetchAdminGroupUsageSummary() {
    return unwrapArray(await adminRequest("GET", "/api/v1/admin/groups/usage-summary"));
  }

  async function fetchAdminGroupDailyStats(range: DateRange) {
    return unwrapArray(await adminRequest("GET", `/api/v1/admin/dashboard/groups?${dateRangeQuery(range)}`));
  }

  async function fetchUsageStats(range: DateRange, apiKeyId?: string) {
    const params = new URLSearchParams({
      start_date: range.startDate, end_date: range.endDate, timezone: "Asia/Shanghai",
    });
    if (apiKeyId) params.set("api_key_id", apiKeyId);
    return dataRecord(await userRequest("GET", `/api/v1/usage/stats?${params}`));
  }

  async function fetchGroupDailyStats(range: DateRange) {
    try {
      const groups = session().adminApiKey
        ? await fetchAdminGroups()
        : (await fetchAvailableGroups()).available.map(parseAdminGroup);
      const names = new Map(groups.map((group) => [group.id, group.name]));
      const summary = await fetchAdminGroupUsageSummary();
      const result = summary.map((item) => {
        const raw = record(item);
        const groupId = stringField(raw, "group_id", "groupId");
        return { groupName: names.get(groupId) ?? "", amount: numberField(raw, "today_cost", "todayCost", "today_actual_cost", "todayActualCost") ?? 0 };
      }).filter((item) => item.groupName);
      if (result.length) return result;
    } catch {
      // Transit Hub falls through to per-key stats and finally the admin dashboard.
    }
    if (session().accessToken) {
      try {
        const keys = await listAllSub2ApiKeys(userRequest);
        const totals = new Map<string, number>();
        for (const key of keys) {
          if (!key.id || !key.groupName) continue;
          const usage = await fetchUsageStats(range, key.id);
          totals.set(key.groupName, (totals.get(key.groupName) ?? 0) + sub2ApiUsageCost(usage));
        }
        if (totals.size) return [...totals].map(([groupName, amount]) => ({ groupName, amount }));
      } catch {
        // Admin dashboard is the final supported fallback.
      }
    }
    return (await fetchAdminGroupDailyStats(range)).map((item) => {
      const raw = record(item);
      return {
        groupName: stringField(raw, "group_name", "groupName", "name"),
        amount: numberField(raw, "today_actual_cost", "todayActualCost", "actual_cost", "actualCost", "cost", "today_cost", "todayCost", "usage", "used") ?? 0,
      };
    }).filter((item) => item.groupName);
  }

  async function listKeys(): Promise<readonly UpstreamKey[]> {
    return unwrapArray(await userRequest("GET", `/api/v1/keys?page=1&page_size=${PAGE_SIZE}&sort_by=created_at&sort_order=desc`)).map(parseSub2ApiKey);
  }

  async function fetchKeyUsageToday(range: DateRange): Promise<readonly KeyUsageStat[]> {
    const keys = await listAllSub2ApiKeys(userRequest);
    const stats = await mapConcurrent(keys, 4, async (key) => ({
      keyId: key.id, keyName: key.name, groupName: key.groupName,
      amount: sub2ApiUsageCost(await fetchUsageStats(range, key.id)),
    }));
    return stats.filter((stat) => stat.amount > 0);
  }

  async function createKey(name: string, groupId: number) {
    const data = dataRecord(await userRequest("POST", "/api/v1/keys", { name, group_id: groupId }));
    const id = idField(data);
    const key = stringField(data, "key", "token", "api_key", "apiKey");
    if (!key) throw new UpstreamProtocolError("Sub2API Key 创建响应无效", "invalid_response");
    return { id, key };
  }

  async function deleteKey(keyId: string) {
    await userRequest("DELETE", `/api/v1/keys/${pathId(keyId)}`);
  }

  async function listGroupAccounts(groupId: string): Promise<readonly AdminTarget[]> {
    if (!groupId.trim()) return [];
    return listPaged((page) => adminRequest("GET", `/api/v1/admin/accounts?group=${encodeURIComponent(groupId)}&page=${page}&page_size=${PAGE_SIZE}`), parseSub2ApiAccount);
  }

  async function createAdminAccount(payload: UpstreamRecord) {
    return idField(dataRecord(await adminRequest("POST", "/api/v1/admin/accounts", payload)));
  }

  async function deleteAdminAccount(accountId: string) {
    await adminRequest("DELETE", `/api/v1/admin/accounts/${pathId(accountId)}`);
  }

  async function exportAdminAccount(accountId: string) {
    return adminRequest("GET", `/api/v1/admin/accounts/data?ids=${encodeURIComponent(accountId)}&include_proxies=false`);
  }

  async function updateAdminAccount(accountId: string, patch: Sub2ApiAccountBulkUpdate) {
    const id = Number(accountId);
    if (!Number.isSafeInteger(id) || id <= 0) throw new UpstreamProtocolError("Sub2API 账号 ID 无效", "invalid_response");
    try {
      await adminRequest("POST", "/api/v1/admin/accounts/bulk-update", { account_ids: [id], ...patch });
    } catch (error) {
      if (error instanceof HttpResponseError && [404, 405, 501].includes(error.status)) {
        throw new UpstreamProtocolError("Sub2API 版本不支持账号字段级批量更新", "unsupported");
      }
      throw error;
    }
  }

  async function updateAdminGroupMultiplier(groupId: string, multiplier: number) {
    const path = `/api/v1/admin/groups/${pathId(groupId)}`;
    const original = dataRecord(await adminRequest("GET", path));
    const payload = { ...pick(original, ["name", "description", "platform", "is_exclusive", "status", "subscription_type"]), rate_multiplier: multiplier };
    await adminRequest("PUT", path, payload);
  }

  async function fetchAdminUserBreakdown(query: Sub2ApiUserBreakdownQuery) {
    const params = new URLSearchParams({
      start_date: query.startDate, end_date: query.endDate,
      sort_by: query.sortBy ?? "actual_cost", limit: String(query.limit ?? 100), timezone: query.timezone ?? "UTC",
    });
    return adminRequest("GET", `/api/v1/admin/dashboard/user-breakdown?${params}`);
  }

  async function fetchAdminUsersPage(query: Sub2ApiAdminUsersQuery = {}) {
    const params = new URLSearchParams({
      page: String(positivePage(query.page ?? 1)), page_size: String(positivePageSize(query.pageSize ?? PAGE_SIZE)),
      sort_by: query.sortBy ?? "created_at", sort_order: query.sortOrder ?? "desc", timezone: query.timezone ?? "UTC",
    });
    if (query.status) params.set("status", query.status);
    if (query.role) params.set("role", query.role);
    if (query.search) params.set("search", query.search);
    return adminRequest("GET", `/api/v1/admin/users?${params}`);
  }

  async function fetchAdminSiteBalance(filter: BalanceFilter = { excludeAdmin: true }) {
    const users = await listPaged(
      (page) => adminRequest("GET", `/api/v1/admin/users?page=${page}&page_size=${PAGE_SIZE}`),
      record,
    );
    return sumBalances(users, filter, (user) => {
      if (filter.excludeAdmin && stringField(user, "role").toLowerCase() === "admin") return null;
      return numberField(user, "balance");
    });
  }

  async function fetchAdminUser(userId: string) {
    return dataRecord(await adminRequest("GET", `/api/v1/admin/users/${pathId(userId)}`));
  }

  async function fetchAdminUserBalanceHistory(userId: string, page = 1, pageSize = PAGE_SIZE, codeType = "") {
    const params = new URLSearchParams({ page: String(positivePage(page)), page_size: String(positivePageSize(pageSize)) });
    if (codeType) params.set("type", codeType);
    return adminRequest("GET", `/api/v1/admin/users/${pathId(userId)}/balance-history?${params}`);
  }

  return {
    login, refresh, verifyAdmin, fetchCurrentUser, fetchMetrics, fetchAvailableGroups, fetchAdminGroups,
    fetchAdminUsageStats, fetchAdminGroupUsageSummary, fetchAdminGroupDailyStats, fetchUsageStats,
    fetchGroupDailyStats, listKeys, fetchKeyUsageToday, createKey, deleteKey,
    listGroupAccounts, createAdminAccount, deleteAdminAccount, exportAdminAccount, updateAdminAccount,
    updateAdminGroupMultiplier, fetchAdminUserBreakdown, fetchAdminUsersPage, fetchAdminUser,
    fetchAdminUserBalanceHistory, fetchAdminSiteBalance,
  };
}

export function newApiSessionFromKey(baseUrl: string, userId: string, accessToken: string): NewApiSession {
  if (!userId.trim() || !accessToken.trim()) throw new UpstreamProtocolError("New API 用户 ID 和访问令牌不能为空", "auth");
  return {
    platform: "newapi", baseUrl: normalizeUpstreamUrl(baseUrl), userId: userId.trim(), accessToken: accessToken.trim(),
    tokenType: "Bearer", quotaPerUnit: DEFAULT_QUOTA_PER_UNIT,
  };
}

export function sub2ApiSessionFromAdminKey(baseUrl: string, adminApiKey: string): Sub2ApiSession {
  if (!adminApiKey.trim()) throw new UpstreamProtocolError("Sub2API Admin API Key 不能为空", "auth");
  return { platform: "sub2api", baseUrl: normalizeUpstreamUrl(baseUrl), adminApiKey: adminApiKey.trim(), tokenType: "Bearer" };
}

export function sub2ApiSessionFromToken(
  baseUrl: string,
  input: { readonly accessToken?: string; readonly refreshToken?: string; readonly tokenType?: string; readonly expiresAt?: number },
): Sub2ApiSession {
  const accessToken = input.accessToken?.trim();
  const refreshToken = input.refreshToken?.trim();
  if (!accessToken && !refreshToken) throw new UpstreamProtocolError("Sub2API Access/Refresh Token 不能同时为空", "auth");
  return {
    platform: "sub2api", baseUrl: normalizeUpstreamUrl(baseUrl), accessToken, refreshToken,
    tokenType: input.tokenType?.trim() || "Bearer", expiresAt: input.expiresAt,
  };
}

async function fetchNewApiQuotaPerUnit(http: JsonResponseHttpClient, session: NewApiSession) {
  try {
    const payload = dataRecord(await http.request({
      url: `${session.baseUrl}/api/status`, method: "GET", headers: newApiHeaders(session),
    }));
    const value = numberField(payload, "quota_per_unit", "quotaPerUnit");
    return value !== null && value > 0 ? value : DEFAULT_QUOTA_PER_UNIT;
  } catch {
    return DEFAULT_QUOTA_PER_UNIT;
  }
}

function requireNewApiSession(value: NewApiSession | undefined, baseUrl: string) {
  if (!value || value.platform !== "newapi" || value.baseUrl !== baseUrl || !value.userId || (!value.cookie && !value.accessToken)) {
    throw new UpstreamProtocolError("New API 会话无效", "auth");
  }
  return value;
}

function requireSub2ApiSession(value: Sub2ApiSession | undefined, baseUrl: string) {
  if (!value || value.platform !== "sub2api" || value.baseUrl !== baseUrl || (!value.accessToken && !value.adminApiKey && !value.refreshToken)) {
    throw new UpstreamProtocolError("Sub2API 会话无效", "auth");
  }
  return value;
}

function newApiHeaders(session: NewApiSession) {
  return compactHeaders({
    ...JSON_HEADERS, cookie: session.cookie, "new-api-user": session.userId,
    authorization: session.accessToken ? `${session.tokenType || "Bearer"} ${session.accessToken}` : undefined,
  });
}

function sub2ApiUserHeaders(session: Sub2ApiSession) {
  if (!session.accessToken) throw new UpstreamProtocolError("Sub2API 用户接口需要 Access Token", "auth");
  return { ...JSON_HEADERS, authorization: `${session.tokenType || "Bearer"} ${session.accessToken}` };
}

function sub2ApiAdminHeaders(session: Sub2ApiSession) {
  if (session.adminApiKey) return { ...JSON_HEADERS, "x-api-key": session.adminApiKey };
  return sub2ApiUserHeaders(session);
}

function parseSub2ApiSession(baseUrl: string, data: UpstreamRecord, previous?: Sub2ApiSession): Sub2ApiSession {
  const accessToken = stringField(data, "access_token", "accessToken");
  if (!accessToken) throw new UpstreamProtocolError("Sub2API 登录/刷新响应缺少 Access Token", "auth");
  const expiresIn = numberField(data, "expires_in", "expiresIn");
  return {
    platform: "sub2api", baseUrl, accessToken,
    refreshToken: stringField(data, "refresh_token", "refreshToken") || previous?.refreshToken,
    tokenType: stringField(data, "token_type", "tokenType") || previous?.tokenType || "Bearer",
    expiresAt: expiresIn === null ? previous?.expiresAt : Date.now() + expiresIn * 1_000,
  };
}

function parseCurrentUser(payload: unknown): CurrentUser {
  const raw = dataRecord(payload);
  const id = idField(raw);
  if (!id) throw new UpstreamProtocolError("当前用户响应缺少用户 ID", "invalid_response");
  return {
    id,
    email: stringField(raw, "email"),
    role: stringField(raw, "role"),
    balance: numberField(raw, "balance"),
    raw,
  };
}

function parseAdminGroup(value: unknown): AdminGroup {
  const raw = record(value);
  return {
    id: idField(raw), name: stringField(raw, "name"), platform: stringField(raw, "platform"),
    status: stringField(raw, "status"), multiplier: numberField(raw, "rate_multiplier", "multiplier"), raw,
  };
}

function parseSub2ApiKey(value: unknown): UpstreamKey {
  const raw = record(value);
  const group = record(raw.group);
  return {
    id: idField(raw), key: stringField(raw, "key", "token", "api_key"), name: stringField(raw, "name"),
    groupId: stringField(raw, "group_id"), groupName: stringField(group, "name"), status: stringField(raw, "status"), raw,
  };
}

function parseNewApiToken(value: unknown): UpstreamKey {
  const raw = record(value);
  const group = stringField(raw, "group");
  return {
    id: idField(raw), key: stringField(raw, "key"), name: stringField(raw, "name"), groupId: group,
    groupName: group, status: stringField(raw, "status"), raw,
  };
}

function parseSub2ApiAccount(value: unknown): AdminTarget {
  const raw = record(value);
  return {
    id: idField(raw), name: stringField(raw, "name"), type: stringField(raw, "type"),
    platform: stringField(raw, "platform"), status: stringField(raw, "status"), priority: numberField(raw, "priority"),
    weight: null, concurrency: numberField(raw, "concurrency"), rateMultiplier: numberField(raw, "rate_multiplier", "rateMultiplier"),
    loadFactor: numberField(raw, "load_factor", "loadFactor"), models: stringField(raw, "models"),
    groupIds: stringList(raw.group_ids ?? raw.groupIds), schedulable: booleanField(raw, "schedulable"), baseUrl: "",
  };
}

function parseNewApiChannel(value: unknown): AdminTarget {
  const raw = record(value);
  return {
    id: idField(raw), name: stringField(raw, "name"), type: stringField(raw, "type"), platform: "newapi",
    status: stringField(raw, "status"), priority: numberField(raw, "priority"), weight: numberField(raw, "weight"),
    concurrency: null, rateMultiplier: null, loadFactor: null, models: stringField(raw, "models"),
    groupIds: stringList(raw.group), schedulable: null, baseUrl: stringField(raw, "base_url", "baseUrl"),
  };
}

function parseNewApiGroups(groupsPayload: UpstreamRecord, pricingPayload: UpstreamRecord) {
  const groups = record(groupsPayload.data ?? groupsPayload);
  const pricing = record(pricingPayload.data ?? pricingPayload);
  const ratios = record(pricing.group_ratio ?? groups.group_ratio ?? groups);
  const names = record(pricing.usable_group ?? groups.usable_group);
  const keys = new Set([...Object.keys(ratios), ...Object.keys(names)]);
  return [...keys].map((id) => ({
    id, name: id, platform: "newapi", status: "",
    multiplier: numberValue(ratios[id]), raw: { id, description: names[id], multiplier: ratios[id] },
  } satisfies AdminGroup));
}

async function listPaged<T>(fetchPage: (page: number) => Promise<unknown>, parse: (value: unknown) => T) {
  const output: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const payload = await fetchPage(page);
    const items = unwrapArray(payload);
    output.push(...items.map(parse));
    const total = paginationTotal(payload);
    if (!items.length || (total !== null ? page * PAGE_SIZE >= total : items.length < PAGE_SIZE)) break;
  }
  return output;
}

async function findByName(fetchPage: (page: number) => Promise<unknown>, name: string) {
  for (let page = 1; page <= 10; page += 1) {
    const payload = await fetchPage(page);
    const items = unwrapArray(payload);
    const match = items.map(record).find((item) => stringField(item, "name") === name);
    if (match) {
      const id = idField(match);
      if (id) return id;
    }
    const total = paginationTotal(payload);
    if (!items.length || (total !== null && page * PAGE_SIZE >= total)) break;
  }
  throw new UpstreamProtocolError(`无法回查新建资源: ${name}`, "invalid_response");
}

async function listAllSub2ApiKeys(request: RemoteRequester) {
  return listPaged(
    (page) => request("GET", `/api/v1/keys?page=${page}&page_size=${PAGE_SIZE}&sort_by=created_at&sort_order=desc`),
    parseSub2ApiKey,
  );
}

function sub2ApiUsageCost(value: UpstreamRecord) {
  return numberField(value, "total_actual_cost", "totalActualCost", "actual_cost", "actualCost", "cost") ?? 0;
}

function sumBalances(
  users: readonly UpstreamRecord[],
  filter: BalanceFilter,
  balance: (user: UpstreamRecord) => number | null,
) {
  const excluded = filter.excludeBalances ?? [];
  return users.reduce((total, user) => {
    const value = balance(user);
    if (value === null || excluded.some((candidate) => Math.abs(candidate - value) < 1e-9)) return total;
    return total + value;
  }, 0);
}

async function mapConcurrent<T, R>(items: readonly T[], concurrency: number, task: (item: T) => Promise<R>) {
  const output = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await task(items[index]!);
    }
  }));
  return output;
}

function dataRecord(value: unknown) {
  const root = record(value);
  return record("data" in root ? root.data : root);
}

function unwrapArray(value: unknown): unknown[] {
  const root = record(value);
  const data = "data" in root ? root.data : value;
  if (Array.isArray(data)) return data;
  const nested = record(data);
  for (const key of ["items", "list", "users", "groups", "tokens", "channels", "accounts", "history"]) {
    if (Array.isArray(nested[key])) return nested[key] as unknown[];
  }
  return [];
}

function paginationTotal(value: unknown) {
  const root = record(value);
  const data = record(root.data);
  return numberField(root, "total") ?? numberField(data, "total");
}

function record(value: unknown): UpstreamRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UpstreamRecord : {};
}

function idField(value: UpstreamRecord) {
  return stringField(value, "id", "user_id", "userId");
}

function stringField(value: UpstreamRecord, ...keys: string[]) {
  for (const key of keys) {
    const item = value[key];
    if (typeof item === "string" && item.trim()) return item.trim();
    if (typeof item === "number" && Number.isFinite(item)) return String(item);
  }
  return "";
}

function numberField(value: UpstreamRecord, ...keys: string[]) {
  for (const key of keys) {
    const parsed = numberValue(value[key]);
    if (parsed !== null) return parsed;
  }
  return null;
}

function numberValue(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function booleanField(value: UpstreamRecord, key: string) {
  return typeof value[key] === "boolean" ? value[key] as boolean : null;
}

function stringList(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return typeof value === "string" ? value.split(",").map((item) => item.trim()).filter(Boolean) : [];
}

function pick(value: UpstreamRecord, keys: readonly string[]) {
  return Object.fromEntries(keys.filter((key) => key in value).map((key) => [key, value[key]]));
}

function compactHeaders(value: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => Boolean(entry[1])));
}

function cookieHeader(setCookie: string) {
  return setCookie.split(/\n|,(?=[^;,]+=)/).map((cookie) => cookie.split(";", 1)[0]?.trim()).filter(Boolean).join("; ");
}

function pathId(value: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new UpstreamProtocolError("上游资源 ID 不能为空", "invalid_response");
  return encodeURIComponent(trimmed);
}

function positivePage(value: number) {
  return Number.isSafeInteger(value) && value > 0 ? value : 1;
}

function positivePageSize(value: number) {
  return Number.isSafeInteger(value) && value > 0 ? Math.min(value, 1_000) : PAGE_SIZE;
}

function todayUnixRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1_000;
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() / 1_000 - 1;
  return { start: Math.floor(start), end: Math.floor(end) };
}

function dateRangeToUnix(range: DateRange) {
  const start = new Date(`${range.startDate}T00:00:00`).getTime();
  const end = new Date(`${range.endDate}T23:59:59`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) throw new UpstreamProtocolError("日期范围无效", "invalid_response");
  return { start: Math.floor(start / 1_000), end: Math.floor(end / 1_000) };
}

function statPath(start: number, end: number) {
  return `/api/log/self/stat?type=2&start_timestamp=${start}&end_timestamp=${end}`;
}

function dateRangeQuery(range: DateRange) {
  return new URLSearchParams({ start_date: range.startDate, end_date: range.endDate }).toString();
}

function quotaAmount(value: UpstreamRecord, quotaPerUnit: number) {
  return (numberField(value, "quota", "used_quota", "usedQuota") ?? 0) / (quotaPerUnit > 0 ? quotaPerUnit : DEFAULT_QUOTA_PER_UNIT);
}

async function optionalRecord(fetcher: () => Promise<unknown>) {
  try { return dataRecord(await fetcher()); } catch { return {}; }
}

async function optionalArray(fetcher: () => Promise<unknown>) {
  try { return unwrapArray(await fetcher()).map(record); } catch { return []; }
}
