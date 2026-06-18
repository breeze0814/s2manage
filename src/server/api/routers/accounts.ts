import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import { writeSyncLog } from "@/server/sync-logs";
import { decrypt } from "@/server/crypto";
import { Sub2ApiAdminClient } from "@/server/clients/sub2api-admin";
import { normalizeRateMultiplier } from "@/server/rates";
import { fetchAccountBalances } from "@/server/account-balance";
import { getAccountId } from "@/server/account-utils";
import { getSetting, setSetting } from "@/server/settings";

async function getClient(connectionId: number) {
  const conn = await db.connection.findUniqueOrThrow({ where: { id: connectionId } });
  return new Sub2ApiAdminClient(conn.baseUrl, decrypt(conn.adminApiKey));
}

async function logSync(connectionId: number, action: string, target: string, detail: Record<string, unknown>, status: "success" | "failed", error?: string) {
  await writeSyncLog(db, { connectionId, action, target, detail, status, error });
}

async function safeLogSync(connectionId: number, action: string, target: string, detail: Record<string, unknown>, status: "success" | "failed", error?: string) {
  try {
    await logSync(connectionId, action, target, detail, status, error);
  } catch {
    // Logging must not hide the remote operation result.
  }
}

const accountTypeInput = z.enum(["oauth", "setup-token", "apikey", "upstream", "bedrock", "service_account"]);
const statusInput = z.enum(["active", "inactive", "error"]);
const jsonObjectInput = z.record(z.string(), z.unknown());

const accountWriteShape = {
  name: z.string().trim().min(1).max(100).optional(),
  notes: z.string().max(2_000).nullable().optional(),
  type: accountTypeInput.optional(),
  credentials: jsonObjectInput.optional(),
  extra: jsonObjectInput.optional(),
  proxyId: z.number().int().min(0).nullable().optional(),
  status: statusInput.optional(),
  schedulable: z.boolean().optional(),
  concurrency: z.number().int().min(0).max(100_000).optional(),
  priority: z.number().int().min(0).max(100_000).optional(),
  loadFactor: z.number().int().min(0).max(100_000).nullable().optional(),
  rateMultiplier: z.number().finite().min(0).max(100_000).optional(),
  groupIds: z.array(z.number().int().positive()).optional(),
  expiresAt: z.number().int().min(0).nullable().optional(),
  autoPauseOnExpired: z.boolean().optional(),
  confirmMixedChannelRisk: z.boolean().optional(),
};

const accountCreateInput = z.object({
  connectionId: z.number().int().positive(),
  name: z.string().trim().min(1).max(100),
  notes: z.string().max(2_000).nullable().optional(),
  platform: z.string().trim().min(1).max(50),
  type: accountTypeInput,
  credentials: jsonObjectInput,
  extra: jsonObjectInput.optional(),
  proxyId: z.number().int().min(0).nullable().optional(),
  schedulable: z.boolean().optional(),
  concurrency: z.number().int().min(0).max(100_000).optional(),
  priority: z.number().int().min(0).max(100_000).optional(),
  loadFactor: z.number().int().min(0).max(100_000).nullable().optional(),
  rateMultiplier: z.number().finite().min(0).max(100_000).optional(),
  groupIds: z.array(z.number().int().positive()).optional(),
  expiresAt: z.number().int().min(0).nullable().optional(),
  autoPauseOnExpired: z.boolean().optional(),
  confirmMixedChannelRisk: z.boolean().optional(),
});

function balanceThresholdsSettingKey(connectionId: number) {
  return `account_balance_thresholds:${connectionId}`;
}

function normalizeBalanceThresholds(value: unknown) {
  const thresholds: Record<string, number> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return thresholds;

  for (const [rawAccountId, rawThreshold] of Object.entries(value)) {
    const accountId = Number(rawAccountId);
    const threshold = Number(rawThreshold);
    if (!Number.isInteger(accountId) || accountId <= 0) continue;
    if (!Number.isFinite(threshold) || threshold < 0) continue;
    thresholds[String(accountId)] = threshold;
  }

  return thresholds;
}

async function readBalanceThresholds(connectionId: number) {
  const raw = await getSetting(balanceThresholdsSettingKey(connectionId), "{}");
  try {
    return normalizeBalanceThresholds(JSON.parse(raw) as unknown);
  } catch {
    return {};
  }
}

async function writeBalanceThresholds(connectionId: number, thresholds: Record<string, number>) {
  const sorted = Object.fromEntries(
    Object.entries(normalizeBalanceThresholds(thresholds)).sort(([left], [right]) => Number(left) - Number(right)),
  );
  await setSetting(balanceThresholdsSettingKey(connectionId), JSON.stringify(sorted));
}

async function removeBalanceThreshold(connectionId: number, accountId: number) {
  const thresholds = await readBalanceThresholds(connectionId);
  if (!(String(accountId) in thresholds)) return;
  delete thresholds[String(accountId)];
  await writeBalanceThresholds(connectionId, thresholds);
}

const accountUpdateInput = z.object({
  connectionId: z.number().int().positive(),
  accountId: z.number().int().positive(),
  ...accountWriteShape,
});

function buildAccountPayload(input: z.infer<typeof accountCreateInput> | z.infer<typeof accountUpdateInput>) {
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.notes !== undefined) payload.notes = input.notes;
  if ("platform" in input && input.platform !== undefined) payload.platform = input.platform;
  if (input.type !== undefined) payload.type = input.type;
  if (input.credentials !== undefined) payload.credentials = input.credentials;
  if (input.extra !== undefined) payload.extra = input.extra;
  if (input.proxyId !== undefined) payload.proxy_id = input.proxyId;
  if (input.concurrency !== undefined) payload.concurrency = input.concurrency;
  if (input.priority !== undefined) payload.priority = input.priority;
  if (input.loadFactor !== undefined) payload.load_factor = input.loadFactor;
  if (input.rateMultiplier !== undefined) payload.rate_multiplier = normalizeRateMultiplier(input.rateMultiplier);
  if ("status" in input && input.status !== undefined) payload.status = input.status;
  if (input.groupIds !== undefined) payload.group_ids = Array.from(new Set(input.groupIds));
  if (input.expiresAt !== undefined) payload.expires_at = input.expiresAt;
  if (input.autoPauseOnExpired !== undefined) payload.auto_pause_on_expired = input.autoPauseOnExpired;
  if (input.confirmMixedChannelRisk !== undefined) payload.confirm_mixed_channel_risk = input.confirmMixedChannelRisk;
  return payload;
}

export const accountsRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const client = await getClient(input.connectionId);
      return client.listAccounts();
    }),
  balances: protectedProcedure
    .input(z.object({
      connectionId: z.number().int().positive(),
      accountIds: z.array(z.number().int().positive()).max(200),
      force: z.boolean().default(false),
    }))
    .query(async ({ input }) => {
      const client = await getClient(input.connectionId);
      return fetchAccountBalances({
        client,
        accountIds: input.accountIds,
        force: input.force,
      });
    }),
  balanceThresholds: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive() }))
    .query(async ({ input }) => readBalanceThresholds(input.connectionId)),
  saveBalanceThreshold: protectedProcedure
    .input(z.object({
      connectionId: z.number().int().positive(),
      accountId: z.number().int().positive(),
      threshold: z.number().finite().min(0).nullable(),
    }))
    .mutation(async ({ input }) => {
      const thresholds = await readBalanceThresholds(input.connectionId);
      if (input.threshold === null) {
        delete thresholds[String(input.accountId)];
      } else {
        thresholds[String(input.accountId)] = input.threshold;
      }
      await writeBalanceThresholds(input.connectionId, thresholds);
      return thresholds;
    }),
  create: protectedProcedure
    .input(accountCreateInput)
    .mutation(async ({ input }) => {
      const client = await getClient(input.connectionId);
      const payload = buildAccountPayload(input) as {
        name: string;
        platform: string;
        type: string;
        credentials: Record<string, unknown>;
      };
      const detail = {
        name: input.name,
        platform: input.platform,
        type: input.type,
        fields: Object.keys(payload),
        schedulable: input.schedulable,
      };

      try {
        const account = await client.createAccount(payload);
        const accountId = getAccountId(account);
        if (input.schedulable === false && accountId && Number.isInteger(accountId) && accountId > 0) {
          await client.setSchedulable(accountId, false);
        }
        await safeLogSync(input.connectionId, "create_account", accountId ? `account:${accountId}` : "account:new", detail, "success");
        return account;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await safeLogSync(input.connectionId, "create_account", "account:new", detail, "failed", message);
        throw error;
      }
    }),
  update: protectedProcedure
    .input(accountUpdateInput)
    .mutation(async ({ input }) => {
      const client = await getClient(input.connectionId);
      const payload = buildAccountPayload(input);

      const detail = {
        accountId: input.accountId,
        fields: Object.keys(payload),
        schedulable: input.schedulable,
      };

      try {
        let account: unknown = null;
        if (Object.keys(payload).length > 0) {
          account = await client.updateAccount(input.accountId, payload);
        }
        if (input.schedulable !== undefined) {
          account = await client.setSchedulable(input.accountId, input.schedulable);
        }
        await safeLogSync(input.connectionId, "update_account", `account:${input.accountId}`, detail, "success");
        return account ?? { ok: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await safeLogSync(input.connectionId, "update_account", `account:${input.accountId}`, detail, "failed", message);
        throw error;
      }
    }),
  deleteAccount: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive(), accountId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const client = await getClient(input.connectionId);
      try {
        const result = await client.deleteAccount(input.accountId);
        await Promise.all([
          db.blSourceBinding.deleteMany({ where: { connectionId: input.connectionId, targetType: "account", targetId: input.accountId } }),
          db.blAccountRateRule.deleteMany({ where: { connectionId: input.connectionId, accountId: input.accountId } }),
          removeBalanceThreshold(input.connectionId, input.accountId),
        ]);
        await safeLogSync(input.connectionId, "delete_account", `account:${input.accountId}`, { accountId: input.accountId }, "success");
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await safeLogSync(input.connectionId, "delete_account", `account:${input.accountId}`, { accountId: input.accountId }, "failed", message);
        throw error;
      }
    }),
  setSchedulable: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive(), accountId: z.number().int().positive(), schedulable: z.boolean() }))
    .mutation(async ({ input }) => {
      const client = await getClient(input.connectionId);
      try {
        await client.setSchedulable(input.accountId, input.schedulable);
        await safeLogSync(input.connectionId, "set_schedulable", `account:${input.accountId}`, { schedulable: input.schedulable }, "success");
        return { ok: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await safeLogSync(input.connectionId, "set_schedulable", `account:${input.accountId}`, { schedulable: input.schedulable }, "failed", message);
        throw error;
      }
    }),
  updateGroups: protectedProcedure
    .input(z.object({
      connectionId: z.number().int().positive(),
      accountId: z.number().int().positive(),
      groupIds: z.array(z.number().int().positive()),
    }))
    .mutation(async ({ input }) => {
      const client = await getClient(input.connectionId);
      const groupIds = Array.from(new Set(input.groupIds));
      try {
        const account = await client.updateAccountGroups(input.accountId, groupIds);
        await safeLogSync(input.connectionId, "update_account_groups", `account:${input.accountId}`, { groupIds }, "success");
        return account;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await safeLogSync(input.connectionId, "update_account_groups", `account:${input.accountId}`, { groupIds }, "failed", message);
        throw error;
      }
    }),
  clearError: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive(), accountId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const client = await getClient(input.connectionId);
      try {
        await client.clearError(input.accountId);
        await safeLogSync(input.connectionId, "clear_error", `account:${input.accountId}`, {}, "success");
        return { ok: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await safeLogSync(input.connectionId, "clear_error", `account:${input.accountId}`, {}, "failed", message);
        throw error;
      }
    }),
  refresh: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive(), accountId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const client = await getClient(input.connectionId);
      try {
        await client.refreshAccount(input.accountId);
        await safeLogSync(input.connectionId, "refresh_account", `account:${input.accountId}`, {}, "success");
        return { ok: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await safeLogSync(input.connectionId, "refresh_account", `account:${input.accountId}`, {}, "failed", message);
        throw error;
      }
    }),
  models: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive(), accountId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const client = await getClient(input.connectionId);
      return client.getAvailableModels(input.accountId);
    }),
  test: protectedProcedure
    .input(z.object({
      connectionId: z.number().int().positive(),
      accountId: z.number().int().positive(),
      modelId: z.string().trim().optional(),
      prompt: z.string().optional(),
      mode: z.string().trim().optional(),
    }))
    .mutation(async ({ input }) => {
      const client = await getClient(input.connectionId);
      try {
        const result = await client.testAccount(input.accountId, {
          model_id: input.modelId,
          prompt: input.prompt,
          mode: input.mode,
        });
        await safeLogSync(
          input.connectionId,
          "test_account",
          `account:${input.accountId}`,
          { accountId: input.accountId, model: result.model, latencyMs: result.latency_ms },
          result.success ? "success" : "failed",
          result.success ? undefined : result.message,
        );
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await safeLogSync(input.connectionId, "test_account", `account:${input.accountId}`, { accountId: input.accountId }, "failed", message);
        throw error;
      }
    }),
});
