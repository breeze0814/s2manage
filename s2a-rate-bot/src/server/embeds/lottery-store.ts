import { DatabaseSync } from "node:sqlite";
import { initializeSqliteSchema } from "../../storage/sqlite-schema.ts";
import { ensureDatabaseDirectory, flag, sqlitePath, transaction } from "../../storage/sqlite-utils.ts";
import {
  finishDraw, recordDrawError, resumeDraw, saveDrawPlan, savePlannedReward, startDraw,
  type DrawAssignment,
} from "./lottery-draw-store.ts";
import type { RewardCode } from "./reward-code-gateway.ts";
import { parseEligibilityConditions } from "./lottery-validation.ts";
import { EmbedError, type LotteryCampaign, type LotteryEntry, type LotteryPrize } from "./types.ts";

export type StoredCampaign = Omit<LotteryCampaign,
  "entryCount" | "winnerCount" | "currentEntry" | "myEntries" | "winners" | "prizeInventory">;
export type NewCampaign = StoredCampaign;
export type { DrawAssignment } from "./lottery-draw-store.ts";
export type LotteryStore = ReturnType<typeof createSqliteLotteryStore>;

export function createSqliteLotteryStore(databaseUrl: string) {
  const path = sqlitePath(databaseUrl);
  ensureDatabaseDirectory(path);
  const database = new DatabaseSync(path, { timeout: 5_000 });
  initializeSqliteSchema(database);
  return {
    listCampaigns: () => listCampaigns(database),
    getCampaign: (id: string) => readCampaign(database, id),
    createCampaign: (campaign: NewCampaign) => insertCampaign(database, campaign),
    updateCampaign: (campaign: StoredCampaign) => updateCampaign(database, campaign),
    setCampaignVisibility: (id: string, visible: boolean, at: string) => setVisibility(database, { id, visible, timestamp: at }),
    setCampaignStatus: (id: string, status: TransitionStatus, at: string) => setStatus(database, { id, status, timestamp: at }),
    listEntries: (campaignId: string) => listEntries(database, campaignId),
    getEntry: (campaignId: string, userId: string, participationKey: string) => readEntry(database, campaignId, userId, participationKey),
    enter: (entry: LotteryEntry) => enterScheduled(database, entry),
    recordInstantLoss: (entry: LotteryEntry) => recordInstantLoss(database, entry),
    reserveInstant: (entry: LotteryEntry, prize: LotteryPrize) => reserveInstant(database, entry, prize),
    completeInstant: (entryId: string, reward: RewardCode, at: string) => completeInstant(database, { entryId, reward, timestamp: at }),
    releaseInstant: (entryId: string) => releaseInstant(database, entryId),
    withdraw: (campaignId: string, userId: string, participationKey: string, at: string) => withdraw(database, { campaignId, userId, participationKey, timestamp: at }),
    startDraw: (campaignId: string, at: string) => startDraw(database, campaignId, at),
    resumeDraw: (campaignId: string, at: string) => resumeDraw(database, campaignId, at),
    saveDrawPlan: (campaignId: string, winners: readonly DrawAssignment[], at: string) => saveDrawPlan(database, { campaignId, winners, timestamp: at }),
    savePlannedReward: (entryId: string, reward: RewardCode, at: string) => savePlannedReward(database, { entryId, reward, timestamp: at }),
    finishDraw: (campaignId: string, at: string) => finishDraw(database, campaignId, at),
    recordDrawError: (campaignId: string, error: string, at: string) => recordDrawError(database, { campaignId, error, timestamp: at }),
    close: () => database.close(),
  };
}

function listCampaigns(database: DatabaseSync) {
  return (database.prepare("SELECT * FROM embed_lottery_campaigns ORDER BY created_at DESC, id DESC").all() as CampaignRow[]).map(mapCampaign);
}

function readCampaign(database: DatabaseSync, id: string) {
  const row = database.prepare("SELECT * FROM embed_lottery_campaigns WHERE id = ?").get(id) as CampaignRow | undefined;
  return row ? mapCampaign(row) : null;
}

function insertCampaign(database: DatabaseSync, campaign: NewCampaign) {
  database.prepare(`INSERT INTO embed_lottery_campaigns
    (id, name, description, draw_mode, participation_mode, status, registration_start, registration_end, draw_at,
      visible_to_users, eligibility_json, public_winners, prizes_json, created_at, updated_at, drawn_at, last_error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(campaign.id, campaign.name, campaign.description, campaign.drawMode, campaign.participationMode, campaign.status,
      campaign.registrationStart, campaign.registrationEnd, campaign.drawAt, flag(campaign.visibleToUsers),
      JSON.stringify(campaign.eligibilityConditions), flag(campaign.publicWinners), JSON.stringify(campaign.prizes), campaign.createdAt,
      campaign.updatedAt, campaign.drawnAt, campaign.lastError);
  return requiredCampaign(database, campaign.id);
}

function updateCampaign(database: DatabaseSync, campaign: StoredCampaign) {
  const result = database.prepare(`UPDATE embed_lottery_campaigns SET name = ?, description = ?,
    draw_mode = ?, participation_mode = ?, status = ?, registration_start = ?, registration_end = ?, draw_at = ?,
    visible_to_users = ?, eligibility_json = ?, public_winners = ?, prizes_json = ?, updated_at = ? WHERE id = ?
    AND NOT EXISTS (SELECT 1 FROM embed_lottery_entries WHERE campaign_id = ? AND status != 'withdrawn')`)
    .run(campaign.name, campaign.description, campaign.drawMode, campaign.participationMode, campaign.status,
      campaign.registrationStart, campaign.registrationEnd, campaign.drawAt, flag(campaign.visibleToUsers),
      JSON.stringify(campaign.eligibilityConditions), flag(campaign.publicWinners), JSON.stringify(campaign.prizes), campaign.updatedAt,
      campaign.id, campaign.id);
  return result.changes === 1 ? requiredCampaign(database, campaign.id) : null;
}

function setVisibility(database: DatabaseSync, change: Readonly<{
  id: string; visible: boolean; timestamp: string;
}>) {
  const result = database.prepare(`UPDATE embed_lottery_campaigns
    SET visible_to_users = ?, updated_at = ? WHERE id = ?`)
    .run(flag(change.visible), change.timestamp, change.id);
  return result.changes === 1 ? requiredCampaign(database, change.id) : null;
}

function setStatus(database: DatabaseSync, change: Readonly<{
  id: string; status: TransitionStatus; timestamp: string;
}>) {
  const expected = change.status === "open" ? "status = 'scheduled'" : "status IN ('scheduled', 'open')";
  const drawnAt = change.status === "drawn" ? change.timestamp : null;
  const result = database.prepare(`UPDATE embed_lottery_campaigns
    SET status = ?, drawn_at = COALESCE(?, drawn_at), last_error = NULL, updated_at = ?
    WHERE id = ? AND ${expected}`)
    .run(change.status, drawnAt, change.timestamp, change.id);
  return result.changes === 1 ? requiredCampaign(database, change.id) : null;
}

function listEntries(database: DatabaseSync, campaignId: string) {
  return (database.prepare(`SELECT * FROM embed_lottery_entries
    WHERE campaign_id = ? ORDER BY created_at, id`).all(campaignId) as EntryRow[]).map(mapEntry);
}

function readEntry(database: DatabaseSync, campaignId: string, userId: string, participationKey: string) {
  const row = database.prepare(`SELECT * FROM embed_lottery_entries
    WHERE campaign_id = ? AND sub2api_user_id = ? AND participation_key = ?`)
    .get(campaignId, userId, participationKey) as EntryRow | undefined;
  return row ? mapEntry(row) : null;
}

function insertEntry(database: DatabaseSync, entry: LotteryEntry) {
  database.prepare(`INSERT INTO embed_lottery_entries
    (id, campaign_id, sub2api_user_id, participation_key, masked_email, status, prize_id, prize_name, prize_type,
      prize_value, redemption_code, reward_code_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(...entryValues(entry));
  return requiredEntry(database, entry.campaignId, entry.sub2apiUserId, entry.participationKey);
}

function enterScheduled(database: DatabaseSync, entry: LotteryEntry) {
  const current = readEntry(database, entry.campaignId, entry.sub2apiUserId, entry.participationKey);
  if (current?.status === "entered") return current;
  if (!current) return insertEntry(database, entry);
  const result = database.prepare(`UPDATE embed_lottery_entries SET status = 'entered', masked_email = ?,
    prize_id = NULL, prize_name = NULL, prize_type = NULL, prize_value = NULL,
    redemption_code = NULL, reward_code_id = NULL, updated_at = ?
    WHERE campaign_id = ? AND sub2api_user_id = ? AND participation_key = ? AND status = 'withdrawn'`)
    .run(entry.maskedEmail, entry.updatedAt, entry.campaignId, entry.sub2apiUserId, entry.participationKey);
  if (result.changes !== 1) throw new EmbedError("当前抽奖记录不能重新报名", 409);
  return requiredEntry(database, entry.campaignId, entry.sub2apiUserId, entry.participationKey);
}

function recordInstantLoss(database: DatabaseSync, entry: LotteryEntry) {
  let result: LotteryEntry | null = null;
  transaction(database, () => {
    assertInstantCampaignOpen(database, entry.campaignId);
    if (readEntry(database, entry.campaignId, entry.sub2apiUserId, entry.participationKey)) {
      throw new EmbedError("用户已有抽奖记录，请勿重复提交", 409);
    }
    result = insertEntry(database, { ...entry, status: "not_won" });
  });
  if (!result) throw new Error("即时抽奖未中奖记录写入失败");
  return result;
}

function reserveInstant(database: DatabaseSync, entry: LotteryEntry, prize: LotteryPrize): LotteryEntry | null {
  let reserved: LotteryEntry | null = null;
  transaction(database, () => {
    assertInstantCampaignOpen(database, entry.campaignId);
    if (readEntry(database, entry.campaignId, entry.sub2apiUserId, entry.participationKey)) {
      throw new EmbedError("用户已有抽奖记录，请勿重复提交", 409);
    }
    const row = database.prepare(`SELECT COUNT(*) AS count FROM embed_lottery_entries
      WHERE campaign_id = ? AND prize_id = ? AND status IN ('entered', 'won')`)
      .get(entry.campaignId, prize.id) as { count: number };
    if (Number(row.count) >= prize.quantity) return;
    insertEntry(database, { ...entry, prizeId: prize.id, prizeName: prize.name,
      prizeType: prize.type, prizeValue: prize.value });
    reserved = requiredEntry(database, entry.campaignId, entry.sub2apiUserId, entry.participationKey);
  });
  return reserved;
}

function assertInstantCampaignOpen(database: DatabaseSync, campaignId: string) {
  const row = database.prepare("SELECT draw_mode, status FROM embed_lottery_campaigns WHERE id = ?")
    .get(campaignId) as { draw_mode: string; status: string } | undefined;
  if (!row) throw new EmbedError("抽奖活动不存在", 404);
  if (row.draw_mode !== "instant" || row.status !== "open") {
    throw new EmbedError("即时抽奖活动状态已变化", 409);
  }
}

function completeInstant(database: DatabaseSync, completion: Readonly<{
  entryId: string; reward: RewardCode; timestamp: string;
}>) {
  transaction(database, () => {
    const result = database.prepare(`UPDATE embed_lottery_entries SET status = 'won', redemption_code = ?,
      reward_code_id = ?, updated_at = ? WHERE id = ? AND status = 'entered'`)
      .run(completion.reward.code, completion.reward.id, completion.timestamp, completion.entryId);
    if (result.changes !== 1) throw new EmbedError("即时抽奖状态已变化，无法完成开奖", 409);
    closeExhaustedCampaign(database, completion.entryId, completion.timestamp);
  });
}

function closeExhaustedCampaign(database: DatabaseSync, entryId: string, timestamp: string) {
  const entry = database.prepare("SELECT campaign_id FROM embed_lottery_entries WHERE id = ?")
    .get(entryId) as { campaign_id: string };
  const campaign = requiredCampaign(database, entry.campaign_id);
  const won = database.prepare(`SELECT COUNT(*) AS count FROM embed_lottery_entries
    WHERE campaign_id = ? AND status = 'won'`).get(campaign.id) as { count: number };
  const inventory = campaign.prizes.reduce((sum, prize) => sum + prize.quantity, 0);
  if (Number(won.count) < inventory) return;
  setStatus(database, { id: campaign.id, status: "exhausted", timestamp });
}

function releaseInstant(database: DatabaseSync, entryId: string) {
  database.prepare("DELETE FROM embed_lottery_entries WHERE id = ? AND status = 'entered'").run(entryId);
}

function withdraw(database: DatabaseSync, withdrawal: Readonly<{
  campaignId: string; userId: string; participationKey: string; timestamp: string;
}>) {
  const result = database.prepare(`UPDATE embed_lottery_entries SET status = 'withdrawn', updated_at = ?
    WHERE campaign_id = ? AND sub2api_user_id = ? AND participation_key = ? AND status = 'entered'`)
    .run(withdrawal.timestamp, withdrawal.campaignId, withdrawal.userId, withdrawal.participationKey);
  return result.changes === 1
    ? requiredEntry(database, withdrawal.campaignId, withdrawal.userId, withdrawal.participationKey)
    : null;
}

function mapCampaign(row: CampaignRow): StoredCampaign {
  const prizes = parsePrizes(row.prizes_json, row.id);
  return {
    id: row.id, name: row.name, description: row.description, drawMode: row.draw_mode,
    participationMode: row.participation_mode,
    status: row.status, registrationStart: row.registration_start, registrationEnd: row.registration_end,
    drawAt: row.draw_at, visibleToUsers: row.visible_to_users === 1,
    eligibilityConditions: storedEligibility(row.eligibility_json, row.id),
    publicWinners: row.public_winners === 1, prizes,
    createdAt: row.created_at, updatedAt: row.updated_at, drawnAt: row.drawn_at,
    lastError: row.last_error,
  };
}

function parsePrizes(value: string, campaignId: string) {
  const prizes = JSON.parse(value) as unknown;
  if (!Array.isArray(prizes) || prizes.some((item) => !validPrize(item))) {
    throw new Error(`抽奖活动 ${campaignId} 的奖品配置不是当前版本，请重新创建活动`);
  }
  return prizes.map((item) => ({ ...item, probability: item.probability ?? null })) as LotteryPrize[];
}

function storedEligibility(value: string, campaignId: string) {
  try {
    return parseEligibilityConditions(JSON.parse(value));
  } catch {
    throw new Error(`抽奖活动 ${campaignId} 的参与条件配置无效，请重新保存活动`);
  }
}

function validPrize(value: unknown): value is LotteryPrize {
  if (!value || typeof value !== "object") return false;
  const prize = value as Record<string, unknown>;
  return typeof prize.id === "string" && typeof prize.name === "string"
    && (prize.type === "balance" || prize.type === "subscription")
    && typeof prize.value === "number" && typeof prize.quantity === "number"
    && (typeof prize.probability === "number" || prize.probability === null || prize.probability === undefined);
}

function mapEntry(row: EntryRow): LotteryEntry {
  return {
    id: row.id, campaignId: row.campaign_id, participationKey: row.participation_key,
    sub2apiUserId: row.sub2api_user_id,
    maskedEmail: row.masked_email, status: row.status, prizeId: row.prize_id,
    prizeName: row.prize_name, prizeType: row.prize_type, prizeValue: row.prize_value,
    redemptionCode: row.redemption_code, rewardCodeId: row.reward_code_id,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function entryValues(entry: LotteryEntry) {
  return [entry.id, entry.campaignId, entry.sub2apiUserId, entry.participationKey, entry.maskedEmail, entry.status,
    entry.prizeId, entry.prizeName, entry.prizeType, entry.prizeValue, entry.redemptionCode,
    entry.rewardCodeId, entry.createdAt, entry.updatedAt] as const;
}

function requiredCampaign(database: DatabaseSync, id: string) {
  const campaign = readCampaign(database, id);
  if (!campaign) throw new Error("抽奖活动不存在");
  return campaign;
}

function requiredEntry(database: DatabaseSync, campaignId: string, userId: string, participationKey: string) {
  const entry = readEntry(database, campaignId, userId, participationKey);
  if (!entry) throw new Error("抽奖记录不存在");
  return entry;
}

type TransitionStatus = "open" | "drawn" | "exhausted" | "cancelled";
type CampaignRow = { readonly id: string; readonly name: string; readonly description: string; readonly draw_mode: StoredCampaign["drawMode"]; readonly participation_mode: StoredCampaign["participationMode"]; readonly status: StoredCampaign["status"]; readonly registration_start: string | null; readonly registration_end: string | null; readonly draw_at: string | null; readonly visible_to_users: number; readonly eligibility_json: string; readonly public_winners: number; readonly prizes_json: string; readonly created_at: string; readonly updated_at: string; readonly drawn_at: string | null; readonly last_error: string | null };
type EntryRow = { readonly id: string; readonly campaign_id: string; readonly sub2api_user_id: string; readonly participation_key: string; readonly masked_email: string; readonly status: LotteryEntry["status"]; readonly prize_id: string | null; readonly prize_name: string | null; readonly prize_type: LotteryPrize["type"] | null; readonly prize_value: number | null; readonly redemption_code: string | null; readonly reward_code_id: number | null; readonly created_at: string; readonly updated_at: string };
