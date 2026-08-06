export const POSTGRES_CONNECTION_SCHEMA = `
CREATE TABLE IF NOT EXISTS real_connections (
  id text PRIMARY KEY, operation_id text NOT NULL UNIQUE,
  source_site_id integer NOT NULL REFERENCES collection_sites(id) ON DELETE RESTRICT,
  source_site_name text NOT NULL, source_group_id text NOT NULL, source_group_name text NOT NULL,
  source_platform text NOT NULL, source_credential_id text NOT NULL, target_account_id integer,
  target_account_name text NOT NULL DEFAULT '', target_group_ids_json text NOT NULL,
  target_group_names_json text NOT NULL, group_type text NOT NULL, resource_name text NOT NULL DEFAULT '',
  provisioning_mode text NOT NULL CHECK (provisioning_mode IN ('managed','existing')),
  status text NOT NULL CHECK (status IN ('provisioning','active','disconnecting','disconnected','error')),
  pricing_mapping_enabled integer NOT NULL CHECK (pricing_mapping_enabled IN (0,1)),
  pricing_mapping_requested integer NOT NULL DEFAULT 0 CHECK (pricing_mapping_requested IN (0,1)),
  source_credential_deleted integer NOT NULL DEFAULT 0 CHECK (source_credential_deleted IN (0,1)),
  target_account_deleted integer NOT NULL DEFAULT 0 CHECK (target_account_deleted IN (0,1)),
  lifecycle_action text CHECK (lifecycle_action IS NULL OR lifecycle_action IN ('provision','disconnect')),
  lifecycle_stage text NOT NULL DEFAULT 'idle'
    CHECK (lifecycle_stage IN ('idle','metadata','source','target','pricing','health','remote','complete')),
  disconnect_mode text NOT NULL DEFAULT 'unlink' CHECK (disconnect_mode IN ('unlink','full')),
  disconnect_remove_pricing integer NOT NULL DEFAULT 1 CHECK (disconnect_remove_pricing IN (0,1)),
  last_error text, created_at text NOT NULL, updated_at text NOT NULL, disconnected_at text
);
CREATE UNIQUE INDEX IF NOT EXISTS real_connections_active_source_group
  ON real_connections (source_site_id,source_group_id)
  WHERE status IN ('provisioning','active','disconnecting','error');
CREATE INDEX IF NOT EXISTS real_connections_created ON real_connections (created_at DESC,id DESC);
CREATE TABLE IF NOT EXISTS connection_lifecycle_events (
  id serial PRIMARY KEY, connection_id text NOT NULL REFERENCES real_connections(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('provision','disconnect')), stage text NOT NULL,
  result text NOT NULL CHECK (result IN ('started','success','failure','info')),
  message text NOT NULL, created_at text NOT NULL
);
CREATE INDEX IF NOT EXISTS connection_lifecycle_events_recent
  ON connection_lifecycle_events (created_at DESC,id DESC);
CREATE TABLE IF NOT EXISTS connection_health_policies (
  id serial PRIMARY KEY, name text NOT NULL UNIQUE, enabled integer NOT NULL CHECK (enabled IN (0,1)),
  interval_seconds integer NOT NULL CHECK (interval_seconds > 0),
  failure_threshold integer NOT NULL CHECK (failure_threshold > 0),
  recovery_threshold integer NOT NULL CHECK (recovery_threshold > 0),
  auto_suspend integer NOT NULL CHECK (auto_suspend IN (0,1)),
  auto_restore integer NOT NULL CHECK (auto_restore IN (0,1)),
  created_at text NOT NULL, updated_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS connection_health_assignments (
  connection_id text PRIMARY KEY REFERENCES real_connections(id) ON DELETE CASCADE,
  policy_id integer NOT NULL REFERENCES connection_health_policies(id) ON DELETE RESTRICT,
  updated_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS connection_health_states (
  connection_id text PRIMARY KEY REFERENCES real_connections(id) ON DELETE CASCADE,
  state text NOT NULL CHECK (state IN ('unknown','healthy','degraded','suspended','observing')),
  consecutive_failures integer NOT NULL DEFAULT 0, consecutive_successes integer NOT NULL DEFAULT 0,
  last_probe_at text, next_probe_at text, last_result text, last_message text,
  last_latency_ms integer, last_model text,
  suspension_reason text CHECK (suspension_reason IS NULL OR suspension_reason IN ('automatic','manual')),
  updated_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS connection_health_events (
  id serial PRIMARY KEY, connection_id text NOT NULL REFERENCES real_connections(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('probe','action','policy')),
  result text NOT NULL CHECK (result IN ('success','failure','info')),
  from_state text, to_state text, message text NOT NULL, latency_ms integer, model text, created_at text NOT NULL
);
CREATE INDEX IF NOT EXISTS connection_health_events_recent ON connection_health_events (created_at DESC,id DESC);
CREATE TABLE IF NOT EXISTS connection_health_action_states (
  connection_id text PRIMARY KEY REFERENCES real_connections(id) ON DELETE CASCADE,
  account_id integer NOT NULL UNIQUE, original_schedulable integer NOT NULL CHECK (original_schedulable IN (0,1)),
  last_applied_schedulable integer NOT NULL CHECK (last_applied_schedulable IN (0,1)),
  pending_schedulable integer CHECK (pending_schedulable IS NULL OR pending_schedulable IN (0,1)),
  conflict integer NOT NULL DEFAULT 0 CHECK (conflict IN (0,1)), updated_at text NOT NULL
);
`;
