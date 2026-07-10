import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE_NAME = "s2a_rate_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const MIN_SECRET_LENGTH = 24;

export type SessionIdentity = {
  readonly email: string;
};

export type SessionService = {
  readonly sign: (identity: SessionIdentity) => Promise<string>;
  readonly verify: (token: string | null | undefined) => Promise<SessionIdentity | null>;
};

export function createJwtSessionService(secret: string): SessionService {
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`APP_SECRET must contain at least ${MIN_SECRET_LENGTH} characters`);
  }
  const key = new TextEncoder().encode(secret);
  return {
    sign: (identity) => signIdentity(identity, key),
    verify: (token) => verifyIdentity(token, key),
  };
}

export function sessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

async function signIdentity(identity: SessionIdentity, key: Uint8Array) {
  return new SignJWT({ email: identity.email, role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(key);
}

async function verifyIdentity(token: string | null | undefined, key: Uint8Array) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key);
    if (payload.role !== "admin" || typeof payload.email !== "string") return null;
    return { email: payload.email };
  } catch {
    return null;
  }
}
