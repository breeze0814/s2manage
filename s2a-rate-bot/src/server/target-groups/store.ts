import { DatabaseSync } from "node:sqlite";
import { initializeSqliteSchema } from "../../storage/sqlite-schema.ts";
import { ensureDatabaseDirectory, flag, nowIso, sqlitePath, transaction } from "../../storage/sqlite-utils.ts";
import type { SourceBinding, TargetRule } from "./types.ts";

export type TargetGroupStore = {
  readonly getRule: (groupId: number) => TargetRule | null;
  readonly listRules: () => TargetRule[];
  readonly bindings: (groupId: number) => SourceBinding[];
  readonly saveRule: (rule: TargetRule, bindings: readonly SourceBinding[]) => void;
  readonly recordApplied: (groupId: number, currentRate: number) => void;
  readonly recordError: (groupId: number, error: string) => void;
  readonly close: () => void;
};

export function createSqliteTargetGroupStore(databaseUrl: string): TargetGroupStore {
  const path = sqlitePath(databaseUrl);
  ensureDatabaseDirectory(path);
  const database = new DatabaseSync(path, { timeout: 5_000 });
  initializeSqliteSchema(database);
  return targetGroupStore(database);
}

function targetGroupStore(database: DatabaseSync): TargetGroupStore {
  return {
    getRule: (groupId) => readRule(database, groupId),
    listRules: () => listRules(database),
    bindings: (groupId) => readBindings(database, groupId),
    saveRule: (rule, bindings) => saveRule(database, rule, bindings),
    recordApplied: (groupId, currentRate) => recordApplied(database, groupId, currentRate),
    recordError: (groupId, error) => recordError(database, groupId, error),
    close: () => database.close(),
  };
}

function readRule(database: DatabaseSync, groupId: number): TargetRule | null {
  const row = database.prepare("SELECT * FROM target_group_rules WHERE group_id = ?").get(groupId) as Record<string, unknown> | undefined;
  return row ? mapRule(row) : null;
}

function listRules(database: DatabaseSync) {
  return (database.prepare("SELECT * FROM target_group_rules ORDER BY group_id").all() as Record<string, unknown>[]).map(mapRule);
}

function readBindings(database: DatabaseSync, groupId: number): SourceBinding[] {
  const rows = database.prepare("SELECT source_site_id, source_group_id FROM target_group_bindings WHERE group_id = ? ORDER BY source_site_id, source_group_id").all(groupId) as Record<string, unknown>[];
  return rows.map((row) => ({ sourceSiteId: Number(row.source_site_id), sourceGroupId: String(row.source_group_id) }));
}

function saveRule(database: DatabaseSync, rule: TargetRule, bindings: readonly SourceBinding[]) {
  transaction(database, () => {
    database.prepare(`INSERT INTO target_group_rules VALUES (
      :groupId, :groupName, :enabled, :ruleVersion, :ruleType, :parameters, :currentRate,
      :lastAppliedAt, :lastError, :updatedAt)
      ON CONFLICT(group_id) DO UPDATE SET group_name=excluded.group_name, enabled=excluded.enabled,
      rule_version=excluded.rule_version, rule_type=excluded.rule_type, parameters_json=excluded.parameters_json,
      current_rate=excluded.current_rate, updated_at=excluded.updated_at`).run(ruleBindings(rule));
    database.prepare("DELETE FROM target_group_bindings WHERE group_id = ?").run(rule.targetGroupId);
    const statement = database.prepare("INSERT INTO target_group_bindings VALUES (?, ?, ?)");
    for (const binding of bindings) statement.run(rule.targetGroupId, binding.sourceSiteId, binding.sourceGroupId);
  });
}

function ruleBindings(rule: TargetRule) {
  return { groupId: rule.targetGroupId, groupName: rule.targetGroupName, enabled: flag(rule.enabled), ruleVersion: rule.ruleVersion, ruleType: rule.ruleType, parameters: JSON.stringify(rule.parameters), currentRate: rule.currentRate, lastAppliedAt: rule.lastAppliedAt, lastError: rule.lastError, updatedAt: nowIso() };
}

function recordApplied(database: DatabaseSync, groupId: number, currentRate: number) {
  database.prepare("UPDATE target_group_rules SET current_rate=?, last_applied_at=?, last_error=NULL, updated_at=? WHERE group_id=?").run(currentRate, nowIso(), nowIso(), groupId);
}

function recordError(database: DatabaseSync, groupId: number, error: string) {
  database.prepare("UPDATE target_group_rules SET last_error=?, updated_at=? WHERE group_id=?").run(error, nowIso(), groupId);
}

function mapRule(row: Record<string, unknown>): TargetRule {
  return {
    targetGroupId: Number(row.group_id), targetGroupName: String(row.group_name), enabled: Number(row.enabled) === 1,
    ruleVersion: 1, ruleType: String(row.rule_type) as TargetRule["ruleType"],
    parameters: JSON.parse(String(row.parameters_json)) as TargetRule["parameters"],
    currentRate: row.current_rate === null ? null : Number(row.current_rate),
    lastAppliedAt: nullableText(row.last_applied_at), lastError: nullableText(row.last_error),
  };
}

function nullableText(value: unknown) { return value === null || value === undefined ? null : String(value); }
