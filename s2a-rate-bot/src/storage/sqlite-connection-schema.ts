import type { DatabaseSync } from "node:sqlite";

export const CONNECTION_SCHEMA_VERSION = 29;

const CONNECTION_TABLES = [
  `CREATE TABLE IF NOT EXISTS collection_group_metadata (
    site_id INTEGER NOT NULL,
    group_id TEXT NOT NULL,
    group_type TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    PRIMARY KEY (site_id, group_id),
    FOREIGN KEY (site_id) REFERENCES collection_sites(id) ON DELETE CASCADE
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS real_connections (
    id TEXT PRIMARY KEY,
    operation_id TEXT NOT NULL UNIQUE,
    source_site_id INTEGER NOT NULL,
    source_site_name TEXT NOT NULL,
    source_group_id TEXT NOT NULL,
    source_group_name TEXT NOT NULL,
    source_platform TEXT NOT NULL,
    source_credential_id TEXT NOT NULL,
    target_account_id INTEGER,
    target_account_name TEXT NOT NULL DEFAULT '',
    target_group_ids_json TEXT NOT NULL,
    target_group_names_json TEXT NOT NULL,
    group_type TEXT NOT NULL,
    resource_name TEXT NOT NULL DEFAULT '',
    provisioning_mode TEXT NOT NULL CHECK (provisioning_mode IN ('managed', 'existing')),
    status TEXT NOT NULL CHECK (status IN ('provisioning', 'active', 'disconnecting', 'disconnected', 'error')),
    pricing_mapping_enabled INTEGER NOT NULL CHECK (pricing_mapping_enabled IN (0, 1)),
    pricing_mapping_requested INTEGER NOT NULL DEFAULT 0 CHECK (pricing_mapping_requested IN (0, 1)),
    source_credential_deleted INTEGER NOT NULL DEFAULT 0 CHECK (source_credential_deleted IN (0, 1)),
    target_account_deleted INTEGER NOT NULL DEFAULT 0 CHECK (target_account_deleted IN (0, 1)),
    lifecycle_action TEXT CHECK (lifecycle_action IS NULL OR lifecycle_action IN ('provision', 'disconnect')),
    lifecycle_stage TEXT NOT NULL DEFAULT 'idle' CHECK (lifecycle_stage IN ('idle', 'metadata', 'source', 'target', 'pricing', 'health', 'remote', 'complete')),
    disconnect_mode TEXT NOT NULL DEFAULT 'unlink' CHECK (disconnect_mode IN ('unlink', 'full')),
    disconnect_remove_pricing INTEGER NOT NULL DEFAULT 1 CHECK (disconnect_remove_pricing IN (0, 1)),
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    disconnected_at TEXT,
    FOREIGN KEY (source_site_id) REFERENCES collection_sites(id) ON DELETE RESTRICT
  ) STRICT`,
  `CREATE UNIQUE INDEX IF NOT EXISTS real_connections_active_source_group
    ON real_connections (source_site_id, source_group_id)
    WHERE status IN ('provisioning', 'active', 'disconnecting', 'error')`,
  `CREATE INDEX IF NOT EXISTS real_connections_created
    ON real_connections (created_at DESC, id DESC)`,
  `CREATE TABLE IF NOT EXISTS connection_lifecycle_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    connection_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('provision', 'disconnect')),
    stage TEXT NOT NULL,
    result TEXT NOT NULL CHECK (result IN ('started', 'success', 'failure', 'info')),
    message TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (connection_id) REFERENCES real_connections(id) ON DELETE CASCADE
  ) STRICT`,
  `CREATE INDEX IF NOT EXISTS connection_lifecycle_events_recent
    ON connection_lifecycle_events (created_at DESC, id DESC)`,
  `CREATE TABLE IF NOT EXISTS connection_health_policies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
    interval_seconds INTEGER NOT NULL CHECK (interval_seconds > 0),
    failure_threshold INTEGER NOT NULL CHECK (failure_threshold > 0),
    recovery_threshold INTEGER NOT NULL CHECK (recovery_threshold > 0),
    auto_suspend INTEGER NOT NULL CHECK (auto_suspend IN (0, 1)),
    auto_restore INTEGER NOT NULL CHECK (auto_restore IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS connection_health_assignments (
    connection_id TEXT PRIMARY KEY,
    policy_id INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (connection_id) REFERENCES real_connections(id) ON DELETE CASCADE,
    FOREIGN KEY (policy_id) REFERENCES connection_health_policies(id) ON DELETE RESTRICT
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS connection_health_states (
    connection_id TEXT PRIMARY KEY,
    state TEXT NOT NULL CHECK (state IN ('unknown', 'healthy', 'degraded', 'suspended', 'observing')),
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    consecutive_successes INTEGER NOT NULL DEFAULT 0,
    last_probe_at TEXT,
    next_probe_at TEXT,
    last_result TEXT,
    last_message TEXT,
    last_latency_ms INTEGER,
    last_model TEXT,
    suspension_reason TEXT CHECK (suspension_reason IS NULL OR suspension_reason IN ('automatic', 'manual')),
    updated_at TEXT NOT NULL,
    FOREIGN KEY (connection_id) REFERENCES real_connections(id) ON DELETE CASCADE
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS connection_health_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    connection_id TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('probe', 'action', 'policy')),
    result TEXT NOT NULL CHECK (result IN ('success', 'failure', 'info')),
    from_state TEXT,
    to_state TEXT,
    message TEXT NOT NULL,
    latency_ms INTEGER,
    model TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (connection_id) REFERENCES real_connections(id) ON DELETE CASCADE
  ) STRICT`,
  `CREATE INDEX IF NOT EXISTS connection_health_events_recent
    ON connection_health_events (created_at DESC, id DESC)`,
  `CREATE TABLE IF NOT EXISTS connection_health_action_states (
    connection_id TEXT PRIMARY KEY,
    account_id INTEGER NOT NULL UNIQUE,
    original_schedulable INTEGER NOT NULL CHECK (original_schedulable IN (0, 1)),
    last_applied_schedulable INTEGER NOT NULL CHECK (last_applied_schedulable IN (0, 1)),
    pending_schedulable INTEGER CHECK (pending_schedulable IS NULL OR pending_schedulable IN (0, 1)),
    conflict INTEGER NOT NULL DEFAULT 0 CHECK (conflict IN (0, 1)),
    updated_at TEXT NOT NULL,
    FOREIGN KEY (connection_id) REFERENCES real_connections(id) ON DELETE CASCADE
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS runtime_operation_leases (
    lease_key TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT`,
  `CREATE INDEX IF NOT EXISTS runtime_operation_leases_expiry
    ON runtime_operation_leases (expires_at)`,
] as const;

export function ensureConnectionSchema(database: DatabaseSync) {
  for (const statement of CONNECTION_TABLES) database.exec(statement);
  ensureRealConnectionColumns(database);
  ensureHealthStateColumns(database);
}

function ensureRealConnectionColumns(database: DatabaseSync) {
  const columns = new Set((database.prepare("PRAGMA table_info(real_connections)").all() as Array<{ name: string }>)
    .map((column) => column.name));
  const requestedAdded = addColumn(database, columns, {
    name: "pricing_mapping_requested",
    definition: "pricing_mapping_requested INTEGER NOT NULL DEFAULT 0 CHECK (pricing_mapping_requested IN (0, 1))",
  });
  addColumn(database, columns, { name: "resource_name", definition: "resource_name TEXT NOT NULL DEFAULT ''" });
  addColumn(database, columns, {
    name: "lifecycle_action",
    definition: "lifecycle_action TEXT CHECK (lifecycle_action IS NULL OR lifecycle_action IN ('provision', 'disconnect'))",
  });
  addColumn(database, columns, {
    name: "lifecycle_stage",
    definition: "lifecycle_stage TEXT NOT NULL DEFAULT 'idle' CHECK (lifecycle_stage IN ('idle', 'metadata', 'source', 'target', 'pricing', 'health', 'remote', 'complete'))",
  });
  addColumn(database, columns, {
    name: "disconnect_mode",
    definition: "disconnect_mode TEXT NOT NULL DEFAULT 'unlink' CHECK (disconnect_mode IN ('unlink', 'full'))",
  });
  addColumn(database, columns, {
    name: "disconnect_remove_pricing",
    definition: "disconnect_remove_pricing INTEGER NOT NULL DEFAULT 1 CHECK (disconnect_remove_pricing IN (0, 1))",
  });
  if (requestedAdded) database.exec("UPDATE real_connections SET pricing_mapping_requested=pricing_mapping_enabled");
  database.exec("UPDATE real_connections SET lifecycle_action='provision' WHERE status='provisioning' AND lifecycle_action IS NULL");
  database.exec("UPDATE real_connections SET lifecycle_action='disconnect' WHERE status='disconnecting' AND lifecycle_action IS NULL");
}

function addColumn(
  database: DatabaseSync,
  columns: Set<string>,
  input: Readonly<{ name: string; definition: string }>,
) {
  if (columns.has(input.name)) return false;
  database.exec(`ALTER TABLE real_connections ADD COLUMN ${input.definition}`);
  columns.add(input.name);
  return true;
}

function ensureHealthStateColumns(database: DatabaseSync) {
  const columns = database.prepare("PRAGMA table_info(connection_health_states)").all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "suspension_reason")) {
    database.exec(`ALTER TABLE connection_health_states ADD COLUMN suspension_reason TEXT
      CHECK (suspension_reason IS NULL OR suspension_reason IN ('automatic', 'manual'))`);
    database.exec(`UPDATE connection_health_states SET suspension_reason='automatic'
      WHERE state IN ('suspended', 'observing')`);
  }
}
