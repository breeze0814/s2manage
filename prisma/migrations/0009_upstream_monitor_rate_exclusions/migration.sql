CREATE TABLE IF NOT EXISTS "upstream_monitor_rate_exclusions" (
  "id" SERIAL PRIMARY KEY,
  "connection_id" INTEGER NOT NULL,
  "account_id" INTEGER NOT NULL,
  "account_name" TEXT,
  "group_id" INTEGER NOT NULL,
  "source_site_id" INTEGER NOT NULL,
  "source_site_name" TEXT NOT NULL,
  "source_group_id" TEXT NOT NULL,
  "source_group_name" TEXT,
  "source_platform" TEXT,
  "reason" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "paused_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "restored_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "upstream_monitor_rate_exclusions_connection_id_fkey"
    FOREIGN KEY ("connection_id") REFERENCES "connections" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "upstream_monitor_rate_exclusions_connection_id_account_id_group_id_source_site_id_source_group_id_key"
  ON "upstream_monitor_rate_exclusions"("connection_id", "account_id", "group_id", "source_site_id", "source_group_id");
CREATE INDEX IF NOT EXISTS "upstream_monitor_rate_exclusions_connection_id_active_group_id_idx"
  ON "upstream_monitor_rate_exclusions"("connection_id", "active", "group_id");
CREATE INDEX IF NOT EXISTS "upstream_monitor_rate_exclusions_connection_id_account_id_active_idx"
  ON "upstream_monitor_rate_exclusions"("connection_id", "account_id", "active");
CREATE INDEX IF NOT EXISTS "upstream_monitor_rate_exclusions_connection_id_source_site_id_source_group_id_active_idx"
  ON "upstream_monitor_rate_exclusions"("connection_id", "source_site_id", "source_group_id", "active");
