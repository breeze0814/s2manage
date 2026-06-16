import { safeJsonString } from "@/lib/utils";
import { requestText } from "@/server/http";
import type { BlCollectorClient, BlTokenPayload } from "@/server/bl-collection/types";

type NewApiPricing = Record<string, unknown>;

export class BlNewApiClient implements BlCollectorClient {
  private pricingCache?: NewApiPricing;

  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 25_000,
  ) {}

  async login(username: string, password: string): Promise<BlTokenPayload> {
    if (!username && !password) {
      return { access_token: "public", refresh_token: "", expires_in: 0 };
    }

    const { status, body: raw } = await requestText({
      method: "POST",
      url: `${this.baseUrl.replace(/\/+$/, "")}/api/user/login`,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ username, password }),
      timeoutMs: this.timeoutMs,
    });

    if (status === 401 || status === 403) {
      throw new Error("登录失败 HTTP 401: 账号密码错误或账号已被禁用");
    }
    if (status !== 200) {
      throw new Error(`登录失败 HTTP ${status}${raw ? ": " + raw.slice(0, 200) : ""}`);
    }

    const body = JSON.parse(raw) as Record<string, unknown>;
    if (body.success !== true) {
      throw new Error(safeJsonString(body.message) || "登录失败，请检查账号密码");
    }

    const data = body.data && typeof body.data === "object" ? (body.data as Record<string, unknown>) : null;
    const token = data ? (data.token || data.access_token) : undefined;
    if (token) {
      return { access_token: "session:" + String(token), refresh_token: "", expires_in: 3600 };
    }

    throw new Error("登录响应缺少 session token，请检查站点配置");
  }

  async refresh(): Promise<BlTokenPayload> {
    throw new Error("New API session 过期，将自动重新登录");
  }

  async groupsAvailable(accessToken: string) {
    const pricing = await this.pricing(accessToken);
    const groupRatio = asRecord(pricing.group_ratio);
    const usableGroup = asRecord(pricing.usable_group);
    const autoGroups = Array.isArray(pricing.auto_groups) ? pricing.auto_groups.map(String) : [];

    return Object.entries(groupRatio).map(([id, ratio]) => ({
      id,
      name: safeJsonString(usableGroup[id] || id),
      platform: "new-api",
      subscription_type: autoGroups.includes(id) ? "auto_group" : "user_group",
      is_exclusive: false,
      rate_multiplier: floatOrNull(ratio),
    }));
  }

  async groupRates() {
    return {};
  }

  async channelsAvailable(accessToken: string) {
    const pricing = await this.pricing(accessToken);
    const models = Array.isArray(pricing.data) ? pricing.data : [];
    const vendors = Array.isArray(pricing.vendors) ? pricing.vendors : [];
    const vendorMap = new Map<string, string>();

    for (const item of vendors) {
      if (!item || typeof item !== "object") continue;
      const vendor = item as Record<string, unknown>;
      const id = safeJsonString(vendor.id);
      if (id) vendorMap.set(id, safeJsonString(vendor.name || `Vendor #${id}`));
    }

    const grouped = new Map<string, { name: string; platforms: Array<{ platform: string; supported_models: unknown[] }> }>();
    for (const item of models) {
      if (!item || typeof item !== "object") continue;
      const model = item as Record<string, unknown>;
      const name = safeJsonString(model.model_name);
      if (!name) continue;
      const vendorId = safeJsonString(model.vendor_id || "0");
      const vendorName = vendorMap.get(vendorId) ?? (vendorId && vendorId !== "0" ? `Vendor #${vendorId}` : "New API");
      const current = grouped.get(vendorName) ?? {
        name: vendorName,
        platforms: [{ platform: vendorName, supported_models: [] }],
      };
      const quotaType = safeJsonString(model.quota_type);
      const billingMode = quotaType === "1" ? "price" : quotaType === "0" ? "ratio" : "";
      const groups = Array.isArray(model.enable_groups)
        ? model.enable_groups
        : Array.isArray(model.enable_group)
          ? model.enable_group
          : [];
      const description =
        safeJsonString(model.description).trim() || (groups.length ? `可用分组: ${groups.map(String).join(", ")}` : "");

      current.platforms[0]?.supported_models.push({
        name,
        platform: vendorName,
        pricing: {
          billing_mode: billingMode,
          input_price: null,
          output_price: null,
          cache_write_price: floatOrNull(model.cache_ratio),
          cache_read_price: null,
          image_output_price: null,
          per_request_price: null,
          model_ratio: floatOrNull(model.model_ratio),
          completion_ratio: floatOrNull(model.completion_ratio),
          model_price: floatOrNull(model.model_price),
          quota_type: quotaType,
          vendor_name: vendorName,
          description,
        },
      });
      grouped.set(vendorName, current);
    }

    return [...grouped.values()];
  }

  private async pricing(accessToken: string) {
    if (this.pricingCache) return this.pricingCache;

    const headers: Record<string, string> = { Accept: "application/json" };
    const [token, userId] = accessToken.split("::", 2);

    if (userId) headers["New-Api-User"] = userId;
    if (token.startsWith("session:")) {
      headers.Cookie = token.slice("session:".length);
    } else if (token && token !== "public") {
      headers.Authorization = `Bearer ${token}`;
    }

    const { status, body: raw } = await requestText({
      method: "GET",
      url: `${this.baseUrl.replace(/\/+$/, "")}/api/pricing`,
      headers,
      timeoutMs: this.timeoutMs,
    });

    if (status === 401 || status === 403) {
      this.pricingCache = undefined;
      throw new Error("session 已过期，将自动重新登录");
    }
    if (status !== 200) throw new Error(`接口返回 HTTP ${status}: ${raw.slice(0, 200)}`);

    const payload = JSON.parse(raw) as NewApiPricing;
    if (payload.success !== true) {
      throw new Error(safeJsonString(payload.message) || "获取 New API 定价失败");
    }
    this.pricingCache = payload;
    return payload;
  }
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function floatOrNull(value: unknown) {
  if (value === null || value === undefined || value === "" || value === "自动") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}
