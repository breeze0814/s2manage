import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import { writeSyncLog } from "@/server/sync-logs";
import { decrypt } from "@/server/crypto";
import { Sub2ApiAdminClient } from "@/server/clients/sub2api-admin";
import {
  defaultRateAnnouncementContentTemplate,
  defaultRateAnnouncementTitleTemplate,
  renderAnnouncementTemplate,
} from "@/server/announcement-rules";

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

export const announcementsRouter = createTRPCRouter({
  rules: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return db.announcementRule.findMany({
        where: { connectionId: input.connectionId },
        orderBy: [{ enabled: "desc" }, { id: "asc" }],
      });
    }),
  createRule: protectedProcedure
    .input(z.object({
      connectionId: z.number().int().positive(),
      name: z.string().trim().min(1).max(100),
      enabled: z.boolean().default(true),
      titleTemplate: z.string().trim().min(1).max(300).default(defaultRateAnnouncementTitleTemplate),
      contentTemplate: z.string().trim().min(1).max(5_000).default(defaultRateAnnouncementContentTemplate),
      status: z.enum(["draft", "active", "archived"]).default("active"),
      notifyMode: z.enum(["silent", "popup"]).default("silent"),
    }))
    .mutation(async ({ input }) => {
      const { connectionId, ...data } = input;
      const rule = await db.announcementRule.create({
        data: {
          connectionId,
          name: data.name,
          enabled: data.enabled,
          titleTemplate: data.titleTemplate,
          contentTemplate: data.contentTemplate,
          status: data.status,
          notifyMode: data.notifyMode,
        },
      });
      await safeLogSync(connectionId, "create_announcement_rule", `rule:${rule.id}`, { ruleId: rule.id, name: rule.name }, "success");
      return rule;
    }),
  updateRule: protectedProcedure
    .input(z.object({
      connectionId: z.number().int().positive(),
      id: z.number().int().positive(),
      name: z.string().trim().min(1).max(100),
      enabled: z.boolean(),
      titleTemplate: z.string().trim().min(1).max(300),
      contentTemplate: z.string().trim().min(1).max(5_000),
      status: z.enum(["draft", "active", "archived"]),
      notifyMode: z.enum(["silent", "popup"]),
    }))
    .mutation(async ({ input }) => {
      const { connectionId, id, ...data } = input;
      await db.announcementRule.updateMany({
        where: { id, connectionId },
        data: {
          name: data.name,
          enabled: data.enabled,
          titleTemplate: data.titleTemplate,
          contentTemplate: data.contentTemplate,
          status: data.status,
          notifyMode: data.notifyMode,
        },
      });
      const rule = await db.announcementRule.findFirstOrThrow({ where: { id, connectionId } });
      await safeLogSync(connectionId, "update_announcement_rule", `rule:${rule.id}`, { ruleId: rule.id, name: rule.name }, "success");
      return rule;
    }),
  deleteRule: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive(), id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await db.announcementRule.deleteMany({ where: { id: input.id, connectionId: input.connectionId } });
      await safeLogSync(input.connectionId, "delete_announcement_rule", `rule:${input.id}`, { ruleId: input.id }, "success");
      return { ok: true };
    }),
  previewRule: protectedProcedure
    .input(z.object({
      titleTemplate: z.string().min(1),
      contentTemplate: z.string().min(1),
    }))
    .query(({ input }) => {
      const context = {
        action: "preview",
        connectionId: 0,
        connectionName: "示例站点",
        groupId: 1,
        groupName: "Claude Pro",
        oldRate: 1,
        newRate: 1.1,
        sourceSiteId: 1,
        sourceSiteName: "BL 示例源站",
        sourceGroupId: "pro",
        sourceGroupName: "Pro 分组",
        sourceRate: 1.1,
        ruleMode: "average",
        ruleExpression: "avg + 0.1",
        changedAt: new Date(),
      };
      return {
        title: renderAnnouncementTemplate(input.titleTemplate, context),
        content: renderAnnouncementTemplate(input.contentTemplate, context),
      };
    }),
  list: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const client = await getClient(input.connectionId);
      return client.listAnnouncements();
    }),
  create: protectedProcedure
    .input(z.object({
      connectionId: z.number().int().positive(),
      title: z.string().trim().min(1),
      content: z.string().trim().min(1),
      status: z.enum(["draft", "active", "archived"]).default("active"),
      notify_mode: z.enum(["silent", "popup"]).default("silent"),
    }))
    .mutation(async ({ input }) => {
      const { connectionId, ...data } = input;
      const client = await getClient(connectionId);
      try {
        await client.createAnnouncement(data);
        await safeLogSync(connectionId, "create_announcement", "", { title: data.title, status: data.status }, "success");
        return { ok: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await safeLogSync(connectionId, "create_announcement", "", { title: data.title, status: data.status }, "failed", message);
        throw error;
      }
    }),
  update: protectedProcedure
    .input(z.object({
      connectionId: z.number().int().positive(),
      id: z.number().int().positive(),
      title: z.string().trim().min(1).optional(),
      content: z.string().trim().min(1).optional(),
      status: z.enum(["draft", "active", "archived"]).optional(),
      notify_mode: z.enum(["silent", "popup"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const { connectionId, id, ...data } = input;
      const client = await getClient(connectionId);
      try {
        await client.updateAnnouncement(id, data);
        await safeLogSync(connectionId, "update_announcement", `id:${id}`, data as Record<string, unknown>, "success");
        return { ok: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await safeLogSync(connectionId, "update_announcement", `id:${id}`, data as Record<string, unknown>, "failed", message);
        throw error;
      }
    }),
  delete: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive(), id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const client = await getClient(input.connectionId);
      try {
        await client.deleteAnnouncement(input.id);
        await safeLogSync(input.connectionId, "delete_announcement", `id:${input.id}`, {}, "success");
        return { ok: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await safeLogSync(input.connectionId, "delete_announcement", `id:${input.id}`, {}, "failed", message);
        throw error;
      }
    }),
});
