import { z } from "zod";
import { createJsonHttpClient, type JsonHttpClient } from "../../adapters/http-client.ts";
import type { SettingsService } from "../settings/service.ts";
import type { LotteryEligibilityGateway } from "./lottery-eligibility.ts";
import type { EmbedIdentity } from "./types.ts";

const LOTTERY_TIME_ZONE = "Asia/Shanghai";
const INVITE_PAGE_SIZE = 100;
const REDEEM_HISTORY_PAGE_SIZE = 1;
const USER_REDEEM_TYPES = ["balance", "concurrency", "subscription"] as const;
const dateFormatter = new Intl.DateTimeFormat("en", {
  timeZone: LOTTERY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const historyPageSchema = z.object({
  items: z.array(z.object({
    type: z.enum(USER_REDEEM_TYPES),
    status: z.string(),
    used_at: z.string().nullable(),
  })),
});
const invitePageSchema = z.object({
  items: z.array(z.object({
    inviter_id: z.coerce.string(),
    created_at: z.string(),
  })),
  page: z.coerce.number().int().positive(),
  pages: z.coerce.number().int().nonnegative(),
});

export function createLotteryEligibilityGateway(input: Readonly<{
  baseUrl: string;
  adminApiKey: string;
  http: JsonHttpClient;
  currentBalance: LotteryEligibilityGateway["currentBalance"];
}>): LotteryEligibilityGateway {
  const configured = { ...input, baseUrl: input.baseUrl.replace(/\/+$/, "") };
  return {
    currentBalance: input.currentBalance,
    redeemedToday: (identity, now) => hasRedeemedToday(configured, identity, now),
    invitedToday: (identity, now) => hasInvitedToday(configured, identity, now),
  };
}

export function createRuntimeLotteryEligibilityGateway(
  settings: SettingsService,
  currentBalance: LotteryEligibilityGateway["currentBalance"],
): LotteryEligibilityGateway {
  const configured = async () => {
    const snapshot = await settings.get();
    if (!snapshot.target) throw new Error("目标站尚未配置，无法核验抽奖参与条件");
    const http = createJsonHttpClient({
      timeoutMs: snapshot.worker.timeoutSeconds * 1_000,
      proxyUrl: snapshot.proxy.enabled ? snapshot.proxy.proxyUrl : null,
    });
    return createLotteryEligibilityGateway({ ...snapshot.target, http, currentBalance });
  };
  return {
    currentBalance,
    redeemedToday: async (identity, now) => (await configured()).redeemedToday(identity, now),
    invitedToday: async (identity, now) => (await configured()).invitedToday(identity, now),
  };
}

async function hasRedeemedToday(input: GatewayInput, identity: EmbedIdentity, now: Date) {
  const pages = await Promise.all(USER_REDEEM_TYPES.map((type) => fetchHistoryPage(input, identity, type)));
  const today = shanghaiDate(now);
  return pages.some((page) => page.items.some((item) => item.status === "used"
    && item.used_at !== null && shanghaiDate(new Date(item.used_at)) === today));
}

async function fetchHistoryPage(input: GatewayInput, identity: EmbedIdentity, type: typeof USER_REDEEM_TYPES[number]) {
  const query = new URLSearchParams({
    page: "1",
    page_size: String(REDEEM_HISTORY_PAGE_SIZE),
    type,
  });
  const value = await input.http.request({
    url: `${input.baseUrl}/api/v1/admin/users/${encodeURIComponent(identity.sub2apiUserId)}/balance-history?${query}`,
    method: "GET",
    headers: adminHeaders(input.adminApiKey),
  });
  return historyPageSchema.parse(dataPayload(value));
}

async function hasInvitedToday(input: GatewayInput, identity: EmbedIdentity, now: Date) {
  const date = shanghaiDate(now);
  let page = 1;
  while (true) {
    const result = await fetchInvitePage(input, identity, { date, page });
    const matched = result.items.some((item) => item.inviter_id === identity.sub2apiUserId
      && shanghaiDate(new Date(item.created_at)) === date);
    if (matched) return true;
    if (page >= result.pages) return false;
    page += 1;
  }
}

async function fetchInvitePage(
  input: GatewayInput,
  identity: EmbedIdentity,
  queryInput: Readonly<{ date: string; page: number }>,
) {
  const query = new URLSearchParams({
    page: String(queryInput.page),
    page_size: String(INVITE_PAGE_SIZE),
    search: identity.sub2apiEmail || identity.sub2apiUserId,
    start_at: queryInput.date,
    end_at: queryInput.date,
    timezone: LOTTERY_TIME_ZONE,
  });
  const value = await input.http.request({
    url: `${input.baseUrl}/api/v1/admin/affiliates/invites?${query}`,
    method: "GET",
    headers: adminHeaders(input.adminApiKey),
  });
  return invitePageSchema.parse(dataPayload(value));
}

function dataPayload(value: unknown) {
  if (!value || typeof value !== "object" || !("data" in value)) return value;
  return (value as Record<string, unknown>).data;
}

function shanghaiDate(value: Date) {
  if (!Number.isFinite(value.getTime())) throw new Error("目标站返回的活动时间无效");
  const parts = Object.fromEntries(dateFormatter.formatToParts(value).map((part) => [part.type, part.value]));
  if (!parts.year || !parts.month || !parts.day) throw new Error("无法计算上海时区日期");
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function adminHeaders(adminApiKey: string) {
  return { "x-api-key": adminApiKey, accept: "application/json" };
}

type GatewayInput = Readonly<{
  baseUrl: string;
  adminApiKey: string;
  http: JsonHttpClient;
}>;
