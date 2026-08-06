export function sourceInput(overrides: Record<string, unknown> = {}) {
  return {
    name: "Sub2 Source",
    siteType: "sub2api",
    baseUrl: "https://source.example.com",
    websiteUrl: "https://www.source.example.com",
    authMode: "password",
    username: "user@example.com",
    password: "source-password",
    accessToken: "",
    refreshToken: "",
    rechargeRatio: 1,
    intervalSeconds: 600,
    useProxy: true,
    enabled: true,
    ...overrides,
  };
}

export function successCollector(): CollectionCollector {
  return { collect: async ({ site }) => successOverview(site.id) };
}

export function successOverview(
  siteId: number,
  values: Readonly<{ balance?: number; rate?: number; todayConsume?: number; historyRecharge?: number }> = {},
) {
  const balance = values.balance ?? 12.5;
  const rate = values.rate ?? 2;
  return {
    account: {
      sourceSiteId: siteId, label: "source@example.com", balance,
      todayConsume: values.todayConsume ?? 1.25, historyRecharge: values.historyRecharge ?? 30,
    },
    rates: [{ sourceSiteId: siteId, groupId: "vip", groupName: "VIP", platform: "openai", rawRate: rate, effectiveRate: rate, collectedAt: new Date() }],
    errors: [],
  };
}

export function sourceRate(input: Readonly<{ siteId: number; groupId: string; groupName: string; effectiveRate: number }>) {
  return { sourceSiteId: input.siteId, groupId: input.groupId, groupName: input.groupName, platform: "openai", rawRate: input.effectiveRate, effectiveRate: input.effectiveRate, collectedAt: new Date() };
}

export type CollectionCollector = RuntimeCollectionCollector;
import type { CollectionCollector as RuntimeCollectionCollector } from "../src/server/collection/types.ts";
