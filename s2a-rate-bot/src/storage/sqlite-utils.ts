import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";

export type SqliteRow = Record<string, unknown>;
export type SqliteBindings = Record<string, SQLInputValue>;

const SQLITE_FILE_PREFIX = "file:";

export function sqlitePath(databaseUrl: string) {
  if (!databaseUrl.startsWith(SQLITE_FILE_PREFIX)) {
    throw new Error("DATABASE_URL must use a local SQLite file: URL");
  }
  const value = databaseUrl.slice(SQLITE_FILE_PREFIX.length);
  if (!value.trim()) throw new Error("DATABASE_URL file path is empty");
  if (value === ":memory:") return value;
  return isAbsolute(value) ? value : resolve(value);
}

export function ensureDatabaseDirectory(databasePath: string) {
  if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
}

export function transaction(database: DatabaseSync, task: () => void) {
  database.exec("BEGIN IMMEDIATE");
  try {
    task();
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function execute(database: DatabaseSync, sql: string, bindings: SqliteBindings = {}) {
  database.prepare(sql).run(bindings);
}

export function one(database: DatabaseSync, sql: string, bindings: SqliteBindings = {}) {
  return database.prepare(sql).get(bindings) as SqliteRow | undefined ?? null;
}

export function all(database: DatabaseSync, sql: string, bindings: SqliteBindings = {}) {
  return database.prepare(sql).all(bindings) as SqliteRow[];
}

export function flag(value: boolean) {
  return value ? 1 : 0;
}

export function bool(value: unknown) {
  return Number(value) === 1;
}

export function text(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}

export function optionalText(value: unknown) {
  const result = text(value);
  return result ? result : undefined;
}

export function number(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new Error(`Invalid number from database: ${String(value)}`);
  return numeric;
}

export function nullableNumber(value: unknown) {
  return value === null || value === undefined ? null : number(value);
}

export function int(value: unknown) {
  const numeric = number(value);
  if (!Number.isInteger(numeric)) throw new Error(`Invalid integer from database: ${String(value)}`);
  return numeric;
}

export function nowIso() {
  return new Date().toISOString();
}
