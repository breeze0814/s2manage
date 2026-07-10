import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";

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

export function flag(value: boolean) { return value ? 1 : 0; }
export function nowIso() { return new Date().toISOString(); }
