import { DatabaseSync } from "node:sqlite";
import { initializeSqliteSchema } from "../../storage/sqlite-schema.ts";
import { ensureDatabaseDirectory, flag, nowIso, sqlitePath, transaction } from "../../storage/sqlite-utils.ts";
import type { TargetAccount } from "./types.ts";

export type TargetAccountStore = {
  readonly list: () => TargetAccount[];
  readonly replaceAll: (accounts: readonly TargetAccount[]) => void;
  readonly save: (account: TargetAccount) => void;
  readonly close: () => void;
};

export function createSqliteTargetAccountStore(databaseUrl: string): TargetAccountStore {
  const path = sqlitePath(databaseUrl);
  ensureDatabaseDirectory(path);
  const database = new DatabaseSync(path, { timeout: 5_000 });
  initializeSqliteSchema(database);
  return {
    list: () => listAccounts(database),
    replaceAll: (accounts) => replaceAccounts(database, accounts),
    save: (account) => saveAccount(database, account),
    close: () => database.close(),
  };
}

function listAccounts(database: DatabaseSync) {
  const rows = database.prepare("SELECT * FROM target_account_snapshots ORDER BY account_id").all() as Record<string, unknown>[];
  return rows.map(mapAccount);
}

function replaceAccounts(database: DatabaseSync, accounts: readonly TargetAccount[]) {
  transaction(database, () => {
    database.prepare("DELETE FROM target_account_snapshots").run();
    for (const account of accounts) saveAccount(database, account);
  });
}

function saveAccount(database: DatabaseSync, account: TargetAccount) {
  database.prepare(`INSERT INTO target_account_snapshots VALUES (
    :id, :name, :platform, :status, :schedulable, :rateMultiplier, :priority, :groupIds, :updatedAt)
    ON CONFLICT(account_id) DO UPDATE SET account_name=excluded.account_name,
    platform=excluded.platform, status=excluded.status, schedulable=excluded.schedulable,
    rate_multiplier=excluded.rate_multiplier, priority=excluded.priority,
    group_ids_json=excluded.group_ids_json, updated_at=excluded.updated_at`).run(accountBindings(account));
}

function accountBindings(account: TargetAccount) {
  return { ...account, schedulable: flag(account.schedulable), groupIds: JSON.stringify(account.groupIds), updatedAt: nowIso() };
}

function mapAccount(row: Record<string, unknown>): TargetAccount {
  return {
    id: Number(row.account_id), name: String(row.account_name), platform: String(row.platform),
    status: String(row.status), schedulable: Number(row.schedulable) === 1,
    rateMultiplier: nullableNumber(row.rate_multiplier), priority: nullableNumber(row.priority),
    groupIds: parseGroupIds(row.group_ids_json),
  };
}

function parseGroupIds(value: unknown) {
  const parsed = JSON.parse(String(value)) as unknown;
  if (!Array.isArray(parsed) || parsed.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new Error("本地账号分组快照无效");
  }
  return parsed as number[];
}

function nullableNumber(value: unknown) { return value === null || value === undefined ? null : Number(value); }
