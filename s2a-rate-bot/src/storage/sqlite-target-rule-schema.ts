import type { DatabaseSync } from "node:sqlite";
import { TARGET_RULE_VERSION } from "../core/rule-version.ts";

export function ensureTargetRuleSchema(database: DatabaseSync) {
  const columns = database.prepare("PRAGMA table_info(target_group_rules)").all() as Array<{ name: string }>;
  const names = new Set(columns.map((column) => column.name));
  if (!names.has("last_applied_from_rate")) {
    database.exec("ALTER TABLE target_group_rules ADD COLUMN last_applied_from_rate REAL");
  }
  if (!names.has("last_applied_to_rate")) {
    database.exec("ALTER TABLE target_group_rules ADD COLUMN last_applied_to_rate REAL");
  }
  database.prepare(`UPDATE target_group_rules
    SET parameters_json = json_remove(json_set(parameters_json,
      '$.adjustmentMode', 'fixed',
      '$.adjustmentValue', COALESCE(json_extract(parameters_json, '$.offset'), 0)), '$.offset'),
      rule_version = ?
    WHERE rule_version = 1`).run(TARGET_RULE_VERSION);
}
