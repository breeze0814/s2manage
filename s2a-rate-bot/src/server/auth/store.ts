import { DatabaseSync } from "node:sqlite";
import { initializeSqliteSchema } from "../../storage/sqlite-schema.ts";
import { ensureDatabaseDirectory, nowIso, sqlitePath } from "../../storage/sqlite-utils.ts";
import type { Awaitable } from "../infrastructure/postgres-context.ts";

export type AdminUserRecord = {
  readonly email: string;
  readonly passwordHash: string;
};

export type AuthStore = {
  readonly getAdmin: () => Awaitable<AdminUserRecord | null>;
  readonly createAdmin: (admin: AdminUserRecord) => Awaitable<void>;
  readonly close: () => Awaitable<void>;
};

export function createSqliteAuthStore(databaseUrl: string): AuthStore {
  const databasePath = sqlitePath(databaseUrl);
  ensureDatabaseDirectory(databasePath);
  const database = new DatabaseSync(databasePath, { timeout: 5_000 });
  initializeSqliteSchema(database);
  return sqliteAuthStore(database);
}

function sqliteAuthStore(database: DatabaseSync): AuthStore {
  return {
    getAdmin: () => readAdmin(database),
    createAdmin: (admin) => insertAdmin(database, admin),
    close: () => database.close(),
  };
}

function readAdmin(database: DatabaseSync): AdminUserRecord | null {
  const row = database.prepare("SELECT email, password_hash FROM admin_users WHERE id = 1").get() as
    | { email: unknown; password_hash: unknown }
    | undefined;
  if (!row) return null;
  return { email: String(row.email), passwordHash: String(row.password_hash) };
}

function insertAdmin(database: DatabaseSync, admin: AdminUserRecord) {
  const timestamp = nowIso();
  database.prepare(`
    INSERT INTO admin_users (id, email, password_hash, created_at, updated_at)
    VALUES (1, :email, :passwordHash, :createdAt, :updatedAt)
  `).run({ ...admin, createdAt: timestamp, updatedAt: timestamp });
}
