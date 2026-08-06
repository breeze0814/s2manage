import { jwtVerify, SignJWT } from "jose";
import { randomBytes } from "node:crypto";
import type { RedisClientType } from "redis";
import { EMBED_KINDS, type EmbedIdentity, type EmbedKind } from "./types.ts";

const ISSUER = "s2a-rate-bot";
const AUDIENCE = "s2a-embed";
const SESSION_TTL_SECONDS = 30 * 60;
const REDIS_SESSION_PREFIX = "s2a:embed:session:";

export type EmbedSessionService = {
  readonly issue: (identity: EmbedIdentity) => Promise<string>;
  readonly verify: (token: string, kind: EmbedKind) => Promise<EmbedIdentity | null>;
};

export function createEmbedSessionService(secret: string): EmbedSessionService {
  const key = new TextEncoder().encode(secret);
  return {
    issue: (identity) => new SignJWT({ ...identity })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer(ISSUER).setAudience(AUDIENCE).setIssuedAt().setExpirationTime(`${SESSION_TTL_SECONDS}s`).sign(key),
    verify: async (token, kind) => {
      if (!token.trim()) return null;
      try {
        const { payload } = await jwtVerify(token, key, { issuer: ISSUER, audience: AUDIENCE });
        if (payload.kind !== kind || !isEmbedKind(payload.kind)) return null;
        const identity = {
          kind: payload.kind,
          embedToken: text(payload.embedToken), srcHost: text(payload.srcHost), srcUrl: text(payload.srcUrl),
          sub2apiUserId: text(payload.sub2apiUserId), sub2apiEmail: text(payload.sub2apiEmail),
          sub2apiRole: text(payload.sub2apiRole), sub2apiBalance: nullableNumber(payload.sub2apiBalance),
        } satisfies EmbedIdentity;
        return identity.embedToken && identity.srcHost && identity.sub2apiUserId ? identity : null;
      } catch {
        return null;
      }
    },
  };
}

export function createRedisEmbedSessionService(input: Readonly<{
  client: RedisClientType;
  ready: Promise<RedisClientType>;
}>): EmbedSessionService {
  return {
    issue: async (identity) => {
      await input.ready;
      const token = randomBytes(32).toString("base64url");
      await input.client.set(`${REDIS_SESSION_PREFIX}${token}`, JSON.stringify(identity), { EX: SESSION_TTL_SECONDS });
      return token;
    },
    verify: async (token, kind) => {
      if (!token.trim()) return null;
      await input.ready;
      const raw = await input.client.get(`${REDIS_SESSION_PREFIX}${token}`);
      if (!raw) return null;
      return parsedIdentity(raw, kind);
    },
  };
}

function text(value: unknown) { return typeof value === "string" ? value : ""; }
function nullableNumber(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function isEmbedKind(value: unknown): value is EmbedKind { return EMBED_KINDS.includes(value as EmbedKind); }

function parsedIdentity(raw: string, kind: EmbedKind) {
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(raw) as Record<string, unknown>; } catch { return null; }
  if (payload.kind !== kind || !isEmbedKind(payload.kind)) return null;
  const identity = {
    kind: payload.kind, embedToken: text(payload.embedToken), srcHost: text(payload.srcHost),
    srcUrl: text(payload.srcUrl), sub2apiUserId: text(payload.sub2apiUserId),
    sub2apiEmail: text(payload.sub2apiEmail), sub2apiRole: text(payload.sub2apiRole),
    sub2apiBalance: nullableNumber(payload.sub2apiBalance),
  } satisfies EmbedIdentity;
  return identity.embedToken && identity.srcHost && identity.sub2apiUserId ? identity : null;
}
