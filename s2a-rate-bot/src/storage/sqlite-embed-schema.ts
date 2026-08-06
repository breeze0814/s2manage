import type { DatabaseSync } from "node:sqlite";
import { DEFAULT_LOTTERY_ELIGIBILITY_CONDITIONS } from "../core/lottery-eligibility.ts";

export const EMBED_SCHEMA_VERSION = 31;
const DEFAULT_LOTTERY_ELIGIBILITY_JSON = JSON.stringify(DEFAULT_LOTTERY_ELIGIBILITY_CONDITIONS);

export function ensureEmbedSchema(database: DatabaseSync) {
  for (const statement of EMBED_TABLES) database.exec(statement);
  migrateEmbedConfigKind(database);
  migrateTicketStatus(database);
  migrateLotteryCampaignStatus(database);
  ensureLotteryCampaignColumns(database);
  ensureLotteryRewardColumns(database);
  migrateLotteryEntryParticipation(database);
}

const EMBED_TABLES = [
  `CREATE TABLE IF NOT EXISTS embed_configs (
    kind TEXT PRIMARY KEY CHECK (kind IN ('tickets', 'leaderboard', 'lottery', 'compensation')),
    embed_token TEXT NOT NULL UNIQUE,
    config_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS embed_tickets (
    id TEXT PRIMARY KEY,
    src_host TEXT NOT NULL,
    src_url TEXT NOT NULL,
    sub2api_user_id TEXT NOT NULL,
    sub2api_email TEXT NOT NULL,
    sub2api_role TEXT NOT NULL,
    manual_email TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('open', 'pending', 'replied', 'closed')),
    category TEXT NOT NULL,
    priority TEXT NOT NULL,
    last_message_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT`,
  `CREATE INDEX IF NOT EXISTS embed_tickets_user
    ON embed_tickets (src_host, sub2api_user_id, last_message_at DESC)`,
  `CREATE TABLE IF NOT EXISTS embed_ticket_messages (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL,
    author_type TEXT NOT NULL CHECK (author_type IN ('customer', 'admin')),
    author_name TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (ticket_id) REFERENCES embed_tickets(id) ON DELETE CASCADE
  ) STRICT`,
  `CREATE INDEX IF NOT EXISTS embed_ticket_messages_ticket
    ON embed_ticket_messages (ticket_id, created_at, id)`,
  `CREATE TABLE IF NOT EXISTS embed_ticket_attachments (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    original_name TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    data BLOB NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (ticket_id) REFERENCES embed_tickets(id) ON DELETE CASCADE,
    FOREIGN KEY (message_id) REFERENCES embed_ticket_messages(id) ON DELETE CASCADE
  ) STRICT`,
  `CREATE INDEX IF NOT EXISTS embed_ticket_attachments_message
    ON embed_ticket_attachments (message_id, created_at, id)`,
  `CREATE TABLE IF NOT EXISTS embed_lottery_campaigns (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    draw_mode TEXT NOT NULL CHECK (draw_mode IN ('instant', 'scheduled')),
    participation_mode TEXT NOT NULL DEFAULT 'once' CHECK (participation_mode IN ('daily', 'once')),
    status TEXT NOT NULL CHECK (status IN ('scheduled', 'open', 'drawing', 'drawn', 'exhausted', 'cancelled')),
    registration_start TEXT,
    registration_end TEXT,
    draw_at TEXT,
    visible_to_users INTEGER NOT NULL DEFAULT 1 CHECK (visible_to_users IN (0, 1)),
    eligibility_json TEXT NOT NULL DEFAULT '${DEFAULT_LOTTERY_ELIGIBILITY_JSON}' CHECK (json_valid(eligibility_json)),
    public_winners INTEGER NOT NULL CHECK (public_winners IN (0, 1)),
    prizes_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    drawn_at TEXT,
    last_error TEXT
  ) STRICT`,
  `CREATE INDEX IF NOT EXISTS embed_lottery_campaigns_due
    ON embed_lottery_campaigns (status, draw_mode, draw_at)`,
  `CREATE TABLE IF NOT EXISTS embed_lottery_entries (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL,
    sub2api_user_id TEXT NOT NULL,
    participation_key TEXT NOT NULL,
    masked_email TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('entered', 'won', 'not_won', 'withdrawn')),
    prize_id TEXT,
    prize_name TEXT,
    prize_type TEXT CHECK (prize_type IN ('balance', 'subscription')),
    prize_value REAL,
    redemption_code TEXT,
    reward_code_id INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (campaign_id, sub2api_user_id, participation_key),
    FOREIGN KEY (campaign_id) REFERENCES embed_lottery_campaigns(id) ON DELETE CASCADE
  ) STRICT`,
  `CREATE INDEX IF NOT EXISTS embed_lottery_entries_campaign
    ON embed_lottery_entries (campaign_id, status, created_at)`,
  `CREATE TABLE IF NOT EXISTS embed_compensation_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
    activity_name TEXT NOT NULL,
    description TEXT NOT NULL,
    base_url TEXT NOT NULL,
    username TEXT NOT NULL,
    password_enc TEXT NOT NULL,
    rules_json TEXT NOT NULL CHECK (json_valid(rules_json)),
    updated_at TEXT NOT NULL
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS embed_compensation_claims (
    id TEXT PRIMARY KEY,
    src_host TEXT NOT NULL,
    sub2api_user_id TEXT NOT NULL,
    masked_email TEXT NOT NULL,
    store_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
    results_json TEXT NOT NULL CHECK (json_valid(results_json)),
    eligible_order_count INTEGER NOT NULL,
    invalid_order_count INTEGER NOT NULL,
    total_compensation_fen INTEGER NOT NULL,
    redemption_code TEXT,
    reward_code_id INTEGER,
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT`,
  `CREATE INDEX IF NOT EXISTS embed_compensation_claims_recent
    ON embed_compensation_claims (created_at DESC, id DESC)`,
] as const;

function migrateEmbedConfigKind(database: DatabaseSync) {
  const row = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'embed_configs'")
    .get() as { sql?: string } | undefined;
  if (!row?.sql || row.sql.includes("'compensation'")) return;
  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec(EMBED_TABLES[0].replace("embed_configs", "embed_configs_new"));
    database.exec(`INSERT INTO embed_configs_new
      (kind, embed_token, config_json, created_at, updated_at)
      SELECT kind, embed_token, config_json, created_at, updated_at FROM embed_configs`);
    database.exec("DROP TABLE embed_configs");
    database.exec("ALTER TABLE embed_configs_new RENAME TO embed_configs");
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function migrateTicketStatus(database: DatabaseSync) {
  const row = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'embed_tickets'").get() as { sql?: string } | undefined;
  if (!row?.sql || row.sql.includes("'replied'")) return;
  database.exec("PRAGMA foreign_keys = OFF");
  try {
    database.exec("BEGIN IMMEDIATE");
    database.exec(EMBED_TABLES[1].replace("embed_tickets", "embed_tickets_new"));
    database.exec(`INSERT INTO embed_tickets_new SELECT * FROM embed_tickets`);
    database.exec("DROP TABLE embed_tickets");
    database.exec("ALTER TABLE embed_tickets_new RENAME TO embed_tickets");
    database.exec(EMBED_TABLES[2]);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  } finally {
    database.exec("PRAGMA foreign_keys = ON");
  }
}

function migrateLotteryCampaignStatus(database: DatabaseSync) {
  const row = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'embed_lottery_campaigns'").get() as { sql?: string } | undefined;
  if (!row?.sql || row.sql.includes("'drawing'")) return;
  const hasLastError = tableColumns(database, "embed_lottery_campaigns").has("last_error");
  database.exec("PRAGMA foreign_keys = OFF");
  try {
    database.exec("BEGIN IMMEDIATE");
    database.exec(EMBED_TABLES[7].replace("embed_lottery_campaigns", "embed_lottery_campaigns_new"));
    const lastError = hasLastError ? "last_error" : "NULL";
    database.exec(`INSERT INTO embed_lottery_campaigns_new
      (id, name, description, draw_mode, status, registration_start, registration_end, draw_at,
        public_winners, prizes_json, created_at, updated_at, drawn_at, last_error)
      SELECT id, name, description, draw_mode, status, registration_start, registration_end, draw_at,
        public_winners, prizes_json, created_at, updated_at, drawn_at, ${lastError}
      FROM embed_lottery_campaigns`);
    database.exec("DROP TABLE embed_lottery_campaigns");
    database.exec("ALTER TABLE embed_lottery_campaigns_new RENAME TO embed_lottery_campaigns");
    database.exec(EMBED_TABLES[8]);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  } finally {
    database.exec("PRAGMA foreign_keys = ON");
  }
}

function ensureLotteryRewardColumns(database: DatabaseSync) {
  const names = tableColumns(database, "embed_lottery_entries");
  const additions = [
    ["prize_type", "TEXT CHECK (prize_type IN ('balance', 'subscription'))"],
    ["prize_value", "REAL"],
    ["redemption_code", "TEXT"],
    ["reward_code_id", "INTEGER"],
  ] as const;
  for (const [name, definition] of additions) {
    if (!names.has(name)) database.exec(`ALTER TABLE embed_lottery_entries ADD COLUMN ${name} ${definition}`);
  }
}

function ensureLotteryCampaignColumns(database: DatabaseSync) {
  const names = tableColumns(database, "embed_lottery_campaigns");
  const additions = [
    ["visible_to_users", "INTEGER NOT NULL DEFAULT 1 CHECK (visible_to_users IN (0, 1))"],
    ["eligibility_json", `TEXT NOT NULL DEFAULT '${DEFAULT_LOTTERY_ELIGIBILITY_JSON}' CHECK (json_valid(eligibility_json))`],
    ["participation_mode", "TEXT NOT NULL DEFAULT 'once' CHECK (participation_mode IN ('daily', 'once'))"],
  ] as const;
  for (const [name, definition] of additions) {
    if (!names.has(name)) database.exec(`ALTER TABLE embed_lottery_campaigns ADD COLUMN ${name} ${definition}`);
  }
}

function migrateLotteryEntryParticipation(database: DatabaseSync) {
  const row = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'embed_lottery_entries'")
    .get() as { sql?: string } | undefined;
  if (!row?.sql || row.sql.includes("participation_key")) return;
  database.exec("PRAGMA foreign_keys = OFF");
  try {
    database.exec("BEGIN IMMEDIATE");
    database.exec(EMBED_TABLES[9].replace("embed_lottery_entries", "embed_lottery_entries_new"));
    database.exec(`INSERT INTO embed_lottery_entries_new
      (id, campaign_id, sub2api_user_id, participation_key, masked_email, status, prize_id,
        prize_name, prize_type, prize_value, redemption_code, reward_code_id, created_at, updated_at)
      SELECT id, campaign_id, sub2api_user_id, 'campaign', masked_email, status, prize_id,
        prize_name, prize_type, prize_value, redemption_code, reward_code_id, created_at, updated_at
      FROM embed_lottery_entries`);
    database.exec("DROP TABLE embed_lottery_entries");
    database.exec("ALTER TABLE embed_lottery_entries_new RENAME TO embed_lottery_entries");
    database.exec(EMBED_TABLES[10]);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  } finally {
    database.exec("PRAGMA foreign_keys = ON");
  }
}

function tableColumns(database: DatabaseSync, table: string) {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return new Set(columns.map((column) => column.name));
}
