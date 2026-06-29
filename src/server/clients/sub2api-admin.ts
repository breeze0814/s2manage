import { requestText } from "@/server/http";
import { normalizeRateMultiplier } from "@/server/rates";
import {
  normalizeAccountModels,
  normalizeDataPayload,
  normalizeUserSearchResult,
  parseAccountTestJson,
  parseAccountTestSse,
  unwrapEnvelope,
  unwrapList,
} from "@/server/clients/sub2api-admin-format";
import type {
  Sub2ApiAccountTestResult,
  Sub2ApiAccountWrite,
  Sub2ApiGroup,
  Sub2ApiGroupWrite,
  Sub2ApiRedeemCode,
  Sub2ApiRedeemCodeGenerateInput,
  Sub2ApiUserSearchInput,
  Sub2ApiUserSearchResult,
  UserRateMultiplierEntry,
} from "@/server/clients/sub2api-admin-types";

export type {
  Sub2ApiAccountModel,
  Sub2ApiAccountTestResult,
  Sub2ApiAccountWrite,
  Sub2ApiDataAccount,
  Sub2ApiDataPayload,
  Sub2ApiGroup,
  Sub2ApiGroupWrite,
  Sub2ApiRedeemCode,
  Sub2ApiRedeemCodeGenerateInput,
  Sub2ApiUser,
  Sub2ApiUserSearchInput,
  Sub2ApiUserSearchResult,
  UserRateMultiplierEntry,
} from "@/server/clients/sub2api-admin-types";

function buildListQuery(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value));
  }
  return query.toString();
}

function buildUrlPath(path: string) {
  return path.startsWith("/") ? path : `/${path}`;
}

export class Sub2ApiAdminClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly timeoutMs = 25_000,
  ) {}

  private adminUrl(path: string) {
    return `${this.baseUrl.replace(/\/+$/, "")}/api/v1/admin${buildUrlPath(path)}`;
  }

  private requestHeaders(accept = "application/json") {
    return { "x-api-key": this.apiKey, "Content-Type": "application/json; charset=utf-8", Accept: accept };
  }

  private async request<T = unknown>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
    const { status, body: raw } = await requestText({
      method,
      url: this.adminUrl(path),
      headers: this.requestHeaders(),
      body: body ? JSON.stringify(body) : undefined,
      timeoutMs: this.timeoutMs,
    });
    if (status < 200 || status >= 300) throw new Error(`HTTP ${status}: ${raw.slice(0, 200)}`);
    if (!raw.trim()) return [] as unknown as T;
    return unwrapEnvelope<T>(JSON.parse(raw));
  }

  async testConnection() {
    return this.listGroups();
  }

  async exportAccountsData(accountIds: number[]) {
    const ids = accountIds.filter((id) => Number.isInteger(id) && id > 0);
    const query = new URLSearchParams();
    if (ids.length > 0) query.set("ids", ids.join(","));
    query.set("include_proxies", "false");
    return normalizeDataPayload(await this.request<unknown>("GET", `/accounts/data?${query.toString()}`));
  }

  async searchUsers(input: Sub2ApiUserSearchInput = {}): Promise<Sub2ApiUserSearchResult> {
    const query = buildListQuery({
      page: input.page ?? 1,
      page_size: input.pageSize ?? 50,
      status: input.status ?? "",
      role: input.role ?? "",
      search: input.search ?? "",
    });
    return normalizeUserSearchResult(await this.request<unknown>("GET", `/users?${query}`));
  }

  async generateRedeemCodes(input: Sub2ApiRedeemCodeGenerateInput): Promise<Sub2ApiRedeemCode[]> {
    const payload = await this.request<unknown>("POST", "/redeem-codes/generate", input);
    return unwrapList<Sub2ApiRedeemCode>(payload, "redeem codes");
  }

  async listGroups() {
    return this.request<Sub2ApiGroup[]>("GET", "/groups/all");
  }
  async getGroup(groupId: number) {
    return this.request<Sub2ApiGroup>("GET", `/groups/${groupId}`);
  }
  async createGroup(data: Sub2ApiGroupWrite & { name: string; rate_multiplier: number }) {
    return this.request<Sub2ApiGroup>("POST", "/groups", { ...data, rate_multiplier: normalizeRateMultiplier(data.rate_multiplier) });
  }
  async updateGroup(groupId: number, data: Sub2ApiGroupWrite) {
    return this.request<Sub2ApiGroup>("PUT", `/groups/${groupId}`, data.rate_multiplier === undefined ? data : { ...data, rate_multiplier: normalizeRateMultiplier(data.rate_multiplier) });
  }
  async deleteGroup(groupId: number) {
    return this.request<{ message?: string }>("DELETE", `/groups/${groupId}`);
  }
  async updateGroupRateMultiplier(groupId: number, rateMultiplier: number) {
    return this.updateGroup(groupId, { rate_multiplier: normalizeRateMultiplier(rateMultiplier) });
  }
  async getRateMultipliers(groupId: number) {
    return this.request<UserRateMultiplierEntry[]>("GET", `/groups/${groupId}/rate-multipliers`);
  }
  async setRateMultipliers(groupId: number, entries: Array<{ user_id: number; rate_multiplier: number }>) {
    return this.request("PUT", `/groups/${groupId}/rate-multipliers`, { entries: entries.map((entry) => ({ ...entry, rate_multiplier: normalizeRateMultiplier(entry.rate_multiplier) })) });
  }
  async clearRateMultipliers(groupId: number) {
    return this.request("DELETE", `/groups/${groupId}/rate-multipliers`);
  }

  async listAccounts() {
    return unwrapList<unknown>(await this.request<unknown>("GET", "/accounts?page=1&page_size=1000"), "accounts");
  }
  async createAccount(data: Sub2ApiAccountWrite & { name: string; platform: string; type: string; credentials: Record<string, unknown> }) {
    return this.request("POST", "/accounts", data);
  }
  async updateAccount(accountId: number, data: Sub2ApiAccountWrite) {
    return this.request("PUT", `/accounts/${accountId}`, data);
  }
  async deleteAccount(accountId: number) {
    return this.request<{ message?: string }>("DELETE", `/accounts/${accountId}`);
  }
  async updateAccountGroups(accountId: number, groupIds: number[]) {
    return this.updateAccount(accountId, { group_ids: groupIds });
  }
  async setSchedulable(accountId: number, schedulable: boolean) {
    return this.request("POST", `/accounts/${accountId}/schedulable`, { schedulable });
  }
  async clearError(accountId: number) {
    return this.request("POST", `/accounts/${accountId}/clear-error`);
  }
  async refreshAccount(accountId: number) {
    return this.request("POST", `/accounts/${accountId}/refresh`);
  }
  async getAvailableModels(accountId: number) {
    return normalizeAccountModels(await this.request<unknown>("GET", `/accounts/${accountId}/models`));
  }
  async testAccount(accountId: number, data: { model_id?: string; prompt?: string; mode?: string; timeoutMs?: number } = {}) {
    const startedAt = Date.now();
    const { timeoutMs, ...requestData } = data;
    const body = Object.fromEntries(Object.entries(requestData).filter(([, value]) => value !== undefined && value !== ""));
    const { status, body: raw } = await requestText({
      method: "POST",
      url: this.adminUrl(`/accounts/${accountId}/test`),
      headers: this.requestHeaders("text/event-stream, application/json"),
      body: JSON.stringify(body),
      timeoutMs: timeoutMs ?? Math.max(this.timeoutMs, 120_000),
    });
    const latencyMs = Date.now() - startedAt;
    if (status < 200 || status >= 300) throw new Error(`HTTP ${status}: ${raw.slice(0, 500)}`);

    const trimmed = raw.trim();
    if (!trimmed) return { success: false, message: "测试接口未返回内容", latency_ms: latencyMs } satisfies Sub2ApiAccountTestResult;
    if (trimmed.startsWith("{")) {
      const jsonResult = parseAccountTestJson(trimmed, latencyMs);
      if (jsonResult) return jsonResult;
    }
    return parseAccountTestSse(raw, latencyMs);
  }

  async getAccountUsage(accountId: number, source: "passive" | "active" = "passive", force = false) {
    const query = new URLSearchParams({ source });
    if (force) query.set("force", "true");
    return this.request<Record<string, unknown>>("GET", `/accounts/${accountId}/usage?${query.toString()}`);
  }

  async listAnnouncements() {
    return unwrapList<unknown>(await this.request<unknown>("GET", "/announcements?page=1&page_size=1000"), "announcements");
  }
  async getAnnouncement(id: number) {
    return this.request("GET", `/announcements/${id}`);
  }
  async createAnnouncement(data: { title: string; content: string } & Record<string, unknown>) {
    return this.request("POST", "/announcements", data);
  }
  async updateAnnouncement(id: number, data: Record<string, unknown>) {
    return this.request("PUT", `/announcements/${id}`, data);
  }
  async deleteAnnouncement(id: number) {
    return this.request("DELETE", `/announcements/${id}`);
  }

  async getSettings() {
    return this.request<Record<string, unknown>>("GET", "/settings");
  }
  async updateSettings(data: Record<string, unknown>) {
    return this.request("PUT", "/settings", data);
  }

  async rawRequest(method: string, path: string, body?: Record<string, unknown>) {
    return this.request(method, path, body);
  }
}
