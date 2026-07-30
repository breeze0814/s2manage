import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { initializeSqliteSchema } from "../../storage/sqlite-schema.ts";
import { ensureDatabaseDirectory, nowIso, sqlitePath } from "../../storage/sqlite-utils.ts";
import type { EmbedConfig, EmbedKind } from "./types.ts";

export type EmbedConfigStore = {
  readonly get: (kind: EmbedKind) => EmbedConfig | null;
  readonly getByToken: (token: string) => EmbedConfig | null;
  readonly ensure: (kind: EmbedKind, config: Record<string, unknown>) => EmbedConfig;
  readonly update: (kind: EmbedKind, config: Record<string, unknown>) => EmbedConfig;
  readonly rotate: (kind: EmbedKind) => EmbedConfig;
  readonly close: () => void;
};

export function createSqliteEmbedConfigStore(databaseUrl: string): EmbedConfigStore {
  const path = sqlitePath(databaseUrl);
  ensureDatabaseDirectory(path);
  const database = new DatabaseSync(path, { timeout: 5_000 });
  initializeSqliteSchema(database);
  return {
    get: (kind) => readConfig(database, "kind", kind),
    getByToken: (token) => readConfig(database, "embed_token", token),
    ensure: (kind, config) => ensureConfig(database, kind, config),
    update: (kind, config) => updateConfig(database, kind, config),
    rotate: (kind) => rotateToken(database, kind),
    close: () => database.close(),
  };
}

function readConfig(database: DatabaseSync, column: "kind" | "embed_token", value: string) {
  const row = database.prepare(`SELECT * FROM embed_configs WHERE ${column} = ?`).get(value) as ConfigRow | undefined;
  return row ? mapConfig(row) : null;
}

function ensureConfig(database: DatabaseSync, kind: EmbedKind, config: Record<string, unknown>) {
  const current = readConfig(database, "kind", kind);
  if (current) return current;
  const timestamp = nowIso();
  database.prepare(`INSERT INTO embed_configs
    (kind, embed_token, config_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
    .run(kind, token(), JSON.stringify(config), timestamp, timestamp);
  return requiredConfig(database, kind);
}

function updateConfig(database: DatabaseSync, kind: EmbedKind, config: Record<string, unknown>) {
  const result = database.prepare(`UPDATE embed_configs SET config_json = ?, updated_at = ? WHERE kind = ?`)
    .run(JSON.stringify(config), nowIso(), kind);
  if (result.changes !== 1) throw new Error(`嵌入配置不存在: ${kind}`);
  return requiredConfig(database, kind);
}

function rotateToken(database: DatabaseSync, kind: EmbedKind) {
  const result = database.prepare(`UPDATE embed_configs SET embed_token = ?, updated_at = ? WHERE kind = ?`)
    .run(token(), nowIso(), kind);
  if (result.changes !== 1) throw new Error(`嵌入配置不存在: ${kind}`);
  return requiredConfig(database, kind);
}

function requiredConfig(database: DatabaseSync, kind: EmbedKind) {
  const value = readConfig(database, "kind", kind);
  if (!value) throw new Error(`读取嵌入配置失败: ${kind}`);
  return value;
}

function mapConfig(row: ConfigRow): EmbedConfig {
  const value = JSON.parse(row.config_json) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`嵌入配置 JSON 无效: ${row.kind}`);
  return { kind: row.kind, embedToken: row.embed_token, config: value as Record<string, unknown>, createdAt: row.created_at, updatedAt: row.updated_at };
}

function token() { return randomBytes(32).toString("base64url"); }

type ConfigRow = {
  readonly kind: EmbedKind;
  readonly embed_token: string;
  readonly config_json: string;
  readonly created_at: string;
  readonly updated_at: string;
};
