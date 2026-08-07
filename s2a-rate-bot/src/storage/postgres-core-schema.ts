export const POSTGRES_CORE_SCHEMA = `
CREATE TABLE IF NOT EXISTS admin_users (
  id integer PRIMARY KEY CHECK (id = 1), email text NOT NULL UNIQUE,
  password_hash text NOT NULL, created_at text NOT NULL, updated_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS app_settings (
  id integer PRIMARY KEY CHECK (id = 1), target_name text NOT NULL, target_base_url text NOT NULL,
  target_admin_key_enc text NOT NULL, target_recharge_ratio double precision NOT NULL DEFAULT 1,
  telegram_bot_token_enc text NOT NULL DEFAULT '', telegram_chat_id text NOT NULL DEFAULT '',
  telegram_hourly_balance_enabled integer NOT NULL DEFAULT 0 CHECK (telegram_hourly_balance_enabled IN (0,1)),
  telegram_rate_change_enabled integer NOT NULL DEFAULT 0 CHECK (telegram_rate_change_enabled IN (0,1)),
  notification_channels_enc text NOT NULL DEFAULT '',
  proxy_enabled integer NOT NULL CHECK (proxy_enabled IN (0,1)), proxy_url text NOT NULL,
  worker_interval_seconds integer NOT NULL, worker_timeout_seconds integer NOT NULL,
  worker_concurrency integer NOT NULL, updated_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS collection_sites (
  id serial PRIMARY KEY, name text NOT NULL, remark text NOT NULL DEFAULT '', site_type text NOT NULL,
  base_url text NOT NULL, website_url text NOT NULL DEFAULT '', auth_mode text NOT NULL,
  username text NOT NULL, new_api_user_id text NOT NULL DEFAULT '', password_enc text NOT NULL,
  access_token_enc text NOT NULL, refresh_token_enc text NOT NULL,
  recharge_ratio double precision NOT NULL, interval_seconds integer NOT NULL,
  use_proxy integer NOT NULL CHECK (use_proxy IN (0,1)), enabled integer NOT NULL CHECK (enabled IN (0,1)),
  account_label text, balance double precision, today_consume double precision,
  history_recharge double precision, balance_alert_threshold double precision,
  last_run_at text, last_success_at text, last_status text, last_error text,
  consecutive_failures integer NOT NULL DEFAULT 0, refresh_version integer NOT NULL DEFAULT 0,
  created_at text NOT NULL, updated_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS collection_runs (
  id serial PRIMARY KEY, site_id integer NOT NULL REFERENCES collection_sites(id) ON DELETE CASCADE,
  status text NOT NULL, error text, group_count integer NOT NULL,
  started_at text NOT NULL, finished_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS collection_group_rates (
  site_id integer NOT NULL REFERENCES collection_sites(id) ON DELETE CASCADE,
  group_id text NOT NULL, group_name text NOT NULL, platform text,
  raw_rate double precision, effective_rate double precision NOT NULL, collected_at text NOT NULL,
  PRIMARY KEY (site_id, group_id)
);
CREATE TABLE IF NOT EXISTS collection_group_platform_overrides (
  site_id integer NOT NULL REFERENCES collection_sites(id) ON DELETE CASCADE,
  group_id text NOT NULL, platform text NOT NULL, updated_at text NOT NULL,
  PRIMARY KEY (site_id, group_id)
);
CREATE TABLE IF NOT EXISTS collection_group_metadata (
  site_id integer NOT NULL REFERENCES collection_sites(id) ON DELETE CASCADE,
  group_id text NOT NULL, group_type text NOT NULL DEFAULT '', updated_at text NOT NULL,
  PRIMARY KEY (site_id, group_id)
);
CREATE TABLE IF NOT EXISTS collection_rate_changes (
  id serial PRIMARY KEY, run_id integer NOT NULL REFERENCES collection_runs(id) ON DELETE CASCADE,
  site_id integer NOT NULL REFERENCES collection_sites(id) ON DELETE CASCADE,
  group_id text NOT NULL, group_name text NOT NULL, platform text,
  change_type text NOT NULL CHECK (change_type IN ('added','updated','deleted')),
  old_rate double precision, new_rate double precision, collected_at text NOT NULL
);
CREATE INDEX IF NOT EXISTS collection_rate_changes_recent ON collection_rate_changes (collected_at DESC,id DESC);
CREATE TABLE IF NOT EXISTS target_account_snapshots (
  account_id integer PRIMARY KEY, account_name text NOT NULL, platform text NOT NULL,
  status text NOT NULL, schedulable integer NOT NULL DEFAULT 1 CHECK (schedulable IN (0,1)),
  rate_multiplier double precision, priority integer, group_ids_json text NOT NULL, updated_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS target_account_bindings (
  account_id integer PRIMARY KEY, source_site_id integer NOT NULL REFERENCES collection_sites(id) ON DELETE CASCADE,
  source_group_id text NOT NULL, auto_manage_schedulable integer NOT NULL DEFAULT 0
    CHECK (auto_manage_schedulable IN (0,1)), updated_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS target_account_test_results (
  account_id integer PRIMARY KEY, status text NOT NULL CHECK (status IN ('available','unavailable','error')),
  message text NOT NULL, latency_ms integer NOT NULL, model text, tested_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS target_group_snapshots (
  group_id integer PRIMARY KEY, group_name text NOT NULL, platform text, status text,
  rate_multiplier double precision, updated_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS target_group_rules (
  group_id integer PRIMARY KEY, group_name text NOT NULL, enabled integer NOT NULL CHECK (enabled IN (0,1)),
  rule_version integer NOT NULL, rule_type text NOT NULL, parameters_json text NOT NULL,
  current_rate double precision, last_applied_from_rate double precision,
  last_applied_to_rate double precision, last_applied_at text, last_error text, updated_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS target_group_bindings (
  group_id integer NOT NULL REFERENCES target_group_rules(group_id) ON DELETE CASCADE,
  source_site_id integer NOT NULL REFERENCES collection_sites(id) ON DELETE CASCADE,
  source_group_id text NOT NULL, PRIMARY KEY (group_id,source_site_id,source_group_id)
);
CREATE TABLE IF NOT EXISTS worker_runs (
  id serial PRIMARY KEY, status text NOT NULL, collected_sources integer NOT NULL,
  skipped_sources integer NOT NULL, failed_sources integer NOT NULL, applied_groups integer NOT NULL,
  skipped_groups integer NOT NULL, failed_groups integer NOT NULL, sent_notifications integer NOT NULL DEFAULT 0,
  skipped_notifications integer NOT NULL DEFAULT 0, failed_notifications integer NOT NULL DEFAULT 0,
  errors_json text NOT NULL, started_at text NOT NULL, finished_at text
);
CREATE TABLE IF NOT EXISTS telegram_notification_state (
  id integer PRIMARY KEY CHECK (id = 1), last_balance_push_at text,
  last_rate_change_id integer, updated_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS app_runtime_metadata (
  key text PRIMARY KEY, value text NOT NULL, updated_at text NOT NULL
);
`;
