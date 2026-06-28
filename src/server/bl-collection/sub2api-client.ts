import { safeJsonString } from "@/lib/utils";
import { requestText } from "@/server/http";
import type { BlCollectorClient, BlTokenPayload } from "@/server/bl-collection/types";

type Payload = Record<string, unknown> & { code?: number; message?: unknown; data?: unknown };

export class BlSub2ApiClient implements BlCollectorClient {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 25_000,
    private readonly proxyUrl?: string,
  ) {}

  login(email: string, password: string) {
    return this.requestAndExpect<BlTokenPayload>("POST", "/auth/login", undefined, { email, password }, "登录失败");
  }

  refresh(refreshToken: string) {
    return this.requestAndExpect<BlTokenPayload>(
      "POST",
      "/auth/refresh",
      undefined,
      { refresh_token: refreshToken },
      "刷新 token 失败",
    );
  }

  groupsAvailable(accessToken: string) {
    return this.requestAndExpect<unknown[]>("GET", "/groups/available", accessToken, undefined, "获取分组失败");
  }

  async authMe(accessToken: string) {
    const data = await this.requestAndExpect<Record<string, unknown>>(
      "GET",
      "/auth/me",
      accessToken,
      undefined,
      "获取账户信息失败",
    );
    return data && typeof data === "object" ? data : {};
  }

  async groupRates(accessToken: string) {
    const data = await this.requestAndExpect<Record<string, unknown>>(
      "GET",
      "/groups/rates",
      accessToken,
      undefined,
      "获取专属倍率失败",
    );
    return data && typeof data === "object" ? data : {};
  }

  async channelsAvailable(accessToken: string) {
    const payload = await this.request("GET", "/channels/available", accessToken, undefined, [404]);
    if (payload._http_status === 404) return [];
    const data = this.expectData(payload, "获取模型定价失败");
    return Array.isArray(data) ? data : [];
  }

  private async requestAndExpect<T>(
    method: string,
    path: string,
    accessToken?: string,
    body?: Record<string, unknown>,
    fallback = "接口请求失败",
  ) {
    const payload = await this.request(method, path, accessToken, body);
    return this.expectData(payload, fallback) as T;
  }

  private async request(
    method: string,
    path: string,
    accessToken?: string,
    body?: Record<string, unknown>,
    allowedStatus: number[] = [],
  ): Promise<Payload> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    if (body) headers["Content-Type"] = "application/json";

    const { status, body: raw } = await requestText({
      method,
      url: `${this.baseUrl.replace(/\/+$/, "")}/api/v1${path}`,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      timeoutMs: this.timeoutMs,
      proxyUrl: this.proxyUrl,
    });

    if (![200, ...allowedStatus].includes(status)) {
      throw new Error(`接口返回 HTTP ${status}: ${raw.slice(0, 200)}`);
    }
    if (!raw.trim()) return { _http_status: status, code: 0, data: [] };
    const payload = JSON.parse(raw) as Payload;
    payload._http_status = status;
    return payload;
  }

  private expectData(payload: Payload, fallback: string) {
    if (Number(payload.code ?? 0) !== 0) {
      const message = safeJsonString(payload.message || fallback);
      const lower = `${message} ${JSON.stringify(payload)}`.toLowerCase();
      if (lower.includes("2fa") || lower.includes("two")) {
        throw new Error("目标账号开启了 2FA，无法自动登录，请切换为手动 Token");
      }
      throw new Error(message || fallback);
    }
    return payload.data ?? [];
  }
}
