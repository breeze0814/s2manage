import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const PROJECT_ROOT = new URL("../", import.meta.url);
const APP_SECRET = "test-auth-secret-with-at-least-24-characters";

async function loadAuthModules() {
  const paths = [
    "src/server/auth/password.ts",
    "src/server/auth/session.ts",
    "src/server/auth/service.ts",
    "src/server/auth/store.ts",
  ];
  for (const path of paths) {
    assert.equal(existsSync(new URL(path, PROJECT_ROOT)), true, `${path} should exist`);
  }
  const [password, session, service, store] = await Promise.all([
    import("../src/server/auth/password.ts"),
    import("../src/server/auth/session.ts"),
    import("../src/server/auth/service.ts"),
    import("../src/server/auth/store.ts"),
  ]);
  return { password, session, service, store };
}

async function withAuthService<T>(task: (context: Awaited<ReturnType<typeof authContext>>) => Promise<T>) {
  const directory = await mkdtemp(join(tmpdir(), "s2a-rate-auth-"));
  const context = await authContext(`file:${join(directory, "app.db")}`);
  try {
    return await task(context);
  } finally {
    context.store.close();
    await rm(directory, { recursive: true, force: true });
  }
}

async function authContext(databaseUrl: string) {
  const modules = await loadAuthModules();
  const store = modules.store.createSqliteAuthStore(databaseUrl);
  const passwords = modules.password.createBcryptPasswordService();
  const sessions = modules.session.createJwtSessionService(APP_SECRET);
  const auth = modules.service.createAuthService({ store, passwords, sessions });
  return { ...modules, auth, store };
}

test("first administrator setup initializes authentication and returns a valid session", async () => {
  await withAuthService(async ({ auth }) => {
    assert.deepEqual(await auth.status(null), { initialized: false, authenticated: false, email: null });

    const token = await auth.setup({ email: " Admin@Example.com ", password: "secret-123" });

    assert.deepEqual(await auth.status(token), {
      initialized: true,
      authenticated: true,
      email: "admin@example.com",
    });
  });
});

test("administrator setup rejects a second initialization", async () => {
  await withAuthService(async ({ auth }) => {
    await auth.setup({ email: "admin@example.com", password: "secret-123" });

    await assert.rejects(
      auth.setup({ email: "other@example.com", password: "other-secret" }),
      /管理员账号已初始化/,
    );
  });
});

test("login validates the password without exposing which credential failed", async () => {
  await withAuthService(async ({ auth }) => {
    await auth.setup({ email: "admin@example.com", password: "secret-123" });

    await assert.rejects(
      auth.login({ email: "admin@example.com", password: "wrong-password" }),
      /邮箱或密码错误/,
    );
    const token = await auth.login({ email: "ADMIN@example.com", password: "secret-123" });
    assert.equal((await auth.status(token)).authenticated, true);
  });
});

test("tampered session tokens are treated as unauthenticated", async () => {
  await withAuthService(async ({ auth }) => {
    const token = await auth.setup({ email: "admin@example.com", password: "secret-123" });
    const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;

    assert.deepEqual(await auth.status(tampered), {
      initialized: true,
      authenticated: false,
      email: null,
    });
  });
});

test("session cookie options prevent script access and cross-site submission", async () => {
  const { session } = await loadAuthModules();

  assert.deepEqual(session.sessionCookieOptions(false), {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 604800,
  });
  assert.equal(session.sessionCookieOptions(true).secure, true);
});

test("Next.js auth routes and blocking dialog are present", () => {
  const paths = [
    "src/app/api/auth/status/route.ts",
    "src/app/api/auth/setup/route.ts",
    "src/app/api/auth/login/route.ts",
    "src/app/api/auth/logout/route.ts",
    "src/components/auth-dialog.tsx",
    "middleware.ts",
  ];

  for (const path of paths) {
    assert.equal(existsSync(new URL(path, PROJECT_ROOT)), true, `${path} should exist`);
  }
  const dialog = readFileSync(new URL("src/components/auth-dialog.tsx", PROJECT_ROOT), "utf8");
  assert.match(dialog, /无法读取登录状态/);
  assert.match(dialog, /role="alert"/);
});
