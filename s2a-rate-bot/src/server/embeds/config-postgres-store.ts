import { randomBytes } from "node:crypto";
import { execute, row, type PostgresContext } from "../infrastructure/postgres-context.ts";
import type { EmbedConfigStore } from "./config-store.ts";
import type { EmbedConfig, EmbedKind } from "./types.ts";

type ConfigRow = { kind: EmbedKind; embed_token: string; config_json: string; created_at: string; updated_at: string };

export function createPostgresEmbedConfigStore(context: PostgresContext): EmbedConfigStore {
  return {
    get: (kind) => readConfig(context, "kind", kind),
    getByToken: (value) => readConfig(context, "embed_token", value),
    ensure: (kind, config) => ensureConfig(context, kind, config),
    update: (kind, config) => updateConfig(context, kind, config),
    rotate: (kind) => rotateConfig(context, kind),
    close: async () => undefined,
  };
}

async function readConfig(context: PostgresContext, column: "kind" | "embed_token", value: string) {
  const found = await row<ConfigRow>(context, `SELECT * FROM embed_configs WHERE ${column}=$1`, [value]);
  return found ? mapConfig(found) : null;
}

async function ensureConfig(context: PostgresContext, kind: EmbedKind, config: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  await execute(context, `INSERT INTO embed_configs (kind,embed_token,config_json,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$4) ON CONFLICT(kind) DO NOTHING`,
  [kind, token(), JSON.stringify(config), timestamp]);
  return requiredConfig(context, kind);
}

async function updateConfig(context: PostgresContext, kind: EmbedKind, config: Record<string, unknown>) {
  const result = await execute(context, "UPDATE embed_configs SET config_json=$1,updated_at=$2 WHERE kind=$3",
    [JSON.stringify(config), new Date().toISOString(), kind]);
  if (result.rowCount !== 1) throw new Error(`嵌入配置不存在: ${kind}`);
  return requiredConfig(context, kind);
}

async function rotateConfig(context: PostgresContext, kind: EmbedKind) {
  const result = await execute(context, "UPDATE embed_configs SET embed_token=$1,updated_at=$2 WHERE kind=$3",
    [token(), new Date().toISOString(), kind]);
  if (result.rowCount !== 1) throw new Error(`嵌入配置不存在: ${kind}`);
  return requiredConfig(context, kind);
}

async function requiredConfig(context: PostgresContext, kind: EmbedKind) {
  const config = await readConfig(context, "kind", kind);
  if (!config) throw new Error(`读取嵌入配置失败: ${kind}`);
  return config;
}

function mapConfig(value: ConfigRow): EmbedConfig {
  const config = JSON.parse(value.config_json) as unknown;
  if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error(`嵌入配置 JSON 无效: ${value.kind}`);
  return { kind: value.kind, embedToken: value.embed_token, config: config as Record<string, unknown>,
    createdAt: value.created_at, updatedAt: value.updated_at };
}
function token() { return randomBytes(32).toString("base64url"); }
