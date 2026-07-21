import { DatabaseSync } from "node:sqlite";
import { initializeSqliteSchema } from "../../storage/sqlite-schema.ts";
import { ensureDatabaseDirectory, nowIso, sqlitePath, transaction } from "../../storage/sqlite-utils.ts";
import type { TargetAccount, TargetAccountBinding, TargetAccountTestState, TargetAccountView } from "./types.ts";

export type TargetAccountStore = {
  readonly get: (accountId: number) => TargetAccountView | null;
  readonly list: () => TargetAccountView[];
  readonly replaceAll: (accounts: readonly TargetAccount[]) => void;
  readonly updateSchedulable: (accountId: number, schedulable: boolean) => void;
  readonly saveBinding: (accountId: number, binding: TargetAccountBinding | null) => void;
  readonly recordTest: (accountId: number, state: TargetAccountTestState) => void;
  readonly close: () => void;
};

export function createSqliteTargetAccountStore(databaseUrl: string): TargetAccountStore {
  const path = sqlitePath(databaseUrl);
  ensureDatabaseDirectory(path);
  const database = new DatabaseSync(path, { timeout: 5_000 });
  initializeSqliteSchema(database);
  return {
    get: (accountId) => getAccount(database, accountId),
    list: () => listAccounts(database),
    replaceAll: (accounts) => replaceAccounts(database, accounts),
    updateSchedulable: (accountId, schedulable) => updateSchedulable(database, accountId, schedulable),
    saveBinding: (accountId, binding) => saveBinding(database, accountId, binding),
    recordTest: (accountId, state) => recordTest(database, accountId, state),
    close: () => database.close(),
  };
}

const ACCOUNT_VIEW_SELECT = `SELECT accounts.*,
  bindings.source_site_id AS binding_source_site_id,
  bindings.source_group_id AS binding_source_group_id,
  bindings.auto_manage_schedulable AS binding_auto_manage_schedulable,
  tests.status AS test_status, tests.message AS test_message,
  tests.latency_ms AS test_latency_ms, tests.model AS test_model, tests.tested_at
  FROM target_account_snapshots AS accounts
  LEFT JOIN target_account_bindings AS bindings ON bindings.account_id = accounts.account_id
  LEFT JOIN target_account_test_results AS tests ON tests.account_id = accounts.account_id`;

function getAccount(database: DatabaseSync, accountId: number) {
  const row = database.prepare(`${ACCOUNT_VIEW_SELECT} WHERE accounts.account_id = ?`).get(accountId) as Record<string, unknown> | undefined;
  return row ? mapAccount(row) : null;
}

function listAccounts(database: DatabaseSync) {
  const rows = database.prepare(`${ACCOUNT_VIEW_SELECT} ORDER BY accounts.account_id`).all() as Record<string, unknown>[];
  return rows.map(mapAccount);
}

function replaceAccounts(database: DatabaseSync, accounts: readonly TargetAccount[]) {
  transaction(database, () => {
    database.prepare("DELETE FROM target_account_snapshots").run();
    for (const account of accounts) saveAccount(database, account);
    removeOrphanAccountState(database);
  });
}

function saveAccount(database: DatabaseSync, account: TargetAccount) {
  database.prepare(`INSERT INTO target_account_snapshots
    (account_id, account_name, platform, status, schedulable, rate_multiplier, priority, group_ids_json, updated_at)
    VALUES (:id, :name, :platform, :status, :schedulable, :rateMultiplier, :priority, :groupIds, :updatedAt)
    ON CONFLICT(account_id) DO UPDATE SET account_name=excluded.account_name,
    platform=excluded.platform, status=excluded.status, schedulable=excluded.schedulable,
    rate_multiplier=excluded.rate_multiplier, priority=excluded.priority,
    group_ids_json=excluded.group_ids_json, updated_at=excluded.updated_at`).run(accountBindings(account));
}

function accountBindings(account: TargetAccount) {
  return { ...account, schedulable: account.schedulable ? 1 : 0, groupIds: JSON.stringify(account.groupIds), updatedAt: nowIso() };
}

function updateSchedulable(database: DatabaseSync, accountId: number, schedulable: boolean) {
  database.prepare("UPDATE target_account_snapshots SET schedulable = ?, updated_at = ? WHERE account_id = ?")
    .run(schedulable ? 1 : 0, nowIso(), accountId);
}

function saveBinding(database: DatabaseSync, accountId: number, binding: TargetAccountBinding | null) {
  if (!binding) {
    database.prepare("DELETE FROM target_account_bindings WHERE account_id = ?").run(accountId);
    return;
  }
  database.prepare(`INSERT INTO target_account_bindings
    (account_id, source_site_id, source_group_id, auto_manage_schedulable, updated_at)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT(account_id) DO UPDATE SET source_site_id=excluded.source_site_id,
    source_group_id=excluded.source_group_id, auto_manage_schedulable=excluded.auto_manage_schedulable,
    updated_at=excluded.updated_at`)
    .run(accountId, binding.sourceSiteId, binding.sourceGroupId, binding.autoManageSchedulable ? 1 : 0, nowIso());
}

function recordTest(database: DatabaseSync, accountId: number, state: TargetAccountTestState) {
  database.prepare(`INSERT INTO target_account_test_results
    (account_id, status, message, latency_ms, model, tested_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(account_id) DO UPDATE SET status=excluded.status, message=excluded.message,
    latency_ms=excluded.latency_ms, model=excluded.model, tested_at=excluded.tested_at`)
    .run(accountId, state.status, state.message, state.latencyMs, state.model ?? null, state.testedAt);
}

function removeOrphanAccountState(database: DatabaseSync) {
  database.prepare("DELETE FROM target_account_bindings WHERE account_id NOT IN (SELECT account_id FROM target_account_snapshots)").run();
  database.prepare("DELETE FROM target_account_test_results WHERE account_id NOT IN (SELECT account_id FROM target_account_snapshots)").run();
}

function mapAccount(row: Record<string, unknown>): TargetAccountView {
  return {
    id: Number(row.account_id), name: String(row.account_name), platform: String(row.platform),
    status: String(row.status),
    schedulable: Number(row.schedulable) === 1,
    rateMultiplier: nullableNumber(row.rate_multiplier), priority: nullableNumber(row.priority),
    groupIds: parseGroupIds(row.group_ids_json),
    binding: mapBinding(row),
    lastTest: mapTestState(row),
  };
}

function mapBinding(row: Record<string, unknown>) {
  if (row.binding_source_site_id === null || row.binding_source_site_id === undefined) return null;
  return {
    sourceSiteId: Number(row.binding_source_site_id), sourceGroupId: String(row.binding_source_group_id),
    autoManageSchedulable: Number(row.binding_auto_manage_schedulable) === 1,
  };
}

function mapTestState(row: Record<string, unknown>): TargetAccountTestState | null {
  if (!row.test_status) return null;
  return {
    status: String(row.test_status) as TargetAccountTestState["status"],
    message: String(row.test_message), latencyMs: Number(row.test_latency_ms),
    ...(row.test_model ? { model: String(row.test_model) } : {}),
    testedAt: String(row.tested_at),
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
