import { DatabaseSync } from "node:sqlite";
import { initializeSqliteSchema } from "../../storage/sqlite-schema.ts";
import { ensureDatabaseDirectory, sqlitePath, transaction } from "../../storage/sqlite-utils.ts";
import type { Awaitable } from "../infrastructure/postgres-context.ts";

export type RuntimeLease = Readonly<{
  key: string;
  ownerId: string;
  expiresAt: string;
}>;

export type RuntimeLeaseStore = Readonly<{
  tryAcquire: (lease: RuntimeLease, updatedAt: string) => Awaitable<boolean>;
  release: (key: string, ownerId: string) => Awaitable<void>;
  close: () => Awaitable<void>;
}>;

export function createSqliteRuntimeLeaseStore(databaseUrl: string) {
  const path = sqlitePath(databaseUrl);
  ensureDatabaseDirectory(path);
  const database = new DatabaseSync(path, { timeout: 5_000 });
  initializeSqliteSchema(database);
  return {
    tryAcquire: (lease, updatedAt) => tryAcquire(database, lease, updatedAt),
    release: (key, ownerId) => release(database, key, ownerId),
    close: () => database.close(),
  } satisfies RuntimeLeaseStore;
}

function tryAcquire(database: DatabaseSync, lease: RuntimeLease, updatedAt: string) {
  let acquired = false;
  transaction(database, () => {
    database.prepare("DELETE FROM runtime_operation_leases WHERE expires_at <= ?").run(updatedAt);
    const result = database.prepare(`INSERT INTO runtime_operation_leases
      (lease_key, owner_id, expires_at, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(lease_key) DO NOTHING`).run(
      lease.key, lease.ownerId, lease.expiresAt, updatedAt,
    );
    acquired = Number(result.changes) === 1;
  });
  return acquired;
}

function release(database: DatabaseSync, key: string, ownerId: string) {
  database.prepare("DELETE FROM runtime_operation_leases WHERE lease_key=? AND owner_id=?").run(key, ownerId);
}
