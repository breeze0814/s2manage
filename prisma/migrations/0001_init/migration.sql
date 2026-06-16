CREATE TABLE IF NOT EXISTS "admin_users" (
  "id" SERIAL PRIMARY KEY,
  "email" TEXT NOT NULL,
  "password_hash" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "admin_users_email_key"
  ON "admin_users"("email");

CREATE TABLE IF NOT EXISTS "connections" (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "base_url" TEXT NOT NULL,
  "admin_api_key" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "sync_mode" TEXT NOT NULL DEFAULT 'manual',
  "last_check_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "settings" (
  "key" TEXT PRIMARY KEY,
  "value" TEXT NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "bl_source_bindings" (
  "id" SERIAL PRIMARY KEY,
  "connection_id" INTEGER NOT NULL,
  "target_type" TEXT NOT NULL,
  "target_id" INTEGER NOT NULL,
  "source_site_id" INTEGER NOT NULL,
  "source_site_name" TEXT NOT NULL,
  "source_group_id" TEXT NOT NULL,
  "source_group_name" TEXT,
  "source_platform" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bl_source_bindings_connection_id_fkey"
    FOREIGN KEY ("connection_id") REFERENCES "connections" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "bl_source_bindings_connection_id_target_type_target_id_source_site_id_source_group_id_key"
  ON "bl_source_bindings"("connection_id", "target_type", "target_id", "source_site_id", "source_group_id");
CREATE INDEX IF NOT EXISTS "bl_source_bindings_connection_id_target_type_target_id_idx"
  ON "bl_source_bindings"("connection_id", "target_type", "target_id");

CREATE TABLE IF NOT EXISTS "bl_group_rate_rules" (
  "id" SERIAL PRIMARY KEY,
  "connection_id" INTEGER NOT NULL,
  "group_id" INTEGER NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "mode" TEXT NOT NULL DEFAULT 'first',
  "offset" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "expression" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bl_group_rate_rules_connection_id_fkey"
    FOREIGN KEY ("connection_id") REFERENCES "connections" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "bl_group_rate_rules_connection_id_group_id_key"
  ON "bl_group_rate_rules"("connection_id", "group_id");
CREATE INDEX IF NOT EXISTS "bl_group_rate_rules_connection_id_group_id_idx"
  ON "bl_group_rate_rules"("connection_id", "group_id");

CREATE TABLE IF NOT EXISTS "bl_account_rate_rules" (
  "id" SERIAL PRIMARY KEY,
  "connection_id" INTEGER NOT NULL,
  "account_id" INTEGER NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "mode" TEXT NOT NULL DEFAULT 'first',
  "offset" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "expression" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bl_account_rate_rules_connection_id_fkey"
    FOREIGN KEY ("connection_id") REFERENCES "connections" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "bl_account_rate_rules_connection_id_account_id_key"
  ON "bl_account_rate_rules"("connection_id", "account_id");
CREATE INDEX IF NOT EXISTS "bl_account_rate_rules_connection_id_account_id_idx"
  ON "bl_account_rate_rules"("connection_id", "account_id");

CREATE TABLE IF NOT EXISTS "announcement_rules" (
  "id" SERIAL PRIMARY KEY,
  "connection_id" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "title_template" TEXT NOT NULL,
  "content_template" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "notify_mode" TEXT NOT NULL DEFAULT 'silent',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "announcement_rules_connection_id_fkey"
    FOREIGN KEY ("connection_id") REFERENCES "connections" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "announcement_rules_connection_id_enabled_idx"
  ON "announcement_rules"("connection_id", "enabled");

CREATE TABLE IF NOT EXISTS "upstream_monitor_rules" (
  "id" SERIAL PRIMARY KEY,
  "connection_id" INTEGER NOT NULL,
  "account_id" INTEGER NOT NULL,
  "account_name" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "check_interval_minutes" INTEGER NOT NULL DEFAULT 10,
  "failure_threshold" INTEGER NOT NULL DEFAULT 3,
  "pause_minutes" INTEGER NOT NULL DEFAULT 30,
  "model_id" TEXT,
  "prompt" TEXT,
  "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
  "total_checks" INTEGER NOT NULL DEFAULT 0,
  "success_checks" INTEGER NOT NULL DEFAULT 0,
  "last_status" TEXT,
  "last_message" TEXT,
  "last_latency_ms" INTEGER,
  "last_checked_at" TIMESTAMP(3),
  "next_check_at" TIMESTAMP(3),
  "paused_until" TIMESTAMP(3),
  "pause_started_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "upstream_monitor_rules_connection_id_fkey"
    FOREIGN KEY ("connection_id") REFERENCES "connections" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "upstream_monitor_rules_connection_id_account_id_key"
  ON "upstream_monitor_rules"("connection_id", "account_id");
CREATE INDEX IF NOT EXISTS "upstream_monitor_rules_connection_id_enabled_next_check_at_idx"
  ON "upstream_monitor_rules"("connection_id", "enabled", "next_check_at");
CREATE INDEX IF NOT EXISTS "upstream_monitor_rules_connection_id_account_id_idx"
  ON "upstream_monitor_rules"("connection_id", "account_id");

CREATE TABLE IF NOT EXISTS "upstream_monitor_results" (
  "id" SERIAL PRIMARY KEY,
  "rule_id" INTEGER NOT NULL,
  "connection_id" INTEGER NOT NULL,
  "account_id" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "message" TEXT,
  "latency_ms" INTEGER,
  "model" TEXT,
  "started_at" TIMESTAMP(3) NOT NULL,
  "finished_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "upstream_monitor_results_rule_id_fkey"
    FOREIGN KEY ("rule_id") REFERENCES "upstream_monitor_rules" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "upstream_monitor_results_connection_id_fkey"
    FOREIGN KEY ("connection_id") REFERENCES "connections" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "upstream_monitor_results_rule_id_created_at_idx"
  ON "upstream_monitor_results"("rule_id", "created_at");
CREATE INDEX IF NOT EXISTS "upstream_monitor_results_connection_id_account_id_created_at_idx"
  ON "upstream_monitor_results"("connection_id", "account_id", "created_at");

CREATE TABLE IF NOT EXISTS "bl_collection_sites" (
  "id" SERIAL PRIMARY KEY,
  "connection_id" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "base_url" TEXT NOT NULL,
  "site_type" TEXT NOT NULL DEFAULT 'sub2api',
  "email" TEXT NOT NULL DEFAULT '',
  "password_enc" TEXT NOT NULL DEFAULT '',
  "auth_mode" TEXT NOT NULL DEFAULT 'password',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "interval_min" INTEGER NOT NULL DEFAULT 60,
  "recharge_ratio" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "access_token" TEXT,
  "refresh_token" TEXT,
  "token_expire" BIGINT,
  "last_run_at" TIMESTAMP(3),
  "last_status" TEXT,
  "last_error" TEXT,
  "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
  "last_success_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bl_collection_sites_connection_id_fkey"
    FOREIGN KEY ("connection_id") REFERENCES "connections" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "bl_collection_sites_connection_id_enabled_idx"
  ON "bl_collection_sites"("connection_id", "enabled");
CREATE INDEX IF NOT EXISTS "bl_collection_sites_connection_id_site_type_idx"
  ON "bl_collection_sites"("connection_id", "site_type");

CREATE TABLE IF NOT EXISTS "bl_collection_runs" (
  "id" SERIAL PRIMARY KEY,
  "connection_id" INTEGER NOT NULL,
  "site_id" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "error" TEXT,
  "group_count" INTEGER NOT NULL DEFAULT 0,
  "model_count" INTEGER NOT NULL DEFAULT 0,
  "change_count" INTEGER NOT NULL DEFAULT 0,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMP(3),
  CONSTRAINT "bl_collection_runs_connection_id_fkey"
    FOREIGN KEY ("connection_id") REFERENCES "connections" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "bl_collection_runs_site_id_fkey"
    FOREIGN KEY ("site_id") REFERENCES "bl_collection_sites" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "bl_collection_runs_connection_id_site_id_status_id_idx"
  ON "bl_collection_runs"("connection_id", "site_id", "status", "id");
CREATE INDEX IF NOT EXISTS "bl_collection_runs_site_id_status_id_idx"
  ON "bl_collection_runs"("site_id", "status", "id");

CREATE TABLE IF NOT EXISTS "bl_collected_group_rates" (
  "id" SERIAL PRIMARY KEY,
  "connection_id" INTEGER NOT NULL,
  "site_id" INTEGER NOT NULL,
  "run_id" INTEGER NOT NULL,
  "group_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "platform" TEXT,
  "subscription_type" TEXT,
  "is_exclusive" BOOLEAN NOT NULL DEFAULT false,
  "rate_multiplier" DOUBLE PRECISION,
  "user_rate" DOUBLE PRECISION,
  "effective_rate" DOUBLE PRECISION,
  "raw" TEXT,
  "collected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bl_collected_group_rates_connection_id_fkey"
    FOREIGN KEY ("connection_id") REFERENCES "connections" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "bl_collected_group_rates_site_id_fkey"
    FOREIGN KEY ("site_id") REFERENCES "bl_collection_sites" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "bl_collected_group_rates_run_id_fkey"
    FOREIGN KEY ("run_id") REFERENCES "bl_collection_runs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "bl_collected_group_rates_connection_id_site_id_group_id_id_idx"
  ON "bl_collected_group_rates"("connection_id", "site_id", "group_id", "id");
CREATE INDEX IF NOT EXISTS "bl_collected_group_rates_run_id_idx"
  ON "bl_collected_group_rates"("run_id");

CREATE TABLE IF NOT EXISTS "bl_collected_model_prices" (
  "id" SERIAL PRIMARY KEY,
  "connection_id" INTEGER NOT NULL,
  "site_id" INTEGER NOT NULL,
  "run_id" INTEGER NOT NULL,
  "channel_name" TEXT,
  "platform" TEXT,
  "model_name" TEXT NOT NULL,
  "billing_mode" TEXT,
  "input_price" DOUBLE PRECISION,
  "output_price" DOUBLE PRECISION,
  "cache_write_price" DOUBLE PRECISION,
  "cache_read_price" DOUBLE PRECISION,
  "image_output_price" DOUBLE PRECISION,
  "per_request_price" DOUBLE PRECISION,
  "model_ratio" DOUBLE PRECISION,
  "completion_ratio" DOUBLE PRECISION,
  "model_price" DOUBLE PRECISION,
  "quota_type" TEXT,
  "vendor_name" TEXT,
  "description" TEXT,
  "raw" TEXT,
  "collected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bl_collected_model_prices_connection_id_fkey"
    FOREIGN KEY ("connection_id") REFERENCES "connections" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "bl_collected_model_prices_site_id_fkey"
    FOREIGN KEY ("site_id") REFERENCES "bl_collection_sites" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "bl_collected_model_prices_run_id_fkey"
    FOREIGN KEY ("run_id") REFERENCES "bl_collection_runs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "bl_collected_model_prices_connection_id_site_id_channel_name_platform_model_name_id_idx"
  ON "bl_collected_model_prices"("connection_id", "site_id", "channel_name", "platform", "model_name", "id");
CREATE INDEX IF NOT EXISTS "bl_collected_model_prices_run_id_idx"
  ON "bl_collected_model_prices"("run_id");

CREATE TABLE IF NOT EXISTS "bl_collected_changes" (
  "id" SERIAL PRIMARY KEY,
  "connection_id" INTEGER NOT NULL,
  "site_id" INTEGER NOT NULL,
  "run_id" INTEGER NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_key" TEXT NOT NULL,
  "field" TEXT NOT NULL,
  "old_value" TEXT,
  "new_value" TEXT,
  "change_type" TEXT NOT NULL,
  "raw" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bl_collected_changes_connection_id_fkey"
    FOREIGN KEY ("connection_id") REFERENCES "connections" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "bl_collected_changes_site_id_fkey"
    FOREIGN KEY ("site_id") REFERENCES "bl_collection_sites" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "bl_collected_changes_run_id_fkey"
    FOREIGN KEY ("run_id") REFERENCES "bl_collection_runs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "bl_collected_changes_connection_id_site_id_entity_type_field_created_at_idx"
  ON "bl_collected_changes"("connection_id", "site_id", "entity_type", "field", "created_at");
CREATE INDEX IF NOT EXISTS "bl_collected_changes_run_id_idx"
  ON "bl_collected_changes"("run_id");
