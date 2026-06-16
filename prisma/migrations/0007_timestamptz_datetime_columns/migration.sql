-- Store application DateTime values as absolute instants.
--
-- Previous PostgreSQL schema used TIMESTAMP WITHOUT TIME ZONE. Existing rows are
-- mixed by writer:
-- - SQLite/import/config creation metadata was written as Asia/Shanghai wall-clock time.
-- - Worker/runtime Date writes were serialized by pg as UTC wall-clock time into
--   naive timestamp columns.
--
-- Convert columns by their writer/source instead of applying one blanket
-- timezone to every timestamp column.

BEGIN;

ALTER TABLE "admin_users"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "connections"
  ALTER COLUMN "last_check_at" TYPE TIMESTAMPTZ(3) USING "last_check_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "settings"
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "bl_source_bindings"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "bl_group_rate_rules"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "bl_account_rate_rules"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "bl_collection_sites"
  ALTER COLUMN "last_run_at" TYPE TIMESTAMPTZ(3) USING "last_run_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "last_success_at" TYPE TIMESTAMPTZ(3) USING "last_success_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "bl_collection_runs"
  ALTER COLUMN "started_at" TYPE TIMESTAMPTZ(3) USING "started_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "finished_at" TYPE TIMESTAMPTZ(3) USING "finished_at" AT TIME ZONE 'UTC';

ALTER TABLE "bl_collected_group_rates"
  ALTER COLUMN "collected_at" TYPE TIMESTAMPTZ(3) USING "collected_at" AT TIME ZONE 'UTC';

ALTER TABLE "bl_collected_model_prices"
  ALTER COLUMN "collected_at" TYPE TIMESTAMPTZ(3) USING "collected_at" AT TIME ZONE 'UTC';

ALTER TABLE "bl_collected_changes"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC';

ALTER TABLE "announcement_rules"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "upstream_monitor_rules"
  ALTER COLUMN "last_checked_at" TYPE TIMESTAMPTZ(3) USING "last_checked_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "next_check_at" TYPE TIMESTAMPTZ(3) USING "next_check_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "paused_until" TYPE TIMESTAMPTZ(3) USING "paused_until" AT TIME ZONE 'UTC',
  ALTER COLUMN "pause_started_at" TYPE TIMESTAMPTZ(3) USING "pause_started_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "upstream_monitor_results"
  ALTER COLUMN "started_at" TYPE TIMESTAMPTZ(3) USING "started_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "finished_at" TYPE TIMESTAMPTZ(3) USING "finished_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC';

COMMIT;
