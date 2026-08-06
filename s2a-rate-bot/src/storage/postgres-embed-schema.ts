export const POSTGRES_EMBED_SCHEMA = `
CREATE TABLE IF NOT EXISTS embed_configs (
  kind text PRIMARY KEY CHECK (kind IN ('tickets','leaderboard','lottery','compensation')),
  embed_token text NOT NULL UNIQUE, config_json text NOT NULL, created_at text NOT NULL, updated_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS embed_tickets (
  id text PRIMARY KEY, src_host text NOT NULL, src_url text NOT NULL, sub2api_user_id text NOT NULL,
  sub2api_email text NOT NULL, sub2api_role text NOT NULL, manual_email text NOT NULL,
  title text NOT NULL, status text NOT NULL CHECK (status IN ('open','pending','replied','closed')),
  category text NOT NULL, priority text NOT NULL, last_message_at text NOT NULL,
  created_at text NOT NULL, updated_at text NOT NULL
);
CREATE INDEX IF NOT EXISTS embed_tickets_user ON embed_tickets (src_host,sub2api_user_id,last_message_at DESC);
CREATE TABLE IF NOT EXISTS embed_ticket_messages (
  id text PRIMARY KEY, ticket_id text NOT NULL REFERENCES embed_tickets(id) ON DELETE CASCADE,
  author_type text NOT NULL CHECK (author_type IN ('customer','admin')),
  author_name text NOT NULL, body text NOT NULL, created_at text NOT NULL
);
CREATE INDEX IF NOT EXISTS embed_ticket_messages_ticket ON embed_ticket_messages (ticket_id,created_at,id);
CREATE TABLE IF NOT EXISTS embed_ticket_attachments (
  id text PRIMARY KEY, ticket_id text NOT NULL REFERENCES embed_tickets(id) ON DELETE CASCADE,
  message_id text NOT NULL REFERENCES embed_ticket_messages(id) ON DELETE CASCADE,
  original_name text NOT NULL, content_type text NOT NULL, size_bytes integer NOT NULL,
  data bytea NOT NULL, created_at text NOT NULL
);
CREATE INDEX IF NOT EXISTS embed_ticket_attachments_message
  ON embed_ticket_attachments (message_id,created_at,id);
CREATE TABLE IF NOT EXISTS embed_compensation_settings (
  id integer PRIMARY KEY CHECK (id = 1), enabled integer NOT NULL CHECK (enabled IN (0,1)),
  activity_name text NOT NULL, description text NOT NULL,
  order_source text NOT NULL DEFAULT 'url' CHECK (order_source IN ('json','url')), base_url text NOT NULL,
  username text NOT NULL, password_enc text NOT NULL, rules_json text NOT NULL, updated_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS embed_compensation_claims (
  id text PRIMARY KEY, src_host text NOT NULL, sub2api_user_id text NOT NULL,
  masked_email text NOT NULL, store_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','completed','failed')), results_json text NOT NULL,
  eligible_order_count integer NOT NULL, invalid_order_count integer NOT NULL,
  total_compensation_fen integer NOT NULL, redemption_code text, reward_code_id integer,
  error_message text, created_at text NOT NULL, updated_at text NOT NULL
);
CREATE INDEX IF NOT EXISTS embed_compensation_claims_recent
  ON embed_compensation_claims (created_at DESC,id DESC);
CREATE TABLE IF NOT EXISTS embed_compensation_order_redemptions (
  trade_no text PRIMARY KEY,
  claim_id text NOT NULL REFERENCES embed_compensation_claims(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('reserved','redeemed')),
  reserved_at text NOT NULL,
  redeemed_at text
);
CREATE INDEX IF NOT EXISTS embed_compensation_order_redemptions_claim
  ON embed_compensation_order_redemptions (claim_id);
`;
