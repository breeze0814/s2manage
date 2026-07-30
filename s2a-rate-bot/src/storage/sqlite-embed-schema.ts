import type { DatabaseSync } from "node:sqlite";

export const EMBED_SCHEMA_VERSION = 20;

export function ensureEmbedSchema(database: DatabaseSync) {
  for (const statement of EMBED_TABLES) database.exec(statement);
}

const EMBED_TABLES = [
  `CREATE TABLE IF NOT EXISTS embed_configs (
    kind TEXT PRIMARY KEY CHECK (kind IN ('tickets', 'leaderboard', 'lottery')),
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
    status TEXT NOT NULL CHECK (status IN ('open', 'pending', 'closed')),
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
  `CREATE TABLE IF NOT EXISTS embed_lottery_campaigns (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    draw_mode TEXT NOT NULL CHECK (draw_mode IN ('instant', 'scheduled')),
    status TEXT NOT NULL CHECK (status IN ('scheduled', 'open', 'drawn', 'cancelled')),
    registration_start TEXT,
    registration_end TEXT,
    draw_at TEXT,
    public_winners INTEGER NOT NULL CHECK (public_winners IN (0, 1)),
    prizes_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    drawn_at TEXT
  ) STRICT`,
  `CREATE INDEX IF NOT EXISTS embed_lottery_campaigns_due
    ON embed_lottery_campaigns (status, draw_mode, draw_at)`,
  `CREATE TABLE IF NOT EXISTS embed_lottery_entries (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL,
    sub2api_user_id TEXT NOT NULL,
    masked_email TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('entered', 'won', 'not_won', 'withdrawn')),
    prize_id TEXT,
    prize_name TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (campaign_id, sub2api_user_id),
    FOREIGN KEY (campaign_id) REFERENCES embed_lottery_campaigns(id) ON DELETE CASCADE
  ) STRICT`,
  `CREATE INDEX IF NOT EXISTS embed_lottery_entries_campaign
    ON embed_lottery_entries (campaign_id, status, created_at)`,
] as const;
