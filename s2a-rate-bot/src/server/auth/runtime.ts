import { createBcryptPasswordService } from "./password.ts";
import { createAuthService, type AuthService } from "./service.ts";
import { createJwtSessionService } from "./session.ts";
import { createSqliteAuthStore } from "./store.ts";

const DEFAULT_DATABASE_URL = "file:./data/s2a-rate-bot.db";
const globalAuth = globalThis as typeof globalThis & { s2aAuthService?: AuthService };

export function getRuntimeAuthService(env: NodeJS.ProcessEnv = process.env) {
  if (env === process.env && globalAuth.s2aAuthService) return globalAuth.s2aAuthService;
  const service = buildAuthService(env);
  if (env === process.env) globalAuth.s2aAuthService = service;
  return service;
}

function buildAuthService(env: NodeJS.ProcessEnv) {
  const appSecret = env.APP_SECRET;
  if (!appSecret) throw new Error("APP_SECRET is required");
  return createAuthService({
    store: createSqliteAuthStore(env.DATABASE_URL ?? DEFAULT_DATABASE_URL),
    passwords: createBcryptPasswordService(),
    sessions: createJwtSessionService(appSecret),
  });
}
