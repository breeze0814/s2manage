import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import { cleanupOldLogs, clearLogs, getLogSettings, listSyncLogs, logLevels, normalizeLogLevel, saveLogSettings } from "@/server/sync-logs";

const logLevelSchema = z.enum(logLevels);
const statusSchema = z.enum(["success", "failed"]);

export const syncRouter = createTRPCRouter({
  logSettings: protectedProcedure.query(() => getLogSettings()),
  saveLogSettings: protectedProcedure
    .input(z.object({
      enabled: z.boolean(),
      retentionDays: z.number().int().min(1).max(3650),
      minLevel: logLevelSchema,
    }))
    .mutation(async ({ input }) => {
      const settings = await saveLogSettings({
        enabled: input.enabled,
        retentionDays: input.retentionDays,
        minLevel: normalizeLogLevel(input.minLevel),
      });
      await cleanupOldLogs(db, settings.retentionDays);
      return { ok: true, settings };
    }),
  logs: protectedProcedure
    .input(z.object({
      connectionId: z.number().int().positive().optional(),
      limit: z.number().int().min(1).max(500).default(50),
      cursor: z.string().optional(),
      levels: z.array(logLevelSchema).optional(),
      statuses: z.array(statusSchema).optional(),
      action: z.string().trim().max(100).optional(),
      target: z.string().trim().max(200).optional(),
      search: z.string().trim().max(200).optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    }))
    .query(async ({ input }) => {
      return listSyncLogs(input);
    }),
  cleanupLogs: protectedProcedure
    .input(z.object({ retentionDays: z.number().int().min(1).max(3650).optional() }).optional())
    .mutation(async ({ input }) => {
      const result = await cleanupOldLogs(db, input?.retentionDays);
      return { ok: true, deleted: result.count };
    }),
  clearLogs: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive().optional() }).optional())
    .mutation(async ({ input }) => {
      const result = await clearLogs({ connectionId: input?.connectionId });
      return { ok: true, deleted: result.count };
    }),
});
