import { DatabaseSync } from "node:sqlite";
import { initializeSqliteSchema } from "../../storage/sqlite-schema.ts";
import { ensureDatabaseDirectory, flag, sqlitePath, transaction } from "../../storage/sqlite-utils.ts";
import type {
  ConnectionHealthActionState, ConnectionHealthMonitor, ConnectionHealthPolicy,
  ConnectionHealthState, NewHealthEvent,
} from "./types.ts";
import { insertHealthEvent, readHealthEventPage, type HealthEventQuery } from "./event-store.ts";
import type { Awaitable } from "../infrastructure/postgres-context.ts";

export type ConnectionHealthStore = {
  readonly listPolicies: () => Awaitable<ConnectionHealthPolicy[]>;
  readonly getPolicy: (id: number) => Awaitable<ConnectionHealthPolicy | null>;
  readonly createPolicy: (policy: PolicyWrite, at: string) => Awaitable<ConnectionHealthPolicy>;
  readonly updatePolicy: (input: PolicyUpdate) => Awaitable<ConnectionHealthPolicy>;
  readonly deletePolicy: (id: number) => Awaitable<void>;
  readonly assignmentCount: (policyId: number) => Awaitable<number>;
  readonly assign: (connectionId: string, policyId: number | null, at: string) => Awaitable<void>;
  readonly monitor: (connectionId: string) => Awaitable<ConnectionHealthMonitor | null>;
  readonly listMonitors: () => Awaitable<ConnectionHealthMonitor[]>;
  readonly listDue: (at: string) => Awaitable<ConnectionHealthMonitor[]>;
  readonly nextDueAt: () => Awaitable<string | null>;
  readonly saveStateAndEvent: (state: ConnectionHealthState, event: NewHealthEvent) => Awaitable<void>;
  readonly appendEvent: (event: NewHealthEvent) => Awaitable<void>;
  readonly eventPage: (query: HealthEventQuery) => Awaitable<ReturnType<typeof readHealthEventPage>>;
  readonly actionState: (connectionId: string) => Awaitable<ConnectionHealthActionState | null>;
  readonly actionStateByAccount: (accountId: number) => Awaitable<ConnectionHealthActionState | null>;
  readonly saveActionState: (state: ConnectionHealthActionState) => Awaitable<void>;
  readonly deleteActionState: (connectionId: string) => Awaitable<void>;
  readonly close: () => Awaitable<void>;
};

export function createSqliteConnectionHealthStore(databaseUrl: string) {
  const path = sqlitePath(databaseUrl);
  ensureDatabaseDirectory(path);
  const database = new DatabaseSync(path, { timeout: 5_000 });
  initializeSqliteSchema(database);
  return healthStore(database);
}

function healthStore(database: DatabaseSync) {
  return {
    listPolicies: () => listPolicies(database),
    getPolicy: (id) => getPolicy(database, id),
    createPolicy: (policy, at) => createPolicy(database, policy, at),
    updatePolicy: (input) => updatePolicy(database, input),
    deletePolicy: (id) => deletePolicy(database, id),
    assignmentCount: (id) => assignmentCount(database, id),
    assign: (connectionId, policyId, at) => assign(database, connectionId, policyId, at),
    monitor: (connectionId) => readMonitor(database, connectionId),
    listMonitors: () => listMonitors(database),
    listDue: (at) => listDue(database, at),
    nextDueAt: () => nextDueAt(database),
    saveStateAndEvent: (state, event) => saveStateAndEvent(database, state, event),
    appendEvent: (event) => insertHealthEvent(database, event),
    eventPage: (query) => readHealthEventPage(database, query),
    actionState: (id) => readActionState(database, "connection_id", id),
    actionStateByAccount: (id) => readActionState(database, "account_id", id),
    saveActionState: (state) => saveActionState(database, state),
    deleteActionState: (id) => { database.prepare("DELETE FROM connection_health_action_states WHERE connection_id=?").run(id); },
    close: () => database.close(),
  } satisfies ConnectionHealthStore;
}

function listPolicies(database: DatabaseSync) {
  return (database.prepare("SELECT * FROM connection_health_policies ORDER BY id").all() as Row[]).map((row) => mapPolicy(row));
}

function getPolicy(database: DatabaseSync, id: number) {
  const row = database.prepare("SELECT * FROM connection_health_policies WHERE id=?").get(id) as Row | undefined;
  return row ? mapPolicy(row) : null;
}

function createPolicy(database: DatabaseSync, policy: PolicyWrite, at: string) {
  const result = database.prepare(`INSERT INTO connection_health_policies
    (name, enabled, interval_seconds, failure_threshold, recovery_threshold, auto_suspend, auto_restore, created_at, updated_at)
    VALUES (:name, :enabled, :intervalSeconds, :failureThreshold, :recoveryThreshold, :autoSuspend, :autoRestore, :createdAt, :updatedAt)`)
    .run({ ...policyBindings(policy), createdAt: at, updatedAt: at });
  return requiredPolicy(database, Number(result.lastInsertRowid));
}

function updatePolicy(database: DatabaseSync, input: PolicyUpdate) {
  transaction(database, () => {
    const result = database.prepare(`UPDATE connection_health_policies SET name=:name, enabled=:enabled,
      interval_seconds=:intervalSeconds, failure_threshold=:failureThreshold, recovery_threshold=:recoveryThreshold,
      auto_suspend=:autoSuspend, auto_restore=:autoRestore, updated_at=:updatedAt WHERE id=:id`)
      .run({ ...policyBindings(input.policy), updatedAt: input.at, id: input.id });
    requiredChange(result, `健康策略不存在: ${input.id}`);
    database.prepare(`UPDATE connection_health_states SET next_probe_at=?, updated_at=?
      WHERE connection_id IN (SELECT connection_id FROM connection_health_assignments WHERE policy_id=?)`)
      .run(input.nextProbeAt, input.at, input.id);
  });
  return requiredPolicy(database, input.id);
}

function deletePolicy(database: DatabaseSync, id: number) {
  requiredChange(database.prepare("DELETE FROM connection_health_policies WHERE id=?").run(id), `健康策略不存在: ${id}`);
}

function assignmentCount(database: DatabaseSync, policyId: number) {
  const row = database.prepare("SELECT COUNT(*) AS count FROM connection_health_assignments WHERE policy_id=?").get(policyId) as { count: number };
  return Number(row.count);
}

function assign(database: DatabaseSync, connectionId: string, policyId: number | null, at: string) {
  transaction(database, () => {
    database.prepare("DELETE FROM connection_health_assignments WHERE connection_id=?").run(connectionId);
    database.prepare("DELETE FROM connection_health_states WHERE connection_id=?").run(connectionId);
    if (policyId === null) return;
    database.prepare("INSERT INTO connection_health_assignments (connection_id, policy_id, updated_at) VALUES (?, ?, ?)")
      .run(connectionId, policyId, at);
    saveState(database, initialState(connectionId, at));
  });
}

function readMonitor(database: DatabaseSync, connectionId: string) {
  const row = database.prepare(`${monitorSql()} WHERE assignments.connection_id=?`).get(connectionId) as Row | undefined;
  return row ? mapMonitor(row) : null;
}

function listMonitors(database: DatabaseSync) {
  return (database.prepare(`${monitorSql()} ORDER BY assignments.updated_at DESC`).all() as Row[]).map(mapMonitor);
}

function listDue(database: DatabaseSync, at: string) {
  return (database.prepare(`${monitorSql()} WHERE policies.enabled=1
    AND (states.next_probe_at IS NULL OR states.next_probe_at<=?) ORDER BY states.next_probe_at`).all(at) as Row[]).map(mapMonitor);
}

function nextDueAt(database: DatabaseSync) {
  const row = database.prepare(`SELECT MIN(states.next_probe_at) AS due_at
    FROM connection_health_states AS states
    JOIN connection_health_assignments AS assignments ON assignments.connection_id=states.connection_id
    JOIN connection_health_policies AS policies ON policies.id=assignments.policy_id
    WHERE policies.enabled=1`).get() as { due_at: unknown };
  return text(row.due_at);
}

function monitorSql() {
  return `SELECT assignments.connection_id, policies.id AS policy_id, policies.name AS policy_name,
    policies.enabled AS policy_enabled, policies.interval_seconds, policies.failure_threshold,
    policies.recovery_threshold, policies.auto_suspend, policies.auto_restore,
    policies.created_at AS policy_created_at, policies.updated_at AS policy_updated_at,
    states.state, states.consecutive_failures, states.consecutive_successes,
    states.last_probe_at, states.next_probe_at, states.last_result, states.last_message,
    states.last_latency_ms, states.last_model, states.suspension_reason, states.updated_at AS state_updated_at
    FROM connection_health_assignments AS assignments
    JOIN connection_health_policies AS policies ON policies.id=assignments.policy_id
    JOIN connection_health_states AS states ON states.connection_id=assignments.connection_id`;
}

function saveStateAndEvent(database: DatabaseSync, state: ConnectionHealthState, event: NewHealthEvent) {
  transaction(database, () => { saveState(database, state); insertHealthEvent(database, event); });
}

function saveState(database: DatabaseSync, state: ConnectionHealthState) {
  database.prepare(`INSERT INTO connection_health_states
    (connection_id, state, consecutive_failures, consecutive_successes, last_probe_at, next_probe_at,
      last_result, last_message, last_latency_ms, last_model, suspension_reason, updated_at)
    VALUES (:connectionId, :state, :consecutiveFailures, :consecutiveSuccesses, :lastProbeAt, :nextProbeAt,
      :lastResult, :lastMessage, :lastLatencyMs, :lastModel, :suspensionReason, :updatedAt)
    ON CONFLICT(connection_id) DO UPDATE SET state=excluded.state,
      consecutive_failures=excluded.consecutive_failures, consecutive_successes=excluded.consecutive_successes,
      last_probe_at=excluded.last_probe_at, next_probe_at=excluded.next_probe_at,
      last_result=excluded.last_result, last_message=excluded.last_message,
      last_latency_ms=excluded.last_latency_ms, last_model=excluded.last_model,
      suspension_reason=excluded.suspension_reason, updated_at=excluded.updated_at`).run(state);
}

function readActionState(database: DatabaseSync, column: "connection_id" | "account_id", value: string | number) {
  const row = database.prepare(`SELECT * FROM connection_health_action_states WHERE ${column}=?`).get(value) as Row | undefined;
  return row ? mapActionState(row) : null;
}

function saveActionState(database: DatabaseSync, state: ConnectionHealthActionState) {
  database.prepare(`INSERT INTO connection_health_action_states
    (connection_id, account_id, original_schedulable, last_applied_schedulable,
      pending_schedulable, conflict, updated_at)
    VALUES (:connectionId, :accountId, :originalSchedulable, :lastAppliedSchedulable,
      :pendingSchedulable, :conflict, :updatedAt)
    ON CONFLICT(connection_id) DO UPDATE SET account_id=excluded.account_id,
      original_schedulable=excluded.original_schedulable,
      last_applied_schedulable=excluded.last_applied_schedulable,
      pending_schedulable=excluded.pending_schedulable,
      conflict=excluded.conflict, updated_at=excluded.updated_at`).run(actionBindings(state));
}

function initialState(connectionId: string, at: string): ConnectionHealthState {
  return { connectionId, state: "unknown", consecutiveFailures: 0, consecutiveSuccesses: 0,
    lastProbeAt: null, nextProbeAt: at, lastResult: null, lastMessage: null,
    lastLatencyMs: null, lastModel: null, suspensionReason: null, updatedAt: at };
}

function mapMonitor(row: Row): ConnectionHealthMonitor {
  return {
    connectionId: String(row.connection_id), state: String(row.state) as ConnectionHealthMonitor["state"],
    consecutiveFailures: Number(row.consecutive_failures), consecutiveSuccesses: Number(row.consecutive_successes),
    lastProbeAt: text(row.last_probe_at), nextProbeAt: text(row.next_probe_at), lastResult: text(row.last_result),
    lastMessage: text(row.last_message), lastLatencyMs: number(row.last_latency_ms), lastModel: text(row.last_model),
    suspensionReason: text(row.suspension_reason) as ConnectionHealthMonitor["suspensionReason"],
    updatedAt: String(row.state_updated_at), policy: mapPolicy(row, "policy_"),
  };
}

function mapPolicy(row: Row, prefix = ""): ConnectionHealthPolicy {
  return {
    id: Number(row[`${prefix}id`] ?? row.id), name: String(row[`${prefix}name`] ?? row.name),
    enabled: Number(row[`${prefix}enabled`] ?? row.enabled) === 1,
    intervalSeconds: Number(row.interval_seconds), failureThreshold: Number(row.failure_threshold),
    recoveryThreshold: Number(row.recovery_threshold), autoSuspend: Number(row.auto_suspend) === 1,
    autoRestore: Number(row.auto_restore) === 1,
    createdAt: String(row[`${prefix}created_at`] ?? row.created_at), updatedAt: String(row[`${prefix}updated_at`] ?? row.updated_at),
  };
}

function mapActionState(row: Row): ConnectionHealthActionState {
  return {
    connectionId: String(row.connection_id), accountId: Number(row.account_id),
    originalSchedulable: Number(row.original_schedulable) === 1,
    lastAppliedSchedulable: Number(row.last_applied_schedulable) === 1,
    pendingSchedulable: nullableFlag(row.pending_schedulable), conflict: Number(row.conflict) === 1,
    updatedAt: String(row.updated_at),
  };
}

function requiredPolicy(database: DatabaseSync, id: number) {
  const policy = getPolicy(database, id);
  if (!policy) throw new Error(`健康策略不存在: ${id}`);
  return policy;
}

function policyBindings(policy: PolicyWrite) {
  return {
    ...policy,
    enabled: flag(policy.enabled),
    autoSuspend: flag(policy.autoSuspend),
    autoRestore: flag(policy.autoRestore),
  };
}

function actionBindings(state: ConnectionHealthActionState) {
  return {
    ...state, originalSchedulable: flag(state.originalSchedulable),
    lastAppliedSchedulable: flag(state.lastAppliedSchedulable),
    pendingSchedulable: state.pendingSchedulable === null ? null : flag(state.pendingSchedulable),
    conflict: flag(state.conflict),
  };
}

function requiredChange(result: { readonly changes: number | bigint }, message: string) { if (Number(result.changes) !== 1) throw new Error(message); }
function text(value: unknown) { return value === null || value === undefined ? null : String(value); }
function number(value: unknown) { return value === null || value === undefined ? null : Number(value); }
function nullableFlag(value: unknown) { return value === null || value === undefined ? null : Number(value) === 1; }
export type PolicyWrite = Omit<ConnectionHealthPolicy, "id" | "createdAt" | "updatedAt">;
export type PolicyUpdate = Readonly<{
  id: number;
  policy: PolicyWrite;
  at: string;
  nextProbeAt: string | null;
}>;
type Row = Record<string, unknown>;
