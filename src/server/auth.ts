import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { db } from "@/server/db";
import { appSecret } from "@/server/env";
import { sessionCookieSecure } from "@/server/session-cookie";

const COOKIE_NAME = "s2a_session";
const encoder = new TextEncoder();

function secretKey() { return encoder.encode(appSecret()); }

export async function isInitialized(): Promise<boolean> {
  return (await db.adminUser.count()) > 0;
}

export async function setupAdmin(email: string, password: string) {
  if (password.length < 6) throw new Error("密码至少6位");
  if (await db.adminUser.findUnique({ where: { email } })) throw new Error("邮箱已存在");
  if (await isInitialized()) throw new Error("管理员已初始化，请登录后添加");
  const passwordHash = await bcrypt.hash(password, 12);
  await db.adminUser.create({ data: { email, passwordHash } });
}

export async function attemptLogin(email: string, password: string): Promise<boolean> {
  const admin = await db.adminUser.findUnique({ where: { email } });
  if (!admin) return false;
  return bcrypt.compare(password, admin.passwordHash);
}

export async function createSessionCookie(email: string) {
  const token = await new SignJWT({ role: "admin", email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey());
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true, sameSite: "lax",
    secure: sessionCookieSecure(),
    path: "/", maxAge: 60 * 60 * 24 * 7,
  });
}

export async function getSession() {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const verified = await jwtVerify(token, secretKey());
    const email = typeof verified.payload.email === "string" ? verified.payload.email : "";
    if (verified.payload.role !== "admin" || !email) return null;
    const admin = await db.adminUser.findUnique({ where: { email }, select: { id: true } });
    return admin ? { role: "admin" as const, email } : null;
  } catch { return null; }
}

export async function requireAdmin() {
  const session = await getSession();
  if (!session) throw new Error("未登录");
  return session;
}

export function clearSessionCookie() { cookies().delete(COOKIE_NAME); }
