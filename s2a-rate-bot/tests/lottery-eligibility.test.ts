import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { DEFAULT_LOTTERY_ELIGIBILITY_CONDITIONS } from "../src/core/lottery-eligibility.ts";
import type { JsonClientRequest } from "../src/adapters/http-client.ts";
import { createLotteryEligibilityGateway } from "../src/server/embeds/lottery-eligibility-gateway.ts";
import { createLotteryService } from "../src/server/embeds/lottery-service.ts";
import { createSqliteLotteryStore } from "../src/server/embeds/lottery-store.ts";
import type { EmbedIdentity } from "../src/server/embeds/types.ts";
import { ensureEmbedSchema } from "../src/storage/sqlite-embed-schema.ts";

test("selected lottery eligibility conditions are persisted and must all pass", async () => {
  const store = createSqliteLotteryStore("file::memory:");
  let facts = { balance: 5 as number | null, redeemed: false, invited: false };
  const service = createLotteryService({
    store,
    rewards: fakeRewards(),
    eligibility: {
      currentBalance: async () => facts.balance,
      redeemedToday: async () => facts.redeemed,
      invitedToday: async () => facts.invited,
    },
    now: () => new Date("2026-07-30T10:00:00.000Z"),
    id: () => crypto.randomUUID(),
  });
  try {
    const campaign = service.create(campaignInput({
      eligibilityConditions: [
        { type: "minimum_balance", minimum: 20 },
        { type: "redeemed_today" },
        { type: "invited_today" },
      ],
    }));
    assert.deepEqual(store.getCampaign(campaign.id)?.eligibilityConditions, campaign.eligibilityConditions);
    await assert.rejects(service.enter(campaign.id, identity()), /当前余额大于 20.*当天已使用兑换码.*当天已成功邀请好友/);

    facts = { balance: 21, redeemed: true, invited: false };
    await assert.rejects(service.enter(campaign.id, identity()), /当天已成功邀请好友/);

    facts = { balance: 21, redeemed: true, invited: true };
    assert.equal((await service.enter(campaign.id, identity())).status, "entered");

    const unrestricted = service.create(campaignInput({ name: "无限制活动", eligibilityConditions: [] }));
    facts = { balance: null, redeemed: false, invited: false };
    assert.equal((await service.enter(unrestricted.id, identity("user-2"))).status, "entered");
  } finally {
    store.close();
  }
});

test("lottery eligibility gateway reads real redemption and invite activity in Shanghai time", async () => {
  const requests: Array<{ url: string; headers: Record<string, string> }> = [];
  const gateway = createLotteryEligibilityGateway({
    baseUrl: "https://target.example.com/",
    adminApiKey: "admin-key",
    currentBalance: async () => 30,
    http: { request: async <T>(request: JsonClientRequest) => {
      requests.push({ url: request.url, headers: request.headers });
      const url = new URL(request.url);
      if (url.pathname.endsWith("/balance-history")) {
        const type = url.searchParams.get("type");
        const items = type === "subscription"
          ? [{ type, status: "used", used_at: "2026-07-29T16:05:00.000Z" }]
          : [];
        return { data: { items } } as T;
      }
      return { data: {
        items: [{ inviter_id: 42, created_at: "2026-07-30T09:00:00.000+08:00" }],
        page: 1,
        pages: 1,
      } } as T;
    } },
  });
  const viewer = identity("42");
  const now = new Date("2026-07-30T10:00:00.000Z");

  assert.equal(await gateway.redeemedToday(viewer, now), true);
  assert.equal(await gateway.invitedToday(viewer, now), true);
  assert.equal(requests.length, 4);
  assert.ok(requests.every((request) => request.headers["x-api-key"] === "admin-key"));
  const inviteUrl = new URL(requests.find((request) => request.url.includes("affiliates/invites"))!.url);
  assert.equal(inviteUrl.searchParams.get("start_at"), "2026-07-30");
  assert.equal(inviteUrl.searchParams.get("end_at"), "2026-07-30");
  assert.equal(inviteUrl.searchParams.get("timezone"), "Asia/Shanghai");
  assert.equal(inviteUrl.searchParams.get("search"), viewer.sub2apiEmail);
});

test("legacy lottery campaigns receive the previous balance threshold during schema migration", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`CREATE TABLE embed_lottery_campaigns (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL,
    draw_mode TEXT NOT NULL CHECK (draw_mode IN ('instant', 'scheduled')),
    status TEXT NOT NULL CHECK (status IN ('scheduled', 'open', 'drawing', 'drawn', 'exhausted', 'cancelled')),
    registration_start TEXT, registration_end TEXT, draw_at TEXT,
    visible_to_users INTEGER NOT NULL DEFAULT 1 CHECK (visible_to_users IN (0, 1)),
    public_winners INTEGER NOT NULL CHECK (public_winners IN (0, 1)),
    prizes_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    drawn_at TEXT, last_error TEXT
  ) STRICT`);
  database.prepare(`INSERT INTO embed_lottery_campaigns
    (id, name, description, draw_mode, status, visible_to_users, public_winners,
      prizes_json, created_at, updated_at)
    VALUES (?, ?, '', 'instant', 'open', 1, 0, '[]', ?, ?)`)
    .run("legacy", "旧活动", "2026-07-30T00:00:00.000Z", "2026-07-30T00:00:00.000Z");
  try {
    ensureEmbedSchema(database);
    const row = database.prepare("SELECT eligibility_json FROM embed_lottery_campaigns WHERE id = ?")
      .get("legacy") as { eligibility_json: string };
    assert.deepEqual(JSON.parse(row.eligibility_json), DEFAULT_LOTTERY_ELIGIBILITY_CONDITIONS);
  } finally {
    database.close();
  }
});

function campaignInput(overrides: Record<string, unknown> = {}) {
  return {
    name: "条件活动", description: "", drawMode: "scheduled",
    registrationStart: null, registrationEnd: null, drawAt: "2026-08-01T00:00:00.000Z",
    visibleToUsers: true, publicWinners: false,
    prizes: [{ name: "余额", type: "balance", value: 5, quantity: 1, probability: null }],
    ...overrides,
  };
}

function identity(userId = "user-1"): EmbedIdentity {
  return {
    kind: "lottery", embedToken: "token", srcHost: "https://target.example.com", srcUrl: "",
    sub2apiUserId: userId, sub2apiEmail: `${userId}@example.com`, sub2apiRole: "user", sub2apiBalance: 30,
  };
}

function fakeRewards() {
  return { generate: async () => [{ id: 1, code: "reward", type: "balance" as const, value: 5 }] };
}
