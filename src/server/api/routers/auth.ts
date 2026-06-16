import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "@/server/api/trpc";
import { attemptLogin, clearSessionCookie, createSessionCookie, isInitialized, setupAdmin } from "@/server/auth";
import { db } from "@/server/db";

// ---- Auth Router ----
export const authRouter = createTRPCRouter({
  initialized: publicProcedure.query(() => isInitialized()),
  session: publicProcedure.query(async ({ ctx }) => ({
    authed: Boolean(ctx.session),
    email: ctx.session?.email ?? null,
    initialized: await isInitialized(),
  })),
  setup: publicProcedure
    .input(z.object({ email: z.string().email("请输入有效邮箱"), password: z.string().min(6, "密码至少6位") }))
    .mutation(async ({ input }) => {
      await setupAdmin(input.email, input.password);
      await createSessionCookie(input.email);
      return { ok: true };
    }),
  login: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string().min(1) }))
    .mutation(async ({ input }) => {
      if (!(await attemptLogin(input.email, input.password))) throw new Error("邮箱或密码错误");
      await createSessionCookie(input.email);
      return { ok: true };
    }),
  logout: protectedProcedure.mutation(() => { clearSessionCookie(); return { ok: true }; }),
  listUsers: protectedProcedure.query(async () => {
    return db.adminUser.findMany({ select: { id: true, email: true, createdAt: true }, orderBy: { id: "asc" } });
  }),
  addUser: protectedProcedure
    .input(z.object({ email: z.string().email(), password: z.string().min(6) }))
    .mutation(async ({ input }) => {
      if (await db.adminUser.findUnique({ where: { email: input.email } })) throw new Error("邮箱已存在");
      const bcrypt = await import("bcryptjs");
      await db.adminUser.create({ data: { email: input.email, passwordHash: await bcrypt.hash(input.password, 12) } });
      return { ok: true };
    }),
  deleteUser: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const count = await db.adminUser.count();
      if (count <= 1) throw new Error("至少保留一个管理员");
      const user = await db.adminUser.findUnique({ where: { id: input.id }, select: { email: true } });
      if (user?.email === ctx.session.email) throw new Error("不能删除当前登录的管理员");
      await db.adminUser.delete({ where: { id: input.id } });
      return { ok: true };
    }),
});
