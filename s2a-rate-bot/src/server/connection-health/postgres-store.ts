import { execute, postgresTransaction, row, rows, type PostgresContext } from "../infrastructure/postgres-context.ts";
import { insertPostgresHealthEvent, readPostgresHealthEventPage } from "./postgres-event-store.ts";
import type { HealthEventQuery } from "./event-store.ts";
import type { ConnectionHealthActionState, ConnectionHealthMonitor, ConnectionHealthPolicy, ConnectionHealthState, NewHealthEvent } from "./types.ts";
import type { ConnectionHealthStore, PolicyUpdate, PolicyWrite } from "./store.ts";

export function createPostgresConnectionHealthStore(context: PostgresContext): ConnectionHealthStore {
  return {
    listPolicies: async () => (await rows<Record<string, unknown>>(context,
      "SELECT * FROM connection_health_policies ORDER BY id")).map(mapPolicy),
    getPolicy: async (id) => mapNullable(await row<Record<string, unknown>>(context,
      "SELECT * FROM connection_health_policies WHERE id=$1", [id]), mapPolicy),
    createPolicy: (policy, at) => createPolicy(context, policy, at),
    updatePolicy: (input) => updatePolicy(context, input),
    deletePolicy: (id) => deletePolicy(context, id),
    assignmentCount: async (id) => Number((await row<{ count: string }>(context,
      "SELECT COUNT(*)::text AS count FROM connection_health_assignments WHERE policy_id=$1", [id]))?.count ?? 0),
    assign: (connectionId, policyId, at) => assign(context, connectionId, policyId, at),
    monitor: (id) => readMonitor(context, id),
    listMonitors: () => listMonitors(context),
    listDue: (at) => listDue(context, at),
    nextDueAt: async () => (await row<{ due_at: string | null }>(context, `SELECT MIN(states.next_probe_at) AS due_at
      FROM connection_health_states states JOIN connection_health_assignments assignments
      ON assignments.connection_id=states.connection_id JOIN connection_health_policies policies
      ON policies.id=assignments.policy_id WHERE policies.enabled=1`))?.due_at ?? null,
    saveStateAndEvent: (state, event) => saveStateAndEvent(context, state, event),
    appendEvent: (event) => insertPostgresHealthEvent(context, event),
    eventPage: (query: HealthEventQuery) => readPostgresHealthEventPage(context, query),
    actionState: (id) => readActionState(context, "connection_id", id),
    actionStateByAccount: (id) => readActionState(context, "account_id", id),
    saveActionState: (state) => saveActionState(context, state),
    deleteActionState: async (id) => { await execute(context,
      "DELETE FROM connection_health_action_states WHERE connection_id=$1", [id]); },
    close: async () => undefined,
  };
}

async function createPolicy(context: PostgresContext, policy: PolicyWrite, at: string) {
  const created = await row<{ id: number }>(context, `INSERT INTO connection_health_policies
    (name,enabled,interval_seconds,failure_threshold,recovery_threshold,auto_suspend,auto_restore,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING id`, [policy.name, flag(policy.enabled), policy.intervalSeconds,
    policy.failureThreshold, policy.recoveryThreshold, flag(policy.autoSuspend), flag(policy.autoRestore), at]);
  if (!created) throw new Error("健康策略创建失败");
  const value = await row<Record<string, unknown>>(context, "SELECT * FROM connection_health_policies WHERE id=$1", [created.id]);
  if (!value) throw new Error(`健康策略不存在: ${created.id}`);
  return mapPolicy(value);
}

async function updatePolicy(context: PostgresContext, input: PolicyUpdate) {
  await postgresTransaction(context, async (client) => {
    const result = await client.query(`UPDATE connection_health_policies SET name=$2,enabled=$3,
      interval_seconds=$4,failure_threshold=$5,recovery_threshold=$6,auto_suspend=$7,auto_restore=$8,updated_at=$9
      WHERE id=$1`, [input.id, input.policy.name, flag(input.policy.enabled), input.policy.intervalSeconds,
      input.policy.failureThreshold, input.policy.recoveryThreshold, flag(input.policy.autoSuspend), flag(input.policy.autoRestore), input.at]);
    if (result.rowCount !== 1) throw new Error(`健康策略不存在: ${input.id}`);
    await client.query(`UPDATE connection_health_states SET next_probe_at=$1,updated_at=$2
      WHERE connection_id IN (SELECT connection_id FROM connection_health_assignments WHERE policy_id=$3)`,
    [input.nextProbeAt, input.at, input.id]);
  });
  const value = await row<Record<string, unknown>>(context, "SELECT * FROM connection_health_policies WHERE id=$1", [input.id]);
  if (!value) throw new Error(`健康策略不存在: ${input.id}`);
  return mapPolicy(value);
}

async function deletePolicy(context: PostgresContext, id: number) {
  const result = await execute(context, "DELETE FROM connection_health_policies WHERE id=$1", [id]);
  if (result.rowCount !== 1) throw new Error(`健康策略不存在: ${id}`);
}

async function assign(context: PostgresContext, connectionId: string, policyId: number | null, at: string) {
  await postgresTransaction(context, async (client) => {
    await client.query("DELETE FROM connection_health_assignments WHERE connection_id=$1", [connectionId]);
    await client.query("DELETE FROM connection_health_states WHERE connection_id=$1", [connectionId]);
    if (policyId === null) return;
    await client.query(`INSERT INTO connection_health_assignments (connection_id,policy_id,updated_at)
      VALUES ($1,$2,$3)`, [connectionId, policyId, at]);
    await client.query(`INSERT INTO connection_health_states
      (connection_id,state,consecutive_failures,consecutive_successes,last_probe_at,next_probe_at,
       last_result,last_message,last_latency_ms,last_model,suspension_reason,updated_at)
      VALUES ($1,'unknown',0,0,NULL,$2,NULL,NULL,NULL,NULL,NULL,$2)`, [connectionId, at]);
  });
}

async function readMonitor(context: PostgresContext, id: string) {
  const value = await row<Record<string, unknown>>(context, `${monitorSql()} WHERE assignments.connection_id=$1`, [id]);
  return value ? mapMonitor(value) : null;
}

async function listMonitors(context: PostgresContext) {
  return (await rows<Record<string, unknown>>(context, `${monitorSql()} ORDER BY assignments.updated_at DESC`)).map(mapMonitor);
}

async function listDue(context: PostgresContext, at: string) {
  return (await rows<Record<string, unknown>>(context, `${monitorSql()} WHERE policies.enabled=1
    AND (states.next_probe_at IS NULL OR states.next_probe_at<=$1) ORDER BY states.next_probe_at`, [at])).map(mapMonitor);
}

function monitorSql() {
  return `SELECT assignments.connection_id,policies.id AS policy_id,policies.name AS policy_name,
    policies.enabled AS policy_enabled,policies.interval_seconds,policies.failure_threshold,policies.recovery_threshold,
    policies.auto_suspend,policies.auto_restore,policies.created_at AS policy_created_at,
    policies.updated_at AS policy_updated_at,states.state,states.consecutive_failures,states.consecutive_successes,
    states.last_probe_at,states.next_probe_at,states.last_result,states.last_message,states.last_latency_ms,
    states.last_model,states.suspension_reason,states.updated_at AS state_updated_at
    FROM connection_health_assignments assignments JOIN connection_health_policies policies
    ON policies.id=assignments.policy_id JOIN connection_health_states states
    ON states.connection_id=assignments.connection_id`;
}

async function saveStateAndEvent(context: PostgresContext, state: ConnectionHealthState, event: NewHealthEvent) {
  await postgresTransaction(context, async (client) => {
    await client.query(`INSERT INTO connection_health_states
      (connection_id,state,consecutive_failures,consecutive_successes,last_probe_at,next_probe_at,last_result,
      last_message,last_latency_ms,last_model,suspension_reason,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT(connection_id) DO UPDATE SET state=EXCLUDED.state,consecutive_failures=EXCLUDED.consecutive_failures,
      consecutive_successes=EXCLUDED.consecutive_successes,last_probe_at=EXCLUDED.last_probe_at,next_probe_at=EXCLUDED.next_probe_at,
      last_result=EXCLUDED.last_result,last_message=EXCLUDED.last_message,last_latency_ms=EXCLUDED.last_latency_ms,
      last_model=EXCLUDED.last_model,suspension_reason=EXCLUDED.suspension_reason,updated_at=EXCLUDED.updated_at`,
    [state.connectionId, state.state, state.consecutiveFailures, state.consecutiveSuccesses, state.lastProbeAt, state.nextProbeAt,
      state.lastResult, state.lastMessage, state.lastLatencyMs, state.lastModel, state.suspensionReason, state.updatedAt]);
    await insertEventClient(client, event);
  });
}

async function insertEventClient(client: { query: (...args: any[]) => Promise<any> }, event: NewHealthEvent) {
  await client.query(`INSERT INTO connection_health_events
    (connection_id,event_type,result,from_state,to_state,message,latency_ms,model,created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [event.connectionId, event.eventType, event.result, event.fromState,
    event.toState, event.message, event.latencyMs, event.model, event.createdAt]);
}

async function readActionState(context: PostgresContext, column: "connection_id" | "account_id", value: string | number) {
  const found = await row<Record<string, unknown>>(context,
    `SELECT * FROM connection_health_action_states WHERE ${column}=$1`, [value]);
  return found ? mapActionState(found) : null;
}

async function saveActionState(context: PostgresContext, state: ConnectionHealthActionState) {
  await execute(context, `INSERT INTO connection_health_action_states
    (connection_id,account_id,original_schedulable,last_applied_schedulable,pending_schedulable,conflict,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(connection_id) DO UPDATE SET account_id=EXCLUDED.account_id,
    original_schedulable=EXCLUDED.original_schedulable,last_applied_schedulable=EXCLUDED.last_applied_schedulable,
    pending_schedulable=EXCLUDED.pending_schedulable,conflict=EXCLUDED.conflict,updated_at=EXCLUDED.updated_at`,
  [state.connectionId, state.accountId, flag(state.originalSchedulable), flag(state.lastAppliedSchedulable),
    state.pendingSchedulable === null ? null : flag(state.pendingSchedulable), flag(state.conflict), state.updatedAt]);
}

function mapMonitor(value: Record<string, unknown>): ConnectionHealthMonitor {
  return { connectionId: String(value.connection_id), state: String(value.state) as ConnectionHealthMonitor["state"],
    consecutiveFailures: Number(value.consecutive_failures), consecutiveSuccesses: Number(value.consecutive_successes),
    lastProbeAt: text(value.last_probe_at), nextProbeAt: text(value.next_probe_at), lastResult: text(value.last_result),
    lastMessage: text(value.last_message), lastLatencyMs: number(value.last_latency_ms), lastModel: text(value.last_model),
    suspensionReason: text(value.suspension_reason) as ConnectionHealthMonitor["suspensionReason"], updatedAt: String(value.state_updated_at),
    policy: { id: Number(value.policy_id), name: String(value.policy_name), enabled: truthy(value.policy_enabled),
      intervalSeconds: Number(value.interval_seconds), failureThreshold: Number(value.failure_threshold),
      recoveryThreshold: Number(value.recovery_threshold), autoSuspend: truthy(value.auto_suspend), autoRestore: truthy(value.auto_restore),
      createdAt: String(value.policy_created_at), updatedAt: String(value.policy_updated_at) } };
}

function mapPolicy(value: Record<string, unknown>): ConnectionHealthPolicy {
  return { id: Number(value.id), name: String(value.name), enabled: truthy(value.enabled), intervalSeconds: Number(value.interval_seconds),
    failureThreshold: Number(value.failure_threshold), recoveryThreshold: Number(value.recovery_threshold),
    autoSuspend: truthy(value.auto_suspend), autoRestore: truthy(value.auto_restore), createdAt: String(value.created_at), updatedAt: String(value.updated_at) };
}

function mapActionState(value: Record<string, unknown>): ConnectionHealthActionState {
  return { connectionId: String(value.connection_id), accountId: Number(value.account_id), originalSchedulable: truthy(value.original_schedulable),
    lastAppliedSchedulable: truthy(value.last_applied_schedulable), pendingSchedulable: nullableFlag(value.pending_schedulable),
    conflict: truthy(value.conflict), updatedAt: String(value.updated_at) };
}
function mapNullable<T>(value: Record<string, unknown> | null, map: (row: Record<string, unknown>) => T) { return value ? map(value) : null; }
function flag(value: boolean) { return value ? 1 : 0; }
function truthy(value: unknown) { return value === true || Number(value) === 1; }
function text(value: unknown) { return value === null || value === undefined ? null : String(value); }
function number(value: unknown) { return value === null || value === undefined ? null : Number(value); }
function nullableFlag(value: unknown) { return value === null || value === undefined ? null : truthy(value); }
