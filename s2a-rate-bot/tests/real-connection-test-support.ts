import type { RealConnection } from "../src/server/connections/types.ts";
import type { ConnectionStore } from "../src/server/connections/store.ts";
import type { CollectionStore } from "../src/server/collection/store.ts";

export const TEST_CONNECTION_ID = "11111111-1111-4111-8111-111111111111";

export function storedSiteInput() {
  return {
    name: "Source", remark: "Main", siteType: "sub2api" as const,
    baseUrl: "https://source.example.com", websiteUrl: "", authMode: "password" as const,
    username: "user@example.com", newApiUserId: "", passwordEnc: "enc", accessTokenEnc: "enc",
    refreshTokenEnc: "enc", rechargeRatio: 1, balanceAlertThreshold: null,
    intervalSeconds: 600, useProxy: false, enabled: true,
  };
}

export function recordVipRate(store: CollectionStore, siteId: number) {
  const startedAt = new Date().toISOString();
  store.recordSuccess({
    siteId, refreshVersion: store.beginRefresh(siteId), startedAt,
    overview: {
      account: { sourceSiteId: siteId, label: "user@example.com", balance: 10, todayConsume: 1, historyRecharge: 20 },
      rates: [{
        sourceSiteId: siteId, groupId: "vip", groupName: "VIP", platform: "openai",
        rawRate: 2, effectiveRate: 2, collectedAt: new Date(),
      }],
    },
  });
}

export function insertActiveConnection(store: ConnectionStore, siteId: number, overrides: Partial<RealConnection> = {}) {
  const at = "2026-01-01T00:00:00.000Z";
  const base: RealConnection = {
    id: TEST_CONNECTION_ID, operationId: "health-operation", sourceSiteId: siteId,
    sourceSiteName: "Source", sourceGroupId: "vip", sourceGroupName: "VIP",
    sourcePlatform: "sub2api", sourceCredentialId: "credential-1", targetAccountId: 99,
    targetAccountName: "Target Account", targetGroupIds: [7], targetGroupNames: ["Target VIP"],
    groupType: "openai", resourceName: "s2a-source-vip-11111111",
    provisioningMode: "managed", status: "active",
    pricingMappingEnabled: true, pricingMappingRequested: true,
    sourceCredentialDeleted: false, targetAccountDeleted: false,
    lifecycleAction: null, lifecycleStage: "idle", disconnectMode: "unlink",
    disconnectRemovePricing: true,
    lastError: null, createdAt: at, updatedAt: at, disconnectedAt: null,
  };
  const connection: RealConnection = { ...base, ...overrides };
  store.insert(connection);
  return connection;
}
