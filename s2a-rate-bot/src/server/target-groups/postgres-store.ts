import type { PoolClient } from "pg";
import { TARGET_RULE_VERSION } from "../../core/rule-version.ts";
import { execute, postgresTransaction, row, rows, type PostgresContext } from "../infrastructure/postgres-context.ts";
import { ruleParametersSchema } from "./rule-parameters.ts";
import type { TargetGroupStore, TargetRuleUpdate } from "./store.ts";
import type { SourceBinding, TargetGroup, TargetRule } from "./types.ts";

export function createPostgresTargetGroupStore(context: PostgresContext): TargetGroupStore {
  return {
    getGroup: async (id) => mapNullable(await row<Record<string, unknown>>(context,
      "SELECT * FROM target_group_snapshots WHERE group_id=$1", [id]), mapGroup),
    listGroups: async () => (await rows<Record<string, unknown>>(context,
      "SELECT * FROM target_group_snapshots ORDER BY group_id")).map(mapGroup),
    replaceGroups: (groups) => replaceGroups(context, groups),
    removeGroup: (id) => removeGroup(context, id),
    saveGroup: (group) => saveGroup(context, group),
    getRule: async (id) => mapNullable(await row<Record<string, unknown>>(context,
      "SELECT * FROM target_group_rules WHERE group_id=$1", [id]), mapRule),
    listRules: async () => (await rows<Record<string, unknown>>(context,
      "SELECT * FROM target_group_rules ORDER BY group_id")).map(mapRule),
    bindings: (id) => readBindings(context, id),
    saveRule: (rule, bindings) => saveRules(context, [{ rule, bindings }]),
    saveRules: (updates) => saveRules(context, updates),
    recordApplied: (id, fromRate, toRate) => recordApplied(context, id, fromRate, toRate),
    recordError: async (id, error) => { await execute(context,
      "UPDATE target_group_rules SET last_error=$2,updated_at=$3 WHERE group_id=$1",
    [id, error, new Date().toISOString()]); },
    close: async () => undefined,
  };
}

async function replaceGroups(context: PostgresContext, groups: readonly TargetGroup[]) {
  await postgresTransaction(context, async (client) => {
    await client.query("DELETE FROM target_group_snapshots");
    for (const group of groups) await writeGroup(client, group);
    await client.query(`DELETE FROM target_group_rules rules WHERE NOT EXISTS
      (SELECT 1 FROM target_group_snapshots groups WHERE groups.group_id=rules.group_id)`);
  });
}

async function removeGroup(context: PostgresContext, id: number) {
  await postgresTransaction(context, async (client) => {
    await client.query("DELETE FROM target_group_rules WHERE group_id=$1", [id]);
    await client.query("DELETE FROM target_group_snapshots WHERE group_id=$1", [id]);
  });
}

async function saveGroup(context: PostgresContext, group: TargetGroup) {
  await context.ready;
  await writeGroup(context.pool, group);
}

async function writeGroup(client: Pick<PoolClient, "query">, group: TargetGroup) {
  await client.query(`INSERT INTO target_group_snapshots
    (group_id,group_name,platform,status,rate_multiplier,updated_at) VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT(group_id) DO UPDATE SET group_name=EXCLUDED.group_name,platform=EXCLUDED.platform,
    status=EXCLUDED.status,rate_multiplier=EXCLUDED.rate_multiplier,updated_at=EXCLUDED.updated_at`,
  [group.id, group.name, group.platform ?? null, group.status ?? null,
    group.rate_multiplier ?? null, new Date().toISOString()]);
}

async function readBindings(context: PostgresContext, id: number) {
  const values = await rows<Record<string, unknown>>(context, `SELECT source_site_id,source_group_id
    FROM target_group_bindings WHERE group_id=$1 ORDER BY source_site_id,source_group_id`, [id]);
  return values.map((value) => ({ sourceSiteId: Number(value.source_site_id), sourceGroupId: String(value.source_group_id) }));
}

async function saveRules(context: PostgresContext, updates: readonly TargetRuleUpdate[]) {
  await postgresTransaction(context, async (client) => {
    for (const update of updates) await writeRule(client, update);
  });
}

async function writeRule(client: PoolClient, update: TargetRuleUpdate) {
  const rule = update.rule;
  await client.query(`INSERT INTO target_group_rules
    (group_id,group_name,enabled,rule_version,rule_type,parameters_json,current_rate,
      last_applied_from_rate,last_applied_to_rate,last_applied_at,last_error,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT(group_id) DO UPDATE SET group_name=EXCLUDED.group_name,enabled=EXCLUDED.enabled,
      rule_version=EXCLUDED.rule_version,rule_type=EXCLUDED.rule_type,
      parameters_json=EXCLUDED.parameters_json,current_rate=EXCLUDED.current_rate,
      last_error=EXCLUDED.last_error,updated_at=EXCLUDED.updated_at`,
  [rule.targetGroupId, rule.targetGroupName, flag(rule.enabled), rule.ruleVersion, rule.ruleType,
    JSON.stringify(rule.parameters), rule.currentRate, rule.lastAppliedFromRate, rule.lastAppliedToRate,
    rule.lastAppliedAt, rule.lastError, new Date().toISOString()]);
  await client.query("DELETE FROM target_group_bindings WHERE group_id=$1", [rule.targetGroupId]);
  for (const binding of update.bindings) await insertBinding(client, rule.targetGroupId, binding);
}

async function insertBinding(client: PoolClient, groupId: number, binding: SourceBinding) {
  await client.query(`INSERT INTO target_group_bindings (group_id,source_site_id,source_group_id)
    VALUES ($1,$2,$3)`, [groupId, binding.sourceSiteId, binding.sourceGroupId]);
}

async function recordApplied(context: PostgresContext, id: number, fromRate: number | null, toRate: number) {
  const timestamp = new Date().toISOString();
  await postgresTransaction(context, async (client) => {
    await client.query(`UPDATE target_group_rules SET current_rate=$2,last_applied_from_rate=$3,
      last_applied_to_rate=$2,last_applied_at=$4,last_error=NULL,updated_at=$4 WHERE group_id=$1`,
    [id, toRate, fromRate, timestamp]);
    await client.query("UPDATE target_group_snapshots SET rate_multiplier=$2,updated_at=$3 WHERE group_id=$1",
      [id, toRate, timestamp]);
  });
}

function mapRule(value: Record<string, unknown>): TargetRule {
  const version = Number(value.rule_version);
  if (version !== TARGET_RULE_VERSION) throw new Error(`不支持的倍率规则版本: ${version}`);
  return { targetGroupId: Number(value.group_id), targetGroupName: String(value.group_name),
    enabled: truthy(value.enabled), ruleVersion: version, ruleType: String(value.rule_type) as TargetRule["ruleType"],
    parameters: ruleParametersSchema.parse(JSON.parse(String(value.parameters_json))),
    currentRate: nullableNumber(value.current_rate), lastAppliedFromRate: nullableNumber(value.last_applied_from_rate),
    lastAppliedToRate: nullableNumber(value.last_applied_to_rate), lastAppliedAt: nullableText(value.last_applied_at),
    lastError: nullableText(value.last_error) };
}

function mapGroup(value: Record<string, unknown>): TargetGroup {
  return { id: Number(value.group_id), name: String(value.group_name), platform: nullableText(value.platform),
    status: nullableText(value.status), rate_multiplier: nullableNumber(value.rate_multiplier) };
}

function mapNullable<T>(value: Record<string, unknown> | null, mapper: (row: Record<string, unknown>) => T) {
  return value ? mapper(value) : null;
}
function flag(value: boolean) { return value ? 1 : 0; }
function truthy(value: unknown) { return value === true || Number(value) === 1; }
function nullableText(value: unknown) { return value === null || value === undefined ? null : String(value); }
function nullableNumber(value: unknown) { return value === null || value === undefined ? null : Number(value); }
