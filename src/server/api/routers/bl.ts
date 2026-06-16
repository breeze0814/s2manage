import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import { writeSyncLog } from "@/server/sync-logs";
import { decrypt } from "@/server/crypto";
import { Sub2ApiAdminClient } from "@/server/clients/sub2api-admin";
import { BlPublicClient, resolveBlChangeNewValue, type BlChange } from "@/server/clients/bl-public";
import {
  accountRateRuleInputSchema,
  blSourceBindingInputSchema,
  blTargetTypeSchema,
  evaluateGroupRateRule,
  groupRateRuleInputSchema,
  listBlSourceBindings,
  replaceBlSourceBindings,
  saveAccountRateRule as persistAccountRateRule,
  saveGroupRateRule as persistGroupRateRule,
} from "@/server/bl-bindings";
import { collectBlCollectionSite, collectDueBlCollectionSites } from "@/server/bl-collection/collector";
import { blCollectionHealth, blCollectionPlatforms } from "@/server/bl-collection/data";
import { deleteBlCollectionSite, getBlCollectionSite, listBlCollectionSites, saveBlCollectionSite, testBlCollectionSite } from "@/server/bl-collection/sites";
import { publishRateChangeAnnouncements } from "@/server/announcement-rules";
import { normalizeRateMultiplier } from "@/server/rates";

const rateMultiplierInput = z.number().finite().gt(0).max(100_000);

function getBlClient(connectionId?: number) {
  return new BlPublicClient(connectionId);
}

async function getSub2APIClient(connectionId: number) {
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
    // Logging must never hide the remote write result from the caller.
  }
}

function newestChangeByTarget(changes: BlChange[]) {
  const result = new Map<string, BlChange>();
  for (const change of changes) {
    const current = result.get(change.group_id);
    if (!current || new Date(change.created_at).getTime() > new Date(current.created_at).getTime()) {
      result.set(change.group_id, change);
    }
  }
  return Array.from(result.values());
}

function toFiniteNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function getAccountLabel(account: unknown, accountId: number) {
  if (!account || typeof account !== "object") return `#${accountId}`;
  const row = account as { name?: unknown; username?: unknown };
  const name = typeof row.name === "string" && row.name.trim()
    ? row.name.trim()
    : typeof row.username === "string" && row.username.trim()
      ? row.username.trim()
      : "";
  return name || `#${accountId}`;
}

function getAccountRate(account: unknown) {
  if (!account || typeof account !== "object") return null;
  return toFiniteNumber((account as { rate_multiplier?: unknown }).rate_multiplier);
}

// ---- Bl Router ----
export const blRouter = createTRPCRouter({
  sites: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive().optional() }).optional())
    .query(async ({ input }) => {
      const client = getBlClient(input?.connectionId);
      return client.fetchSites();
    }),
  collectionSites: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive().optional() }).optional())
    .query(async ({ input }) => listBlCollectionSites(input?.connectionId)),
  saveCollectionSite: protectedProcedure
    .input(z.object({
      id: z.number().int().positive().optional(),
      connectionId: z.number().int().positive(),
      name: z.string().trim().min(1),
      baseUrl: z.string().trim().min(1),
      siteType: z.enum(["sub2api", "new_api"]),
      email: z.string().optional(),
      password: z.string().optional(),
      authMode: z.enum(["password", "manual_token"]),
      enabled: z.boolean(),
      intervalMin: z.number().int().min(1),
      rechargeRatio: z.number().positive(),
      accessToken: z.string().optional(),
      refreshToken: z.string().optional(),
      tokenExpire: z.string().optional(),
    }))
    .mutation(async ({ input }) => saveBlCollectionSite(input)),
  deleteCollectionSite: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive(), id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await deleteBlCollectionSite(input.id, input.connectionId);
      return { ok: true };
    }),
  testCollectionSite: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive(), id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const site = await getBlCollectionSite(input.id);
      if (!site || site.connectionId !== input.connectionId) throw new Error("采集源站不存在");
      return testBlCollectionSite(site);
    }),
  collectSite: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive(), id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const site = await getBlCollectionSite(input.id);
      if (!site || site.connectionId !== input.connectionId) throw new Error("采集源站不存在");
      return collectBlCollectionSite(site);
    }),
  collectAll: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const results = await collectDueBlCollectionSites({ connectionId: input.connectionId, forceAll: true });
      return { ok: true, total: results.length, success: results.filter((row) => row.result.ok).length, results };
    }),
  platforms: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive().optional() }).optional())
    .query(({ input }) => blCollectionPlatforms(input?.connectionId)),
  health: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive().optional() }).optional())
    .query(({ input }) => blCollectionHealth(input?.connectionId)),
  changes: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive().optional(), siteId: z.number().int().positive().optional(), limit: z.number().int().min(1).max(200).default(100) }))
    .query(async ({ input }) => {
      const client = getBlClient(input.connectionId);
      return client.fetchChanges(input.siteId, input.limit);
    }),
  rates: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive().optional(), siteId: z.number().int().positive().optional() }))
    .query(async ({ input }) => {
      const client = getBlClient(input.connectionId);
      return client.fetchRates(input.siteId);
    }),
  bindings: protectedProcedure
    .input(z.object({
      connectionId: z.number().int().positive(),
      targetType: blTargetTypeSchema,
      targetIds: z.array(z.number().int().positive()).optional(),
    }))
    .query(async ({ input }) => {
      let blClient: BlPublicClient | null = null;
      let rateError: string | null = null;

      try {
        blClient = getBlClient(input.connectionId);
      } catch (error) {
        rateError = error instanceof Error ? error.message : String(error);
      }

      if (blClient) {
        try {
          const result = await listBlSourceBindings({ ...input, blClient });
          return { ...result, rateError };
        } catch (error) {
          rateError = error instanceof Error ? error.message : String(error);
        }
      }

      const result = await listBlSourceBindings({ ...input, blClient: null });
      return { ...result, rateError };
    }),
  saveBindings: protectedProcedure
    .input(z.object({
      connectionId: z.number().int().positive(),
      targetType: blTargetTypeSchema,
      targetId: z.number().int().positive(),
      bindings: z.array(blSourceBindingInputSchema).max(50),
    }))
    .mutation(async ({ input }) => {
      const result = await replaceBlSourceBindings(input);
      await safeLogSync(input.connectionId, "save_bl_source_bindings", `${input.targetType}:${input.targetId}`, {
        targetType: input.targetType,
        targetId: input.targetId,
        count: result.count,
      }, "success");
      return result;
    }),
  saveGroupRateRule: protectedProcedure
    .input(z.object({
      connectionId: z.number().int().positive(),
      groupId: z.number().int().positive(),
      rule: groupRateRuleInputSchema,
    }))
    .mutation(async ({ input }) => {
      const rule = await persistGroupRateRule(input);
      await safeLogSync(input.connectionId, "save_bl_group_rate_rule", `group:${input.groupId}`, { groupId: input.groupId, rule }, "success");
      return rule;
    }),
  saveAccountRateRule: protectedProcedure
    .input(z.object({
      connectionId: z.number().int().positive(),
      accountId: z.number().int().positive(),
      rule: accountRateRuleInputSchema,
    }))
    .mutation(async ({ input }) => {
      const rule = await persistAccountRateRule(input);
      await safeLogSync(input.connectionId, "save_bl_account_rate_rule", `account:${input.accountId}`, { accountId: input.accountId, rule }, "success");
      return rule;
    }),
  applyGroupRateRule: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive(), groupId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const [blClient, targetClient] = await Promise.all([Promise.resolve(getBlClient(input.connectionId)), getSub2APIClient(input.connectionId)]);
      const targetGroup = await targetClient.getGroup(input.groupId);
      const currentRate = typeof targetGroup.rate_multiplier === "number" ? targetGroup.rate_multiplier : 1;
      const { bindings, rules } = await listBlSourceBindings({
        connectionId: input.connectionId,
        targetType: "group",
        targetIds: [input.groupId],
        blClient,
      });
      const rule = rules[0];
      if (!rule?.enabled) throw new Error("该分组未启用倍率规则");
      const rateMultiplier = evaluateGroupRateRule({
        rule,
        sourceRates: bindings.map((binding) => binding.currentRate),
        currentRate,
      });
      const detail = {
        groupId: input.groupId,
        rule,
        rateMultiplier,
        sources: bindings.map((binding) => ({
          sourceSiteId: binding.sourceSiteId,
          sourceSiteName: binding.sourceSiteName,
          sourceGroupId: binding.sourceGroupId,
          sourceGroupName: binding.sourceGroupName,
          currentRate: binding.currentRate,
        })),
      };

      try {
        const group = await targetClient.updateGroupRateMultiplier(input.groupId, rateMultiplier);
        await publishRateChangeAnnouncements({
          db,
          client: targetClient,
          context: {
            action: "apply_bl_group_rate_rule",
            connectionId: input.connectionId,
            groupId: input.groupId,
            groupName: group.name ?? targetGroup.name,
            oldRate: currentRate,
            newRate: rateMultiplier,
            sourceSiteName: bindings[0]?.sourceSiteName,
            sourceGroupId: bindings[0]?.sourceGroupId,
            sourceGroupName: bindings[0]?.sourceGroupName,
            sourceRate: bindings[0]?.currentRate,
            ruleMode: rule.mode,
            ruleExpression: rule.expression,
            changedAt: new Date(),
          },
        });
        await safeLogSync(input.connectionId, "apply_bl_group_rate_rule", `group:${input.groupId}`, detail, "success");
        return { ok: true, group, rule, sources: bindings, rateMultiplier };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await safeLogSync(input.connectionId, "apply_bl_group_rate_rule", `group:${input.groupId}`, detail, "failed", message);
        throw error;
      }
    }),
  applyAccountRateRule: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive(), accountId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const [blClient, targetClient] = await Promise.all([Promise.resolve(getBlClient(input.connectionId)), getSub2APIClient(input.connectionId)]);
      const accounts = await targetClient.listAccounts();
      const targetAccount = accounts.find((account) => {
        if (!account || typeof account !== "object") return false;
        return Number((account as { id?: unknown }).id) === input.accountId;
      });
      if (!targetAccount) throw new Error("账号不存在");

      const currentRate = getAccountRate(targetAccount) ?? 1;
      const { bindings, accountRules } = await listBlSourceBindings({
        connectionId: input.connectionId,
        targetType: "account",
        targetIds: [input.accountId],
        blClient,
      });
      const rule = accountRules[0];
      if (!rule?.enabled) throw new Error("该账号未启用倍率规则");
      const rateMultiplier = evaluateGroupRateRule({
        rule,
        sourceRates: bindings.map((binding) => binding.currentRate),
        currentRate,
      });
      const detail = {
        accountId: input.accountId,
        accountName: getAccountLabel(targetAccount, input.accountId),
        rule,
        currentRate,
        rateMultiplier,
        sources: bindings.map((binding) => ({
          sourceSiteId: binding.sourceSiteId,
          sourceSiteName: binding.sourceSiteName,
          sourceGroupId: binding.sourceGroupId,
          sourceGroupName: binding.sourceGroupName,
          currentRate: binding.currentRate,
        })),
      };

      try {
        const account = await targetClient.updateAccount(input.accountId, { rate_multiplier: rateMultiplier });
        await safeLogSync(input.connectionId, "apply_bl_account_rate_rule", `account:${input.accountId}`, detail, "success");
        return { ok: true, account, rule, sources: bindings, rateMultiplier };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await safeLogSync(input.connectionId, "apply_bl_account_rate_rule", `account:${input.accountId}`, detail, "failed", message);
        throw error;
      }
    }),
  syncToTarget: protectedProcedure
    .input(z.object({
      connectionId: z.number().int().positive(),
      groupId: z.number().int().positive(),
      rateMultiplier: rateMultiplierInput,
      sourceSiteId: z.number().int().positive(),
      sourceSiteName: z.string().trim().min(1),
      sourceGroupId: z.string().trim().min(1),
      sourceGroupName: z.string().trim().optional(),
    }))
    .mutation(async ({ input }) => {
      const client = await getSub2APIClient(input.connectionId);
      const rateMultiplier = normalizeRateMultiplier(input.rateMultiplier);
      const detail = {
        sourceSiteId: input.sourceSiteId,
        sourceSiteName: input.sourceSiteName,
        sourceGroupId: input.sourceGroupId,
        sourceGroupName: input.sourceGroupName ?? "",
        rateMultiplier,
      };
      try {
        const oldGroup = await client.getGroup(input.groupId);
        const group = await client.updateGroupRateMultiplier(input.groupId, rateMultiplier);
        await publishRateChangeAnnouncements({
          db,
          client,
          context: {
            action: "bl_sync_group_rate",
            connectionId: input.connectionId,
            groupId: input.groupId,
            groupName: group.name ?? oldGroup.name,
            oldRate: oldGroup.rate_multiplier ?? null,
            newRate: rateMultiplier,
            sourceSiteId: input.sourceSiteId,
            sourceSiteName: input.sourceSiteName,
            sourceGroupId: input.sourceGroupId,
            sourceGroupName: input.sourceGroupName ?? "",
            sourceRate: rateMultiplier,
            changedAt: new Date(),
          },
        });
        await safeLogSync(input.connectionId, "bl_sync_group_rate", `group:${input.groupId}`, detail, "success");
        return { ok: true, group };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await safeLogSync(input.connectionId, "bl_sync_group_rate", `group:${input.groupId}`, detail, "failed", message);
        throw error;
      }
    }),
  syncLatestToAllMatchedGroups: protectedProcedure
    .input(z.object({
      connectionId: z.number().int().positive(),
      sourceSiteId: z.number().int().positive().optional(),
      limit: z.number().int().min(1).max(200).default(100),
    }))
    .mutation(async ({ input }) => {
      const [blClient, targetClient] = await Promise.all([Promise.resolve(getBlClient(input.connectionId)), getSub2APIClient(input.connectionId)]);
      const [changes, groups] = await Promise.all([
        blClient.fetchChanges(input.sourceSiteId, input.limit),
        targetClient.listGroups(),
      ]);
      const groupsById = new Map<string, (typeof groups)[number]>(groups.map((group) => [String(group.id), group]));
      const groupsByName = new Map<string, (typeof groups)[number]>();
      for (const group of groups) {
        const name = group.name.trim();
        if (name) groupsByName.set(name, group);
      }
      const results: Array<{ sourceGroupId: string; targetGroupId?: number; ok: boolean; message: string }> = [];

      for (const change of newestChangeByTarget(changes)) {
        const parsed = resolveBlChangeNewValue(change);
        if (parsed === null) {
          results.push({ sourceGroupId: change.group_id, ok: false, message: "新倍率不是有效数字" });
          continue;
        }

        const target = groupsById.get(change.group_id) ?? (change.group_name ? groupsByName.get(change.group_name.trim()) : undefined);
        if (!target) {
          results.push({ sourceGroupId: change.group_id, ok: false, message: "未找到同 ID 或同名目标分组" });
          continue;
        }

        const detail = {
          sourceSiteId: change.site_id,
          sourceSiteName: change.site_name,
          sourceGroupId: change.group_id,
          sourceGroupName: change.group_name ?? "",
          rateMultiplier: parsed,
          rawRateMultiplier: change.new_value,
          rechargeRatio: change.recharge_ratio,
        };
        try {
          const group = await targetClient.updateGroupRateMultiplier(target.id, parsed);
          await publishRateChangeAnnouncements({
            db,
            client: targetClient,
            context: {
              action: "auto_bl_sync_group_rate",
              connectionId: input.connectionId,
              groupId: target.id,
              groupName: group.name ?? target.name,
              oldRate: target.rate_multiplier ?? null,
              newRate: parsed,
              sourceSiteId: change.site_id,
              sourceSiteName: change.site_name,
              sourceGroupId: change.group_id,
              sourceGroupName: change.group_name ?? "",
              sourceRate: parsed,
              changedAt: new Date(),
            },
          });
          await safeLogSync(input.connectionId, "auto_bl_sync_group_rate", `group:${target.id}`, detail, "success");
          results.push({ sourceGroupId: change.group_id, targetGroupId: target.id, ok: true, message: "已同步" });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await safeLogSync(input.connectionId, "auto_bl_sync_group_rate", `group:${target.id}`, detail, "failed", message);
          results.push({ sourceGroupId: change.group_id, targetGroupId: target.id, ok: false, message });
        }
      }

      return {
        ok: results.every((result) => result.ok),
        total: results.length,
        success: results.filter((result) => result.ok).length,
        failed: results.filter((result) => !result.ok).length,
        results,
      };
    }),
});

