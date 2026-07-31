import { jwtVerify, SignJWT } from "jose";
import { EMBED_KINDS, type EmbedIdentity, type EmbedKind } from "./types.ts";

const ISSUER = "s2a-rate-bot";
const AUDIENCE = "s2a-embed";
const SESSION_TTL_SECONDS = 30 * 60;

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

function text(value: unknown) { return typeof value === "string" ? value : ""; }
function nullableNumber(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function isEmbedKind(value: unknown): value is EmbedKind { return EMBED_KINDS.includes(value as EmbedKind); }
