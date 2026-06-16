import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import { encrypt, decrypt } from "@/server/crypto";
import { Sub2ApiAdminClient } from "@/server/clients/sub2api-admin";

function normalizeUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

const urlInput = z.string().trim().url().refine((value) => /^https?:\/\//i.test(value), "URL 必须以 http:// 或 https:// 开头").transform(normalizeUrl);

function getClient(connection: { baseUrl: string; adminApiKey: string }) {
  return new Sub2ApiAdminClient(connection.baseUrl, decrypt(connection.adminApiKey));
}

function maskConnection<T extends { adminApiKey: string }>(connection: T) {
  return { ...connection, adminApiKey: "••••••" };
}

export const connectionsRouter = createTRPCRouter({
  list: protectedProcedure.query(async () => {
    const rows = await db.connection.findMany({ orderBy: { createdAt: "asc" } });
    return rows.map(maskConnection);
  }),
  create: protectedProcedure
    .input(z.object({ name: z.string().trim().min(1), baseUrl: urlInput, adminApiKey: z.string().trim().min(1), syncMode: z.enum(["manual", "auto"]).default("manual") }))
    .mutation(async ({ input }) => {
      const connection = await db.connection.create({ data: { ...input, baseUrl: normalizeUrl(input.baseUrl), adminApiKey: encrypt(input.adminApiKey) } });
      return maskConnection(connection);
    }),
  update: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), name: z.string().trim().min(1).optional(), baseUrl: urlInput.optional(), adminApiKey: z.string().trim().min(1).optional(), enabled: z.boolean().optional(), syncMode: z.enum(["manual", "auto"]).optional() }))
    .mutation(async ({ input }) => {
      const { id, adminApiKey, ...rest } = input;
      const data: Record<string, unknown> = { ...rest };
      if (typeof data.baseUrl === "string") data.baseUrl = normalizeUrl(data.baseUrl);
      if (adminApiKey) data.adminApiKey = encrypt(adminApiKey);
      const connection = await db.connection.update({ where: { id }, data });
      return maskConnection(connection);
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await db.connection.delete({ where: { id: input.id } });
      return { ok: true };
    }),
  test: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const conn = await db.connection.findUniqueOrThrow({ where: { id: input.id } });
      const res = await getClient(conn).testConnection();
      const count = Array.isArray(res) ? res.length : (res as { data?: unknown[] })?.data?.length ?? 0;
      return { ok: true, message: `连接成功，获取到 ${count} 个分组`, count };
    }),
});

