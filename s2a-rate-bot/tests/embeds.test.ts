import assert from "node:assert/strict";
import { test } from "node:test";
import type { EmbedConfig, EmbedIdentity, TicketEmbedSettings } from "../src/server/embeds/types.ts";
import { createLeaderboardService } from "../src/server/embeds/leaderboard-service.ts";
import { createEmbedIdentityService } from "../src/server/embeds/identity-service.ts";
import { createLotteryService } from "../src/server/embeds/lottery-service.ts";
import { createSqliteLotteryStore } from "../src/server/embeds/lottery-store.ts";
import { createRewardCodeGateway } from "../src/server/embeds/reward-code-gateway.ts";
import { createActiveEmbedSessionService } from "../src/server/embeds/runtime.ts";
import { createEmbedSessionService } from "../src/server/embeds/session.ts";
import { createTicketService } from "../src/server/embeds/ticket-service.ts";
import { createSqliteTicketStore } from "../src/server/embeds/ticket-store.ts";

const TICKET_SETTINGS: TicketEmbedSettings = {
  sourceOrigin: "https://sub2api.example.com",
  template: "default",
  maxImagesPerTicket: 3,
  categoryOptions: ["通用问题"],
  priorityOptions: ["普通"],
};

test("ticket flow preserves ownership, status transitions and protected attachments", async () => {
  const store = createSqliteTicketStore("file::memory:");
  let sequence = 0;
  const service = createTicketService({
    store,
    configs: fakeTicketConfigs(),
    now: () => new Date("2026-07-30T10:00:00.000Z"),
    id: () => `id-${++sequence}`,
  });
  try {
    const ticket = await service.createUser(identity("user-1"), ticketInput(), [{
      originalName: "proof.png", declaredType: "image/png",
      data: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x00]),
    }]);
    assert.equal(ticket.status, "open");
    assert.equal(ticket.messages[0]?.attachments[0]?.originalName, "proof.png");
    assert.equal(service.listUser(identity("user-2")).length, 0);
    assert.throws(() => service.getUser(ticket.id, identity("user-2")), /不存在/);
    const pending = service.replyUser(ticket.id, identity("user-1"), { body: "补充信息" });
    assert.equal(pending.status, "pending");
    const replied = service.replyAdmin(ticket.id, { body: "客服回复" });
    assert.equal(replied.status, "replied");
    const closed = service.updateStatus(ticket.id, { status: "closed" });
    assert.equal(closed.status, "closed");
    assert.throws(() => service.replyUser(ticket.id, identity("user-1"), { body: "再次回复" }), /不能继续回复/);
    const attachment = service.attachmentUser(ticket.messages[0]!.attachments[0]!.id, identity("user-1"));
    assert.equal(attachment.contentType, "image/png");
  } finally { store.close(); }
});

test("instant lottery returns the result and generated reward code immediately", async () => {
  const store = createSqliteLotteryStore("file::memory:");
  let sequence = 0;
  const rewards = fakeRewards();
  const service = createLotteryService({
    store, rewards,
    now: () => new Date("2026-07-30T10:00:00.000Z"),
    id: () => `lottery-${++sequence}`,
    random: () => 0,
  });
  try {
    const campaign = service.create({
      name: "夏日活动", description: "测试活动", drawMode: "instant",
      registrationStart: null, registrationEnd: null, drawAt: null, publicWinners: false,
      prizes: [{ name: "余额奖励", type: "balance", value: 10, quantity: 1, probability: 100 }],
    });
    const winner = await service.enter(campaign.id, identity("user-1"));
    await assert.rejects(service.enter(campaign.id, identity("user-2")), /不可参与/);
    assert.equal(winner.status, "won");
    assert.equal(winner.redemptionCode, "balance-10-1");
    assert.equal((await service.get(campaign.id)).status, "exhausted");
    assert.deepEqual(rewards.calls, [{ type: "balance", value: 10, count: 1 }]);
    const firstUserView = await service.get(campaign.id, identity("user-1"));
    assert.equal(firstUserView.currentEntry?.status, "won");
    assert.equal(firstUserView.winners.length, 1);
    assert.equal((await service.get(campaign.id, identity("user-2"))).winners.length, 0);
    assert.equal((await service.get(campaign.id)).winners[0]?.redemptionCode, "balance-10-1");
    assert.throws(() => service.withdraw(campaign.id, identity("user-1")), /不能撤回/);
  } finally { store.close(); }
});

test("instant lottery exposes reward generation failures and releases the reserved prize", async () => {
  const store = createSqliteLotteryStore("file::memory:");
  const service = createLotteryService({
    store, random: () => 0, id: () => crypto.randomUUID(),
    rewards: { generate: async () => { throw new Error("target redeem API unavailable"); } },
  });
  try {
    const campaign = service.create({
      name: "失败测试", description: "", drawMode: "instant", registrationStart: null,
      registrationEnd: null, drawAt: null, publicWinners: false,
      prizes: [{ name: "余额", type: "balance", value: 5, quantity: 1, probability: 100 }],
    });
    await assert.rejects(service.enter(campaign.id, identity("user-1")), /target redeem API unavailable/);
    assert.deepEqual(store.listEntries(campaign.id), []);
  } finally { store.close(); }
});

test("instant lottery keeps configured probabilities and does not renormalize exhausted prizes", async () => {
  const store = createSqliteLotteryStore("file::memory:");
  const rewards = fakeRewards();
  const targets = [0, 0, 999_999];
  const service = createLotteryService({
    store, rewards, random: () => targets.shift() ?? 0, id: () => crypto.randomUUID(),
  });
  try {
    const campaign = service.create({
      name: "概率测试", description: "", drawMode: "instant", registrationStart: null,
      registrationEnd: null, drawAt: null, publicWinners: false,
      prizes: [
        { name: "高等奖", type: "balance", value: 10, quantity: 1, probability: 50 },
        { name: "二等奖", type: "balance", value: 5, quantity: 1, probability: 30 },
      ],
    });
    assert.equal((await service.enter(campaign.id, identity("user-1"))).status, "won");
    assert.equal((await service.enter(campaign.id, identity("user-2"))).status, "not_won");
    assert.equal((await service.enter(campaign.id, identity("user-3"))).status, "not_won");
    assert.deepEqual(rewards.calls, [{ type: "balance", value: 10, count: 1 }]);
    const view = await service.get(campaign.id, identity("user-3"));
    assert.equal(view.prizeInventory.find((item) => item.prizeId === campaign.prizes[1]?.id)?.remaining, 1);
    assert.equal(view.status, "open");
  } finally { store.close(); }
});

test("reading a due scheduled lottery does not start drawing or call the reward API", async () => {
  const store = createSqliteLotteryStore("file::memory:");
  const rewards = fakeRewards();
  const service = createLotteryService({
    store, rewards, now: () => new Date("2026-07-30T10:31:00.000Z"), id: () => crypto.randomUUID(), random: () => 0,
  });
  try {
    const campaign = service.create({
      name: "读取无副作用", description: "", drawMode: "scheduled", registrationStart: null,
      registrationEnd: null, drawAt: "2026-07-30T10:30:00.000Z", publicWinners: true,
      prizes: [{ name: "余额", type: "balance", value: 5, quantity: 1, probability: null }],
    });
    await service.enter(campaign.id, identity("user-1"));
    await service.get(campaign.id, identity("user-1"));
    assert.equal(store.getCampaign(campaign.id)?.status, "open");
    assert.deepEqual(rewards.calls, []);
    await service.processDue();
    assert.equal(store.getCampaign(campaign.id)?.status, "drawn");
  } finally { store.close(); }
});

test("scheduled lottery generates subscription codes at the configured draw time", async () => {
  const store = createSqliteLotteryStore("file::memory:");
  let now = new Date("2026-07-30T10:00:00.000Z");
  const rewards = fakeRewards();
  const service = createLotteryService({ store, rewards, now: () => now, id: () => crypto.randomUUID(), random: () => 0 });
  try {
    const campaign = service.create({
      name: "定时活动", description: "统一开奖", drawMode: "scheduled",
      registrationStart: null, registrationEnd: "2026-07-30T10:20:00.000Z",
      drawAt: "2026-07-30T10:30:00.000Z", publicWinners: true,
      prizes: [{ name: "月度订阅", type: "subscription", value: 30, quantity: 1, probability: null }],
    });
    await service.enter(campaign.id, identity("user-1"));
    await service.enter(campaign.id, identity("user-2"));
    now = new Date("2026-07-30T10:31:00.000Z");
    await service.processDue();
    assert.equal(store.getCampaign(campaign.id)?.status, "drawn");
    assert.deepEqual(store.listEntries(campaign.id).map((entry) => entry.status), ["won", "not_won"]);
    assert.deepEqual(rewards.calls, [{ type: "subscription", value: 30, count: 1 }]);
    const otherView = await service.get(campaign.id, identity("user-3"));
    assert.equal(otherView.winners[0]?.redemptionCode, null);
  } finally { store.close(); }
});

test("scheduled lottery closes an empty campaign without generating codes", async () => {
  const store = createSqliteLotteryStore("file::memory:");
  let now = new Date("2026-07-30T10:00:00.000Z");
  const rewards = fakeRewards();
  const service = createLotteryService({ store, rewards, now: () => now, id: () => crypto.randomUUID(), random: () => 0 });
  try {
    const campaign = service.create({
      name: "空活动", description: "无人报名", drawMode: "scheduled",
      registrationStart: null, registrationEnd: null, drawAt: "2026-07-30T10:30:00.000Z",
      publicWinners: true, prizes: [{ name: "余额", type: "balance", value: 5, quantity: 1, probability: null }],
    });
    now = new Date("2026-07-30T10:31:00.000Z");
    await service.processDue();
    assert.equal(store.getCampaign(campaign.id)?.status, "drawn");
    assert.deepEqual(rewards.calls, []);
  } finally { store.close(); }
});

test("scheduled lottery persists a draw error and resumes the unfinished reward", async () => {
  const store = createSqliteLotteryStore("file::memory:");
  let calls = 0;
  const service = createLotteryService({
    store, id: () => crypto.randomUUID(), now: () => new Date("2026-07-30T10:31:00.000Z"), random: () => 0,
    rewards: { generate: async (request) => { calls += 1; if (calls === 1) throw new Error("redeem service timeout"); return [{ id: 8, code: "CODE-8", ...request }]; } },
  });
  try {
    const campaign = service.create({
      name: "可恢复开奖", description: "", drawMode: "scheduled", registrationStart: null,
      registrationEnd: null, drawAt: "2026-07-30T10:30:00.000Z", publicWinners: true,
      prizes: [{ name: "余额", type: "balance", value: 5, quantity: 1, probability: null }],
    });
    await service.enter(campaign.id, identity("user-1"));
    await assert.rejects(service.processDue(), /redeem service timeout/);
    assert.equal(store.getCampaign(campaign.id)?.status, "drawing");
    assert.equal(store.getCampaign(campaign.id)?.lastError, "redeem service timeout");
    await service.processDue();
    assert.equal(store.getCampaign(campaign.id)?.status, "drawn");
    assert.equal(store.listEntries(campaign.id)[0]?.redemptionCode, "CODE-8");
  } finally { store.close(); }
});

test("reward code gateway sends the configured prize and validates the target response", async () => {
  const requests: Array<Record<string, unknown>> = [];
  const gateway = createRewardCodeGateway({
    baseUrl: "https://target.example.com/",
    adminApiKey: "admin-key",
    http: { request: async <T>(input: Record<string, unknown>) => {
      requests.push(input);
      return { data: [{ id: 8, code: "CODE-8", type: "balance", value: 20 }] } as T;
    } },
  });
  assert.deepEqual(await gateway.generate({ type: "balance", value: 20, count: 1 }), [
    { id: 8, code: "CODE-8", type: "balance", value: 20 },
  ]);
  const request = requests[0];
  assert.equal(request?.url, "https://target.example.com/api/v1/admin/redeem-codes/generate");
  assert.deepEqual(request?.body, { type: "balance", value: 20, count: 1 });
  assert.equal((request?.headers as Record<string, string>)["x-api-key"], "admin-key");
});

test("reward code gateway rejects a partial code response", async () => {
  const gateway = createRewardCodeGateway({
    baseUrl: "https://target.example.com", adminApiKey: "admin-key",
    http: { request: async <T>() => ({ data: [] }) as T },
  });
  await assert.rejects(gateway.generate({ type: "subscription", value: 30, count: 1 }), /预期 1 个/);
});

test("leaderboard normalizes upstream payload, masks email and marks current user", async () => {
  const service = createLeaderboardService({
    upstream: {
      userBreakdown: async () => ({ data: { users: [
        { user_id: "u-2", email: "second@example.com", requests: 3, total_tokens: 20, actual_cost: 0.2 },
        { user_id: "u-1", email: "first@example.com", requests: 5, total_tokens: 100, actual_cost: 1.5 },
      ] } }),
    },
    now: () => new Date("2026-07-30T04:00:00.000Z"),
  });
  const result = await service.get({}, "u-1");
  assert.equal(result.startDate, "2026-07-30");
  assert.equal(result.endDate, "2026-07-31");
  assert.equal(result.rows[0]?.userId, "u-1");
  assert.equal(result.rows[0]?.email, "f***t@example.com");
  assert.equal(result.currentUserId, "u-1");
  await assert.rejects(() => service.get({ startDate: "2026-01-01", endDate: "2026-03-01" }), /1 至 31 天/);
});

test("embed session exchange binds source origin and verifies claimed user", async () => {
  const issued: EmbedIdentity[] = [];
  const config: EmbedConfig = {
    kind: "leaderboard", embedToken: "valid-token", config: { sourceOrigin: TICKET_SETTINGS.sourceOrigin },
    createdAt: "2026-07-30T00:00:00.000Z", updatedAt: "2026-07-30T00:00:00.000Z",
  };
  const service = createEmbedIdentityService({
    configs: {
      get: async () => config,
      getByToken: () => config,
      updateTickets: async () => config,
      rotate: async () => config,
    },
    sessions: {
      issue: async (identityValue) => { issued.push(identityValue); return "session-token"; },
      verify: async () => null,
    },
    upstream: {
      sourceOrigin: async () => TICKET_SETTINGS.sourceOrigin,
      currentUser: async () => ({ id: "user-1", email: "user-1@example.com", role: "user", raw: {} }),
      userBreakdown: async () => ({}),
    },
  });
  const result = await service.exchange("leaderboard", {
    embedToken: "valid-token", sub2apiToken: "upstream-secret", userId: "user-1",
    srcHost: `${TICKET_SETTINGS.sourceOrigin}/path`, srcUrl: `${TICKET_SETTINGS.sourceOrigin}/dashboard`,
  });
  assert.equal(result.sessionToken, "session-token");
  assert.equal(issued[0]?.sub2apiUserId, "user-1");
  assert.equal(JSON.stringify(issued).includes("upstream-secret"), false);
  await assert.rejects(() => service.exchange("leaderboard", {
    embedToken: "valid-token", sub2apiToken: "upstream-secret", userId: "other-user",
    srcHost: TICKET_SETTINGS.sourceOrigin,
  }), /身份校验失败/);
  await assert.rejects(() => service.exchange("leaderboard", {
    embedToken: "valid-token", sub2apiToken: "upstream-secret", userId: "user-1",
    srcHost: "https://attacker.example.com",
  }), /来源与当前目标站不一致/);
});

test("embed token rotation invalidates previously issued sessions", async () => {
  let config = embedConfig("leaderboard", "token-before");
  const sessions = createActiveEmbedSessionService(createEmbedSessionService("test-secret-at-least-32-characters"), {
    get: async () => config,
  });
  const sessionToken = await sessions.issue({
    ...identity("user-1"), kind: "leaderboard", embedToken: "token-before",
  });
  assert.equal((await sessions.verify(sessionToken, "leaderboard"))?.sub2apiUserId, "user-1");
  config = embedConfig("leaderboard", "token-after");
  assert.equal(await sessions.verify(sessionToken, "leaderboard"), null);
});

function identity(userId: string): EmbedIdentity {
  return {
    kind: "tickets", embedToken: "embed-token", srcHost: TICKET_SETTINGS.sourceOrigin,
    srcUrl: `${TICKET_SETTINGS.sourceOrigin}/dashboard`, sub2apiUserId: userId,
    sub2apiEmail: `${userId}@example.com`, sub2apiRole: "user",
  };
}

function ticketInput() {
  return { manualEmail: "contact@example.com", title: "接口调用失败", body: "请求返回错误", category: "通用问题", priority: "普通" };
}

function embedConfig(kind: EmbedConfig["kind"], embedToken: string): EmbedConfig {
  return {
    kind, embedToken, config: { sourceOrigin: TICKET_SETTINGS.sourceOrigin },
    createdAt: "2026-07-30T00:00:00.000Z", updatedAt: "2026-07-30T00:00:00.000Z",
  };
}

function fakeTicketConfigs() {
  const config: EmbedConfig = {
    kind: "tickets", embedToken: "embed-token", config: TICKET_SETTINGS as unknown as Record<string, unknown>,
    createdAt: "2026-07-30T00:00:00.000Z", updatedAt: "2026-07-30T00:00:00.000Z",
  };
  return {
    get: async () => config,
    getByToken: () => config,
    updateTickets: async () => config,
    rotate: async () => config,
  };
}

function fakeRewards() {
  const calls: Array<{ type: "balance" | "subscription"; value: number; count: number }> = [];
  let sequence = 0;
  return {
    calls,
    generate: async (request: { type: "balance" | "subscription"; value: number; count: number }) => {
      calls.push({ ...request });
      return Array.from({ length: request.count }, () => ({
        id: ++sequence, code: `${request.type}-${request.value}-${sequence}`,
        type: request.type, value: request.value,
      }));
    },
  };
}
