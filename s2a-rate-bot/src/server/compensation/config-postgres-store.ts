import { execute, row, type PostgresContext } from "../infrastructure/postgres-context.ts";
import type { CompensationRule } from "../../core/compensation.ts";
import type { CompensationConfigStore, StoredCompensationSettings } from "./config-store.ts";

type SettingsRow = { enabled: number; activity_name: string; description: string; order_source: "json" | "url"; base_url: string;
  username: string; password_enc: string; rules_json: string; updated_at: string };

export function createPostgresCompensationConfigStore(context: PostgresContext): CompensationConfigStore {
  return { get: () => readSettings(context), save: (settings) => saveSettings(context, settings), close: async () => undefined };
}

async function readSettings(context: PostgresContext) {
  const value = await row<SettingsRow>(context, "SELECT * FROM embed_compensation_settings WHERE id=1");
  return value ? mapSettings(value) : null;
}

async function saveSettings(context: PostgresContext, settings: Omit<StoredCompensationSettings, "updatedAt">) {
  const updatedAt = new Date().toISOString();
  await execute(context, `INSERT INTO embed_compensation_settings
    (id,enabled,activity_name,description,order_source,base_url,username,password_enc,rules_json,updated_at)
    VALUES (1,$1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO UPDATE SET enabled=EXCLUDED.enabled,
    activity_name=EXCLUDED.activity_name,description=EXCLUDED.description,order_source=EXCLUDED.order_source,
    base_url=EXCLUDED.base_url,
    username=EXCLUDED.username,password_enc=EXCLUDED.password_enc,rules_json=EXCLUDED.rules_json,
    updated_at=EXCLUDED.updated_at`, [settings.enabled ? 1 : 0, settings.activityName, settings.description,
    settings.orderSource, settings.baseUrl, settings.username, settings.passwordEnc,
    JSON.stringify(settings.rules), updatedAt]);
  const saved = await readSettings(context);
  if (!saved) throw new Error("补偿活动配置保存失败");
  return saved;
}

function mapSettings(value: SettingsRow): StoredCompensationSettings {
  const rules = JSON.parse(value.rules_json) as unknown;
  if (!Array.isArray(rules)) throw new Error("补偿活动规则 JSON 无效");
  return { enabled: value.enabled === 1, activityName: value.activity_name, description: value.description,
    orderSource: value.order_source, baseUrl: value.base_url, username: value.username, passwordEnc: value.password_enc,
    rules: rules as readonly CompensationRule[], updatedAt: value.updated_at };
}
