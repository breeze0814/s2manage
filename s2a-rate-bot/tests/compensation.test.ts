import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { calculateCompensation, summarizeCompensations, type CompensationRule } from "../src/core/compensation.ts";
import { createSqliteCompensationClaimStore } from "../src/server/compensation/claim-store.ts";
import { createCompensationConfigService } from "../src/server/compensation/config-service.ts";
import type { CompensationConfigStore, StoredCompensationSettings } from "../src/server/compensation/config-store.ts";
import { createCompensationService } from "../src/server/compensation/service.ts";
import type { CompensationSettings, LiandongOrder } from "../src/server/compensation/types.ts";
import type { EmbedIdentity } from "../src/server/embeds/types.ts";
import { loginLiandong } from "../src/server/compensation/liandong-auth.ts";
import { findLiandongOrder } from "../src/server/compensation/liandong-orders.ts";
import type { JsonRequest } from "../src/server/compensation/http.ts";
import { ensureEmbedSchema } from "../src/storage/sqlite-embed-schema.ts";

const RULES: readonly CompensationRule[] = [{
  id: "half",
  name: "半额补偿",
  startAt: "2026-07-01T00:00:00.000Z",
  endAt: "2026-08-01T00:00:00.000Z",
  ratePercent: 50,
}];

test("configurable compensation rounds each payment before applying its rule", () => {
  const eligible = calculateCompensation(order({ totalAmount: 10.6 }), RULES);
  const outside = calculateCompensation(order({ createTime: seconds("2026-08-01T00:00:00.000Z") }), RULES);
  assert.deepEqual(eligible, {
    eligible: true,
    ruleId: "half",
    ruleName: "半额补偿",
    ratePercent: 50,
    roundedPaymentYuan: 11,
    compensationFen: 550,
  });
  assert.equal(outside.eligible, false);
  assert.equal(outside.compensationFen, 0);
  assert.deepEqual(summarizeCompensations([eligible, outside]), {
    eligibleOrderCount: 1,
    invalidOrderCount: 1,
    totalCompensationFen: 550,
  });
});

test("successful calculation automatically generates a matching balance code", async () => {
  const claims = createSqliteCompensationClaimStore("file::memory:");
  const rewardCalls: unknown[] = [];
  const service = createCompensationService({
    config: configuredService(), claims,
    liandong: fakeLiandong(order({ totalAmount: 10.4 })),
    rewards: { generate: async (request) => {
      rewardCalls.push(request);
      return [{ id: 42, code: "COMP-500", type: "balance", value: 5 }];
    } },
    id: () => "claim-1",
    now: () => new Date("2026-08-05T12:00:00.000Z"),
  });
  try {
    const claim = await service.calculate(identity(), { orders: "LD-1\nLD-404" });
    assert.equal(claim.status, "completed");
    assert.equal(claim.redemptionCode, "COMP-500");
    assert.equal(claim.summary.totalCompensationFen, 500);
    assert.deepEqual(rewardCalls, [{ type: "balance", value: 5, count: 1 }]);
    assert.equal(service.listClaims()[0]?.redemptionCode, "COMP-500");
  } finally { claims.close(); }
});

test("reward generation failures remain visible in the persisted claim", async () => {
  const claims = createSqliteCompensationClaimStore("file::memory:");
  const service = createCompensationService({
    config: configuredService(), claims,
    liandong: fakeLiandong(order({})),
    rewards: { generate: async () => { throw new Error("redeem endpoint unavailable"); } },
    id: () => "claim-failed",
  });
  try {
    await assert.rejects(service.calculate(identity(), { orders: "LD-1" }), /redeem endpoint unavailable/);
    const failed = service.listClaims()[0];
    assert.equal(failed?.status, "failed");
    assert.equal(failed?.errorMessage, "redeem endpoint unavailable");
    assert.equal(failed?.redemptionCode, null);
  } finally { claims.close(); }
});

test("compensation embed configuration accepts the new kind and hides credentials", () => {
  const service = configuredService();
  const publicSettings = service.getPublic();
  assert.equal(publicSettings.enabled, true);
  assert.equal("username" in publicSettings, false);
  assert.equal("password" in publicSettings, false);
  assert.equal(service.getAdmin().passwordConfigured, true);
});

test("legacy embed config schema preserves rows and accepts compensation", () => {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec(`CREATE TABLE embed_configs (
      kind TEXT PRIMARY KEY CHECK (kind IN ('tickets', 'leaderboard', 'lottery')),
      embed_token TEXT NOT NULL UNIQUE, config_json TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    ) STRICT`);
    database.prepare("INSERT INTO embed_configs VALUES (?, ?, ?, ?, ?)")
      .run("tickets", "old-token", "{}", "now", "now");
    ensureEmbedSchema(database);
    database.prepare("INSERT INTO embed_configs VALUES (?, ?, ?, ?, ?)")
      .run("compensation", "new-token", "{}", "now", "now");
    const rows = database.prepare("SELECT kind FROM embed_configs ORDER BY kind").all() as Array<{ kind: string }>;
    assert.deepEqual(rows.map((row) => row.kind), ["compensation", "tickets"]);
  } finally { database.close(); }
});

test("extracted Liandong protocol logs in and parses an exact order", async () => {
  const requests: JsonRequest[] = [];
  const responses: unknown[] = [
    { code: 1, data: { safe_mode: 0 } },
    { code: 1, data: { merchant_token: "merchant-token" } },
    { code: 1, data: { id: 1, username: "merchant", nickname: "测试小铺", sell_count: 2 } },
    orderPage(),
  ];
  const transport = { request: async (request: JsonRequest) => { requests.push(request); return responses.shift(); } };
  const session = await loginLiandong({
    baseUrl: "https://www.ldxp.cn/",
    credentials: { username: "merchant", password: "password" },
    transport,
  });
  const found = await findLiandongOrder({
    baseUrl: "https://www.ldxp.cn",
    merchantToken: session.merchantToken,
    tradeNo: "LD-1",
    transport,
  });
  assert.equal(session.profile.nickname, "测试小铺");
  assert.equal(found?.tradeNo, "LD-1");
  assert.deepEqual(requests.map((request) => new URL(request.url).pathname), [
    "/merchantApi/user/checkSafeMode",
    "/merchantApi/user/login",
    "/merchantApi/user/userinfo",
    "/merchantApi/order/list",
  ]);
  assert.equal(requests[3]?.headers["merchant-token"], "merchant-token");
  assert.equal(requests[3]?.body.trade_no, "LD-1");
});

function configuredService() {
  const store = memoryConfigStore();
  const service = createCompensationConfigService({
    store,
    cipher: { encrypt: (value) => `encrypted:${value}`, decrypt: (value) => value.replace(/^encrypted:/, "") },
  });
  service.update({
    enabled: true,
    activityName: "订单补偿",
    description: "",
    baseUrl: "https://www.ldxp.cn",
    username: "merchant",
    password: "password",
    rules: RULES,
  });
  return service;
}

function memoryConfigStore(): CompensationConfigStore {
  let value: StoredCompensationSettings | null = null;
  return {
    get: () => value,
    save: (settings) => {
      value = { ...settings, updatedAt: "2026-08-05T12:00:00.000Z" };
      return value;
    },
    close: () => undefined,
  };
}

function fakeLiandong(found: LiandongOrder) {
  return {
    login: async (_settings: CompensationSettings) => ({
      merchantToken: "merchant-token",
      profile: { id: 1, username: "merchant", nickname: "测试小铺", sellCount: 1 },
    }),
    findOrder: async (_settings: CompensationSettings, _session: unknown, tradeNo: string) => tradeNo === "LD-1" ? found : null,
  };
}

function identity(): EmbedIdentity {
  return {
    kind: "compensation",
    embedToken: "embed-token",
    srcHost: "https://sub2api.example.com",
    srcUrl: "https://sub2api.example.com/console",
    sub2apiUserId: "user-1",
    sub2apiEmail: "user@example.com",
    sub2apiRole: "user",
    sub2apiBalance: 20,
  };
}

function order(patch: Partial<LiandongOrder>): LiandongOrder {
  return {
    tradeNo: "LD-1",
    goodsName: "测试商品",
    quantity: 1,
    totalAmount: 10,
    status: 1,
    createTime: seconds("2026-07-20T00:00:00.000Z"),
    successTime: null,
    userId: 1,
    sendout: 1,
    parentId: 0,
    parentAmount: 0,
    identity: "buyer",
    goods: { id: 1, goodsType: "card", goodsKey: "key", name: "测试商品", description: "", link: "" },
    ...patch,
  };
}

function orderPage() {
  return { code: 1, data: { total: 1, list: [{
    trade_no: "LD-1", goods_name: "测试商品", quantity: 1, total_amount: 10,
    status: 1, create_time: seconds("2026-07-20T00:00:00.000Z"), success_time: null,
    user_id: 1, sendout: 1, parent_id: 0, parent_amount: 0, identity: "buyer",
    goods: { id: 1, goods_type: "card", goods_key: "key", name: "测试商品", description: "", link: "" },
  }] } };
}

function seconds(value: string) { return Date.parse(value) / 1_000; }
