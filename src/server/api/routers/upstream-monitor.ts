import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import { decrypt } from "@/server/crypto";
import { Sub2ApiAdminClient } from "@/server/clients/sub2api-admin";
import { executeUpstreamMonitorRule } from "@/server/upstream-monitor";
import { getWorkerRuntimeSettings } from "@/server/worker-settings";

type AccountRow = {
  id?: number | string | null;
  name?: string | null;
  username?: string | null;
  platform?: string | null;
  type?: string | null;
  channel_type?: string | null;
  status?: string | null;
  schedulable?: boolean | null;
};

type AccountListResponse =
  | AccountRow[]
  | {
      items?: AccountRow[];
      data?: AccountRow[] | { items?: AccountRow[] };
    };

const monitorRuleInput = z.object({
  connectionId: z.number().int().positive(),
  accountId: z.number().int().positive(),
  accountName: z.string().trim().max(200).optional(),
  enabled: z.boolean().default(true),
  checkIntervalMinutes: z.number().int().min(1).max(24 * 60).default(10),
  failureThreshold: z.number().int().min(1).max(100).default(3),
  pauseMinutes: z.number().int().min(1).max(7 * 24 * 60).default(30),
  modelId: z.string().trim().max(200).optional(),
  prompt: z.string().max(2_000).optional(),
});

function getClient(connection: { baseUrl: string; adminApiKey: string }) {
  return new Sub2ApiAdminClient(connection.baseUrl, decrypt(connection.adminApiKey));
}

function normalizeAccountList(response: unknown): AccountRow[] {
  if (Array.isArray(response)) return response as AccountRow[];
  if (!response || typeof response !== "object") return [];

  const payload = response as AccountListResponse;
  if ("items" in payload && Array.isArray(payload.items)) return payload.items;
  if ("data" in payload && Array.isArray(payload.data)) return payload.data;
  if ("data" in payload && payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)) {
    const nested = payload.data as { items?: AccountRow[] };
    if (Array.isArray(nested.items)) return nested.items;
  }
  return [];
}

function normalizeAccountId(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function accountLabel(account: AccountRow | null | undefined, fallbackId: number) {
  const name = account?.name ?? account?.username;
  return name?.trim() || `#${fallbackId}`;
}

function resultStats(results: Array<{ status: string }>) {
  const checks = results.filter((result) => result.status === "success" || result.status === "failed");
  const success = checks.filter((result) => result.status === "success").length;
  const failed = checks.filter((result) => result.status === "failed").length;
  return {
    windowSize: checks.length,
    success,
    failed,
    uptimePercent: checks.length > 0 ? (success / checks.length) * 100 : null,
  };
}

export const upstreamMonitorRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const connection = await db.connection.findUniqueOrThrow({ where: { id: input.connectionId } });
      const client = getClient(connection);
      const [accountsPayload, rules] = await Promise.all([
        client.listAccounts(),
        db.upstreamMonitorRule.findMany({
          where: { connectionId: input.connectionId },
          include: { results: { orderBy: { createdAt: "desc" }, take: 50 } },
          orderBy: [{ accountId: "asc" }],
        }),
      ]);

      const accounts = normalizeAccountList(accountsPayload);
      const accountById = new Map<number, AccountRow>();
      for (const account of accounts) {
        const accountId = normalizeAccountId(account.id);
        if (accountId) accountById.set(accountId, account);
      }
      const rulesByAccount = new Map(rules.map((rule) => [rule.accountId, rule]));

      const accountRows = accounts
        .map((account) => {
          const accountId = normalizeAccountId(account.id);
          if (!accountId) return null;
          const rule = rulesByAccount.get(accountId) ?? null;
          return {
            accountId,
            accountName: accountLabel(account, accountId),
            platform: account.platform ?? null,
            type: account.type ?? account.channel_type ?? null,
            status: account.status ?? null,
            schedulable: account.schedulable ?? null,
            missing: false,
            rule,
            stats: rule ? resultStats(rule.results) : { windowSize: 0, success: 0, failed: 0, uptimePercent: null },
            lastResult: rule?.results[0] ?? null,
          };
        })
        .filter(Boolean);

      const missingRows = rules
        .filter((rule) => !accountById.has(rule.accountId))
        .map((rule) => ({
          accountId: rule.accountId,
          accountName: rule.accountName || `#${rule.accountId}`,
          platform: null,
          type: null,
          status: null,
          schedulable: null,
          missing: true,
          rule,
          stats: resultStats(rule.results),
          lastResult: rule.results[0] ?? null,
        }));

      return { rows: [...accountRows, ...missingRows], totalAccounts: accounts.length, monitored: rules.length };
    }),

  upsertRule: protectedProcedure
    .input(monitorRuleInput)
    .mutation(async ({ input }) => {
      const now = new Date();
      const data = {
        accountName: input.accountName || null,
        enabled: input.enabled,
        checkIntervalMinutes: input.checkIntervalMinutes,
        failureThreshold: input.failureThreshold,
        pauseMinutes: input.pauseMinutes,
        modelId: input.modelId || null,
        prompt: input.prompt?.trim() || null,
        nextCheckAt: input.enabled ? now : null,
      };

      return db.upstreamMonitorRule.upsert({
        where: { connectionId_accountId: { connectionId: input.connectionId, accountId: input.accountId } },
        create: {
          connectionId: input.connectionId,
          accountId: input.accountId,
          ...data,
        },
        update: data,
      });
    }),

  setEnabled: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive(), accountId: z.number().int().positive(), enabled: z.boolean() }))
    .mutation(async ({ input }) => {
      return db.upstreamMonitorRule.update({
        where: { connectionId_accountId: { connectionId: input.connectionId, accountId: input.accountId } },
        data: {
          enabled: input.enabled,
          nextCheckAt: input.enabled ? new Date() : null,
        },
      });
    }),

  deleteRule: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive(), accountId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const rule = await db.upstreamMonitorRule.findUnique({
        where: { connectionId_accountId: { connectionId: input.connectionId, accountId: input.accountId } },
      });
      if (!rule) return { ok: true };

      if (rule.pausedUntil) {
        const connection = await db.connection.findUniqueOrThrow({ where: { id: input.connectionId } });
        await getClient(connection).setSchedulable(input.accountId, true);
      }

      await db.upstreamMonitorRule.delete({ where: { id: rule.id } });
      return { ok: true };
    }),

  runNow: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive(), accountId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const [connection, rule] = await Promise.all([
        db.connection.findUniqueOrThrow({ where: { id: input.connectionId } }),
        db.upstreamMonitorRule.findUniqueOrThrow({
          where: { connectionId_accountId: { connectionId: input.connectionId, accountId: input.accountId } },
        }),
      ]);
      const client = getClient(connection);
      let account: AccountRow | null = null;
      try {
        account = normalizeAccountList(await client.listAccounts()).find((row) => normalizeAccountId(row.id) === input.accountId) ?? null;
      } catch {
        account = null;
      }
      const runtimeSettings = await getWorkerRuntimeSettings(db);
      return executeUpstreamMonitorRule({
        db,
        rule,
        client,
        account,
        reason: "manual",
        timeoutMs: runtimeSettings.upstreamMonitorTimeoutSeconds * 1000,
      });
    }),

  resumeNow: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive(), accountId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const [connection, rule] = await Promise.all([
        db.connection.findUniqueOrThrow({ where: { id: input.connectionId } }),
        db.upstreamMonitorRule.findUniqueOrThrow({
          where: { connectionId_accountId: { connectionId: input.connectionId, accountId: input.accountId } },
        }),
      ]);
      await getClient(connection).setSchedulable(input.accountId, true);
      return db.upstreamMonitorRule.update({
        where: { id: rule.id },
        data: {
          pausedUntil: null,
          pauseStartedAt: null,
          consecutiveFailures: 0,
          nextCheckAt: new Date(),
          lastStatus: "resumed",
          lastMessage: "已手动恢复账号调度",
        },
      });
    }),
});
