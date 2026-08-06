import { createBcryptPasswordService } from "./password.ts";
import { createAuthService, type AuthService } from "./service.ts";
import { createJwtSessionService } from "./session.ts";
import { getRuntimeInfrastructure } from "../infrastructure/runtime.ts";
import { createPostgresAuthStore } from "./postgres-store.ts";

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
  const infrastructure = getRuntimeInfrastructure(env);
  return createAuthService({
    store: createPostgresAuthStore(infrastructure.postgres),
    passwords: createBcryptPasswordService(),
    sessions: createJwtSessionService(appSecret),
  });
}
