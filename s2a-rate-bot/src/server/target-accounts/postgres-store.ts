import type { PoolClient } from "pg";
import { execute, postgresTransaction, row, rows, type PostgresContext } from "../infrastructure/postgres-context.ts";
import type { TargetAccountStore } from "./store.ts";
import type { TargetAccount, TargetAccountBinding, TargetAccountTestState, TargetAccountView } from "./types.ts";

const ACCOUNT_VIEW_SELECT = `SELECT accounts.*,
  bindings.source_site_id AS binding_source_site_id,bindings.source_group_id AS binding_source_group_id,
  bindings.auto_manage_schedulable AS binding_auto_manage_schedulable,
  tests.status AS test_status,tests.message AS test_message,tests.latency_ms AS test_latency_ms,
  tests.model AS test_model,tests.tested_at FROM target_account_snapshots accounts
  LEFT JOIN target_account_bindings bindings ON bindings.account_id=accounts.account_id
  LEFT JOIN target_account_test_results tests ON tests.account_id=accounts.account_id`;

export function createPostgresTargetAccountStore(context: PostgresContext): TargetAccountStore {
  return {
    get: async (id) => mapNullable(await row<Record<string, unknown>>(context,
      `${ACCOUNT_VIEW_SELECT} WHERE accounts.account_id=$1`, [id])),
    list: async () => (await rows<Record<string, unknown>>(context,
      `${ACCOUNT_VIEW_SELECT} ORDER BY accounts.account_id`)).map(mapAccount),
    replaceAll: (accounts) => replaceAccounts(context, accounts),
    updateSchedulable: (id, schedulable) => updateSchedulable(context, id, schedulable),
    saveBinding: (id, binding) => saveBinding(context, id, binding),
    recordTest: (id, state) => recordTest(context, id, state),
    close: async () => undefined,
  };
}

async function replaceAccounts(context: PostgresContext, accounts: readonly TargetAccount[]) {
  await postgresTransaction(context, async (client) => {
    await client.query("DELETE FROM target_account_snapshots");
    for (const account of accounts) await writeAccount(client, account);
    await client.query(`DELETE FROM target_account_bindings WHERE account_id NOT IN
      (SELECT account_id FROM target_account_snapshots)`);
    await client.query(`DELETE FROM target_account_test_results WHERE account_id NOT IN
      (SELECT account_id FROM target_account_snapshots)`);
  });
}

async function writeAccount(client: PoolClient, account: TargetAccount) {
  await client.query(`INSERT INTO target_account_snapshots
    (account_id,account_name,platform,status,schedulable,rate_multiplier,priority,group_ids_json,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(account_id) DO UPDATE SET
    account_name=EXCLUDED.account_name,platform=EXCLUDED.platform,status=EXCLUDED.status,
    schedulable=EXCLUDED.schedulable,rate_multiplier=EXCLUDED.rate_multiplier,priority=EXCLUDED.priority,
    group_ids_json=EXCLUDED.group_ids_json,updated_at=EXCLUDED.updated_at`,
  [account.id, account.name, account.platform, account.status, flag(account.schedulable),
    account.rateMultiplier, account.priority, JSON.stringify(account.groupIds), new Date().toISOString()]);
}

async function updateSchedulable(context: PostgresContext, id: number, schedulable: boolean) {
  const result = await execute(context, `UPDATE target_account_snapshots SET schedulable=$2,updated_at=$3
    WHERE account_id=$1`, [id, flag(schedulable), new Date().toISOString()]);
  if (result.rowCount !== 1) throw new Error(`目标账号本地快照不存在: ${id}`);
}

async function saveBinding(context: PostgresContext, id: number, binding: TargetAccountBinding | null) {
  if (!binding) {
    await execute(context, "DELETE FROM target_account_bindings WHERE account_id=$1", [id]);
    return;
  }
  await execute(context, `INSERT INTO target_account_bindings
    (account_id,source_site_id,source_group_id,auto_manage_schedulable,updated_at)
    VALUES ($1,$2,$3,$4,$5) ON CONFLICT(account_id) DO UPDATE SET
    source_site_id=EXCLUDED.source_site_id,source_group_id=EXCLUDED.source_group_id,
    auto_manage_schedulable=EXCLUDED.auto_manage_schedulable,updated_at=EXCLUDED.updated_at`,
  [id, binding.sourceSiteId, binding.sourceGroupId, flag(binding.autoManageSchedulable), new Date().toISOString()]);
}

async function recordTest(context: PostgresContext, id: number, state: TargetAccountTestState) {
  await execute(context, `INSERT INTO target_account_test_results
    (account_id,status,message,latency_ms,model,tested_at) VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT(account_id) DO UPDATE SET status=EXCLUDED.status,message=EXCLUDED.message,
    latency_ms=EXCLUDED.latency_ms,model=EXCLUDED.model,tested_at=EXCLUDED.tested_at`,
  [id, state.status, state.message, state.latencyMs, state.model ?? null, state.testedAt]);
}

function mapAccount(value: Record<string, unknown>): TargetAccountView {
  return { id: Number(value.account_id), name: String(value.account_name), platform: String(value.platform),
    status: String(value.status), schedulable: truthy(value.schedulable),
    rateMultiplier: nullableNumber(value.rate_multiplier), priority: nullableNumber(value.priority),
    groupIds: parseGroupIds(value.group_ids_json), binding: mapBinding(value), lastTest: mapTest(value) };
}

function mapBinding(value: Record<string, unknown>): TargetAccountBinding | null {
  if (value.binding_source_site_id === null || value.binding_source_site_id === undefined) return null;
  return { sourceSiteId: Number(value.binding_source_site_id), sourceGroupId: String(value.binding_source_group_id),
    autoManageSchedulable: truthy(value.binding_auto_manage_schedulable) };
}

function mapTest(value: Record<string, unknown>): TargetAccountTestState | null {
  if (!value.test_status) return null;
  return { status: String(value.test_status) as TargetAccountTestState["status"], message: String(value.test_message),
    latencyMs: Number(value.test_latency_ms), ...(value.test_model ? { model: String(value.test_model) } : {}),
    testedAt: String(value.tested_at) };
}

function parseGroupIds(value: unknown) {
  const parsed = JSON.parse(String(value)) as unknown;
  if (!Array.isArray(parsed) || parsed.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new Error("本地账号分组快照无效");
  }
  return parsed as number[];
}

function mapNullable(value: Record<string, unknown> | null) { return value ? mapAccount(value) : null; }
function flag(value: boolean) { return value ? 1 : 0; }
function truthy(value: unknown) { return value === true || Number(value) === 1; }
function nullableNumber(value: unknown) { return value === null || value === undefined ? null : Number(value); }
