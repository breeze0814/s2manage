import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import type { CompensationRule } from "../src/core/compensation.ts";
import { createSqliteCompensationClaimStore, type CompensationClaimStore } from "../src/server/compensation/claim-store.ts";
import { createCompensationConfigService } from "../src/server/compensation/config-service.ts";
import type { CompensationConfigStore, StoredCompensationSettings } from "../src/server/compensation/config-store.ts";
import { CompensationOrderConflictError } from "../src/server/compensation/errors.ts";
import { createCompensationService } from "../src/server/compensation/service.ts";
import { embedErrorResponse } from "../src/server/embeds/route-support.ts";
import type { CompensationSettings, LiandongOrder } from "../src/server/compensation/types.ts";
import type { EmbedIdentity } from "../src/server/embeds/types.ts";
import type { RewardCodeGateway } from "../src/server/embeds/reward-code-gateway.ts";
import { ensureEmbedSchema } from "../src/storage/sqlite-embed-schema.ts";

const RULES: readonly CompensationRule[] = [{
  id: "half",
  name: "半额补偿",
  startAt: "2026-07-01T00:00:00.000Z",
  endAt: "2026-08-01T00:00:00.000Z",
  ratePercent: 50,
}];

test("an order can only be redeemed once across concurrent claims", async () => {
  const claims = createSqliteCompensationClaimStore("file::memory:");
  const rewardStarted = deferred<void>();
  const releaseReward = deferred<void>();
  let rewardCalls = 0;
  const service = await testService({
    claims,
    rewards: { generate: async () => {
      rewardCalls += 1;
      rewardStarted.resolve();
      await releaseReward.promise;
      return [reward("COMP-500")];
    } },
  });
  try {
    const first = service.calculate(identity(), { orders: "LD-1" });
    await rewardStarted.promise;
    await assert.rejects(service.calculate(identity(), { orders: "LD-1" }), /已兑换或正在处理/);
    releaseReward.resolve();
    assert.equal((await first).redemptionCode, "COMP-500");
    const replay = await service.calculate(identity(), { orders: "LD-1" });
    assert.equal(replay.alreadyRedeemed, true);
    assert.equal(replay.redemptionCode, "COMP-500");
    assert.equal((await service.listClaims()).length, 1);
    assert.equal(rewardCalls, 1);
  } finally { claims.close(); }
});

test("an existing redemption code is not exposed to another user", async () => {
  const claims = createSqliteCompensationClaimStore("file::memory:");
  let rewardCalls = 0;
  const service = await testService({
    claims,
    rewards: { generate: async () => { rewardCalls += 1; return [reward("COMP-500")]; } },
  });
  try {
    await service.calculate(identity(), { orders: "LD-1" });
    await assert.rejects(service.calculate(identity("user-2"), { orders: "LD-1" }), /不能重复兑换/);
    assert.equal(rewardCalls, 1);
  } finally { claims.close(); }
});

test("duplicate order numbers in one claim are rejected before reward generation", async () => {
  const claims = createSqliteCompensationClaimStore("file::memory:");
  let rewardCalls = 0;
  const service = await testService({
    claims,
    rewards: { generate: async () => { rewardCalls += 1; return [reward("UNUSED")]; } },
  });
  try {
    await assert.rejects(service.calculate(identity(), { orders: "LD-1\nLD-1" }), /不能重复兑换/);
    assert.equal(rewardCalls, 0);
    assert.deepEqual(await service.listClaims(), []);
  } finally { claims.close(); }
});

test("a failed reward request releases its order reservation", async () => {
  const claims = createSqliteCompensationClaimStore("file::memory:");
  let attempts = 0;
  const service = await testService({
    claims,
    rewards: { generate: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("reward service unavailable");
      return [reward("RETRY-500")];
    } },
  });
  try {
    await assert.rejects(service.calculate(identity(), { orders: "LD-1" }), /reward service unavailable/);
    assert.equal((await service.calculate(identity(), { orders: "LD-1" })).redemptionCode, "RETRY-500");
    assert.equal(attempts, 2);
  } finally { claims.close(); }
});

test("schema migration marks historically rewarded orders as redeemed", () => {
  const database = new DatabaseSync(":memory:");
  try {
    createLegacyClaim(database);
    ensureEmbedSchema(database);
    ensureEmbedSchema(database);
    const values = database.prepare(`SELECT trade_no,claim_id,status
      FROM embed_compensation_order_redemptions`).all() as Array<Record<string, unknown>>;
    const rows = values.map((value) => ({ ...value }));
    assert.deepEqual(rows, [{ trade_no: "LD-HISTORY", claim_id: "old-claim", status: "redeemed" }]);
  } finally { database.close(); }
});

test("duplicate redemption is exposed as an HTTP conflict", () => {
  const response = embedErrorResponse(new CompensationOrderConflictError("LD-1"));
  assert.equal(response.status, 409);
});

async function testService(input: Readonly<{
  claims: CompensationClaimStore;
  rewards: RewardCodeGateway;
}>) {
  let nextId = 0;
  return createCompensationService({
    config: await configuredService(),
    claims: input.claims,
    liandong: fakeLiandong(order()),
    jsonOrders: { load: async () => { throw new Error("URL 模式不应读取 JSON"); } },
    rewards: input.rewards,
    id: () => `claim-${nextId += 1}`,
  });
}

async function configuredService() {
  const service = createCompensationConfigService({
    store: memoryConfigStore(),
    cipher: { encrypt: (value) => `encrypted:${value}`, decrypt: (value) => value.replace(/^encrypted:/, "") },
  });
  await service.update({ enabled: true, activityName: "订单补偿", description: "", orderSource: "url",
    baseUrl: "https://www.ldxp.cn", username: "merchant", password: "password", rules: RULES });
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
    findOrder: async (_settings: CompensationSettings, _session: unknown, tradeNo: string) => (
      tradeNo === found.tradeNo ? found : null
    ),
  };
}

function order(): LiandongOrder {
  return {
    tradeNo: "LD-1", goodsName: "测试商品", quantity: 1, totalAmount: 10, status: 1,
    createTime: Date.parse("2026-07-20T00:00:00.000Z") / 1_000, successTime: null,
    userId: 1, sendout: 1, parentId: 0, parentAmount: 0, identity: "buyer",
    goods: { id: 1, goodsType: "card", goodsKey: "key", name: "测试商品", description: "", link: "" },
  };
}

function identity(userId = "user-1"): EmbedIdentity {
  return {
    kind: "compensation", embedToken: "embed-token", srcHost: "https://sub2api.example.com",
    srcUrl: "https://sub2api.example.com/console", sub2apiUserId: userId,
    sub2apiEmail: `${userId}@example.com`, sub2apiRole: "user", sub2apiBalance: 20,
  };
}

function reward(code: string) {
  return { id: 42, code, type: "balance" as const, value: 5 };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((fulfill) => { resolve = fulfill; });
  return Object.freeze({ promise, resolve });
}

function createLegacyClaim(database: DatabaseSync) {
  database.exec(`CREATE TABLE embed_compensation_claims (
    id TEXT PRIMARY KEY, src_host TEXT NOT NULL, sub2api_user_id TEXT NOT NULL,
    masked_email TEXT NOT NULL, store_name TEXT NOT NULL, status TEXT NOT NULL,
    results_json TEXT NOT NULL, eligible_order_count INTEGER NOT NULL,
    invalid_order_count INTEGER NOT NULL, total_compensation_fen INTEGER NOT NULL,
    redemption_code TEXT, reward_code_id INTEGER, error_message TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  ) STRICT`);
  const results = JSON.stringify([{ requestedTradeNo: "LD-HISTORY", status: "found",
    compensation: { eligible: true, compensationFen: 500 } }]);
  database.prepare(`INSERT INTO embed_compensation_claims VALUES
    ('old-claim','host','user','u***@example.com','store','completed',?,1,0,500,'OLD-CODE',1,NULL,'old','new')`)
    .run(results);
}
