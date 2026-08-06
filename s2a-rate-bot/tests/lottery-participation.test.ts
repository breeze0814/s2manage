import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { lotteryParticipationKey } from "../src/core/lottery-participation.ts";
import { createLotteryService } from "../src/server/embeds/lottery-service.ts";
import { createSqliteLotteryStore } from "../src/server/embeds/lottery-store.ts";
import type { EmbedIdentity } from "../src/server/embeds/types.ts";
import { ensureEmbedSchema } from "../src/storage/sqlite-embed-schema.ts";

test("daily lottery participation resets at midnight in Asia/Shanghai", async () => {
  const store = createSqliteLotteryStore("file::memory:");
  let now = new Date("2026-07-30T15:59:59.000Z");
  let sequence = 0;
  const service = createLotteryService({
    store,
    now: () => now,
    id: () => `daily-${++sequence}`,
    random: (maximum) => maximum - 1,
    eligibility: eligibility(),
    rewards: rewards(),
  });
  try {
    const campaign = service.create(campaignInput({ participationMode: "daily" }));
    const first = await service.enter(campaign.id, identity());
    assert.equal(first.participationKey, "2026-07-30");
    assert.equal((await service.enter(campaign.id, identity())).id, first.id);
    assert.equal(store.listEntries(campaign.id).length, 1);

    now = new Date("2026-07-30T16:00:00.000Z");
    assert.equal(service.get(campaign.id, identity()).currentEntry, null);
    const second = await service.enter(campaign.id, identity());
    assert.equal(second.participationKey, "2026-07-31");
    assert.notEqual(second.id, first.id);
    const view = service.get(campaign.id, identity());
    assert.equal(view.currentEntry?.id, second.id);
    assert.deepEqual(view.myEntries.map((entry) => entry.id), [second.id, first.id]);
  } finally {
    store.close();
  }
});

test("once-per-campaign lottery remains unavailable after the day changes", async () => {
  const store = createSqliteLotteryStore("file::memory:");
  let now = new Date("2026-07-30T10:00:00.000Z");
  const service = createLotteryService({
    store,
    now: () => now,
    id: () => crypto.randomUUID(),
    random: (maximum) => maximum - 1,
    eligibility: eligibility(),
    rewards: rewards(),
  });
  try {
    const campaign = service.create(campaignInput({}));
    assert.equal(campaign.participationMode, "once");
    const first = await service.enter(campaign.id, identity());
    now = new Date("2026-08-02T10:00:00.000Z");
    const repeated = await service.enter(campaign.id, identity());
    assert.equal(repeated.id, first.id);
    assert.equal(repeated.participationKey, "campaign");
    assert.equal(store.listEntries(campaign.id).length, 1);
    assert.equal(service.get(campaign.id, identity()).currentEntry?.id, first.id);
  } finally {
    store.close();
  }
});

test("daily scheduled participation and withdrawal only affect the current day", async () => {
  const store = createSqliteLotteryStore("file::memory:");
  let now = new Date("2026-07-30T10:00:00.000Z");
  const service = createLotteryService({
    store,
    now: () => now,
    id: () => crypto.randomUUID(),
    random: () => 0,
    eligibility: eligibility(),
    rewards: rewards(),
  });
  try {
    const campaign = service.create(campaignInput({
      drawMode: "scheduled",
      participationMode: "daily",
      drawAt: "2026-08-02T00:00:00.000Z",
      prizes: [{ name: "余额", type: "balance", value: 5, quantity: 1, probability: null }],
    }));
    const first = await service.enter(campaign.id, identity());
    now = new Date("2026-07-31T10:00:00.000Z");
    const second = await service.enter(campaign.id, identity());
    assert.notEqual(second.id, first.id);
    assert.equal(service.withdraw(campaign.id, identity()).id, second.id);
    assert.deepEqual(store.listEntries(campaign.id).map((entry) => entry.status), ["entered", "withdrawn"]);
    assert.equal((await service.enter(campaign.id, identity())).id, second.id);
    assert.deepEqual(store.listEntries(campaign.id).map((entry) => entry.status), ["entered", "entered"]);
  } finally {
    store.close();
  }
});

test("legacy lottery entries migrate to the campaign participation window", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`CREATE TABLE embed_lottery_campaigns (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL,
    draw_mode TEXT NOT NULL CHECK (draw_mode IN ('instant', 'scheduled')),
    status TEXT NOT NULL CHECK (status IN ('scheduled', 'open', 'drawing', 'drawn', 'exhausted', 'cancelled')),
    registration_start TEXT, registration_end TEXT, draw_at TEXT,
    visible_to_users INTEGER NOT NULL DEFAULT 1 CHECK (visible_to_users IN (0, 1)),
    eligibility_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(eligibility_json)),
    public_winners INTEGER NOT NULL CHECK (public_winners IN (0, 1)),
    prizes_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    drawn_at TEXT, last_error TEXT
  ) STRICT;
  CREATE TABLE embed_lottery_entries (
    id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, sub2api_user_id TEXT NOT NULL,
    masked_email TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('entered', 'won', 'not_won', 'withdrawn')),
    prize_id TEXT, prize_name TEXT,
    prize_type TEXT CHECK (prize_type IN ('balance', 'subscription')), prize_value REAL,
    redemption_code TEXT, reward_code_id INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE (campaign_id, sub2api_user_id),
    FOREIGN KEY (campaign_id) REFERENCES embed_lottery_campaigns(id) ON DELETE CASCADE
  ) STRICT`);
  database.prepare(`INSERT INTO embed_lottery_campaigns
    (id, name, description, draw_mode, status, visible_to_users, eligibility_json,
      public_winners, prizes_json, created_at, updated_at)
    VALUES ('legacy', '旧活动', '', 'instant', 'open', 1, '[]', 0, '[]', ?, ?)`)
    .run("2026-07-30T00:00:00.000Z", "2026-07-30T00:00:00.000Z");
  database.prepare(`INSERT INTO embed_lottery_entries
    (id, campaign_id, sub2api_user_id, masked_email, status, prize_name, prize_type,
      prize_value, redemption_code, reward_code_id, created_at, updated_at)
    VALUES ('entry-1', 'legacy', 'user-1', 'u***@example.com', 'won', '余额', 'balance',
      10, 'KEPT-CODE', 7, ?, ?)`)
    .run("2026-07-30T01:00:00.000Z", "2026-07-30T01:00:00.000Z");
  try {
    ensureEmbedSchema(database);
    const campaign = database.prepare("SELECT participation_mode FROM embed_lottery_campaigns WHERE id = 'legacy'")
      .get() as { participation_mode: string };
    const entry = database.prepare("SELECT participation_key, redemption_code FROM embed_lottery_entries WHERE id = 'entry-1'")
      .get() as { participation_key: string; redemption_code: string };
    assert.equal(campaign.participation_mode, "once");
    assert.equal(entry.participation_key, "campaign");
    assert.equal(entry.redemption_code, "KEPT-CODE");
    database.prepare(`INSERT INTO embed_lottery_entries
      (id, campaign_id, sub2api_user_id, participation_key, masked_email, status, created_at, updated_at)
      VALUES ('entry-2', 'legacy', 'user-1', '2026-07-31', 'u***@example.com', 'not_won', ?, ?)`)
      .run("2026-07-31T01:00:00.000Z", "2026-07-31T01:00:00.000Z");
  } finally {
    database.close();
  }
});

test("participation keys use the Shanghai calendar date", () => {
  assert.equal(lotteryParticipationKey("daily", new Date("2026-01-01T15:59:59.000Z")), "2026-01-01");
  assert.equal(lotteryParticipationKey("daily", new Date("2026-01-01T16:00:00.000Z")), "2026-01-02");
});

function campaignInput(overrides: Record<string, unknown>) {
  return {
    name: "参与频率测试", description: "", drawMode: "instant",
    registrationStart: null, registrationEnd: null, drawAt: null,
    visibleToUsers: true, eligibilityConditions: [], publicWinners: false,
    prizes: [{ name: "余额", type: "balance", value: 5, quantity: 10, probability: 1 }],
    ...overrides,
  };
}

function identity(): EmbedIdentity {
  return {
    kind: "lottery", embedToken: "token", srcHost: "https://target.example.com", srcUrl: "",
    sub2apiUserId: "user-1", sub2apiEmail: "user-1@example.com", sub2apiRole: "user", sub2apiBalance: 30,
  };
}

function eligibility() {
  return {
    currentBalance: async () => 30,
    redeemedToday: async () => true,
    invitedToday: async () => true,
  };
}

function rewards() {
  return { generate: async () => [{ id: 1, code: "reward", type: "balance" as const, value: 5 }] };
}
