import { type BlCollectionSite, type Prisma } from "@prisma/client";
import { parseTokenExpire, safeJsonString } from "@/lib/utils";
import { clientForBlCollectionSite } from "@/server/bl-collection/clients";
import type { BlCollectionSiteInput } from "@/server/bl-collection/types";
import { db } from "@/server/db";
import { decrypt, encrypt } from "@/server/crypto";

type SiteCleanupTx = Prisma.TransactionClient;

const TOKEN_REFRESH_SKEW_SECONDS = 5 * 60;

async function disableRulesWithoutBindings(tx: SiteCleanupTx, connectionId: number) {
  const [groupTargets, accountTargets] = await Promise.all([
    tx.blSourceBinding.findMany({
      where: { connectionId, targetType: "group" },
      select: { targetId: true },
      distinct: ["targetId"],
    }),
    tx.blSourceBinding.findMany({
      where: { connectionId, targetType: "account" },
      select: { targetId: true },
      distinct: ["targetId"],
    }),
  ]);
  const groupIds = groupTargets.map((row) => row.targetId);
  const accountIds = accountTargets.map((row) => row.targetId);

  const [groupRules, accountRules] = await Promise.all([
    tx.blGroupRateRule.updateMany({
      where: {
        connectionId,
        enabled: true,
        ...(groupIds.length > 0 ? { groupId: { notIn: groupIds } } : {}),
      },
      data: { enabled: false },
    }),
    tx.blAccountRateRule.updateMany({
      where: {
        connectionId,
        enabled: true,
        ...(accountIds.length > 0 ? { accountId: { notIn: accountIds } } : {}),
      },
      data: { enabled: false },
    }),
  ]);

  return groupRules.count + accountRules.count;
}

export async function listBlCollectionSites(connectionId?: number) {
  return db.blCollectionSite.findMany({
    where: connectionId ? { connectionId } : undefined,
    orderBy: [{ connectionId: "asc" }, { id: "asc" }],
  });
}

export async function getBlCollectionSite(id: number) {
  return db.blCollectionSite.findUnique({ where: { id } });
}

export function blCollectionSitePassword(site: Pick<BlCollectionSite, "passwordEnc">) {
  return site.passwordEnc ? decrypt(site.passwordEnc) : "";
}

type NewApiTokenContext = {
  siteType?: string | null;
  newApiUserId?: string | null;
};

function normalizeNewApiAccessToken(context: NewApiTokenContext, accessToken?: string | null) {
  const rawAccess = accessToken?.trim() ?? "";
  if (context.siteType !== "new_api" || !rawAccess) return rawAccess;

  const separatorIndex = rawAccess.indexOf("::");
  const rawToken = separatorIndex >= 0 ? rawAccess.slice(0, separatorIndex) : rawAccess;
  const rawUserId = separatorIndex >= 0 ? rawAccess.slice(separatorIndex + 2).trim() : "";
  let token = rawToken.trim();
  const lowerToken = token.toLowerCase();

  if (lowerToken.startsWith("cookie:")) token = token.slice(token.indexOf(":") + 1).trim();
  if (token.includes("=") && !token.startsWith("session:") && !lowerToken.startsWith("bearer ")) token = `session:${token}`;

  const userId = rawUserId || context.newApiUserId?.trim() || "";
  return userId ? `${token}::${userId}` : token;
}

export async function saveBlCollectionSite(input: BlCollectionSiteInput) {
  const name = input.name.trim();
  const baseUrl = input.baseUrl.trim().replace(/\/+$/, "");
  const newApiUserId = input.siteType === "new_api" ? input.newApiUserId?.trim() || null : null;
  const proxyUrl = normalizeProxyUrl(input.proxyUrl);

  if (!name || !/^https?:\/\//i.test(baseUrl)) {
    throw new Error("请填写源站名称，并确保源站地址以 http:// 或 https:// 开头");
  }
  if (input.authMode === "password") {
    if (!input.email?.trim() && input.siteType === "sub2api") throw new Error("Sub2API 自动登录模式必须填写账号 / 邮箱");
    if (!input.id && input.siteType === "sub2api" && !input.password) throw new Error("新增 Sub2API 自动登录源站必须填写登录密码");
  }
  if (input.authMode === "manual_token" && !input.id && !input.accessToken?.trim()) {
    throw new Error("手动 Token 模式新增源站必须填写 access_token");
  }

  const data = {
    connectionId: input.connectionId,
    name,
    baseUrl,
    siteType: input.siteType,
    email: input.email?.trim() ?? "",
    passwordEnc: input.password ? encrypt(input.password) : "",
    newApiUserId,
    authMode: input.authMode,
    enabled: input.enabled,
    intervalMin: Math.max(1, Math.trunc(input.intervalMin || 60)),
    rechargeRatio: normalizeRechargeRatio(input.rechargeRatio),
    proxyUrl,
    accessToken: normalizeNewApiAccessToken({ siteType: input.siteType, newApiUserId }, input.accessToken) || null,
    refreshToken: input.refreshToken?.trim() || null,
    tokenExpire: parseTokenExpire(input.tokenExpire),
  } satisfies Prisma.BlCollectionSiteUncheckedCreateInput;

  if (!input.id) return db.blCollectionSite.create({ data });

  const update: Prisma.BlCollectionSiteUncheckedUpdateInput = {
    name: data.name,
    baseUrl: data.baseUrl,
    siteType: data.siteType,
    email: data.email,
    newApiUserId: data.newApiUserId,
    authMode: data.authMode,
    enabled: data.enabled,
    intervalMin: data.intervalMin,
    rechargeRatio: data.rechargeRatio,
    proxyUrl: data.proxyUrl,
  };
  if (input.password) update.passwordEnc = data.passwordEnc;
  if ("accessToken" in input) update.accessToken = data.accessToken;
  if ("refreshToken" in input) update.refreshToken = data.refreshToken;
  if ("tokenExpire" in input) update.tokenExpire = data.tokenExpire;

  const result = await db.blCollectionSite.updateMany({
    where: { id: input.id, connectionId: input.connectionId },
    data: update,
  });
  if (result.count === 0) throw new Error("采集源站不存在");

  return db.blCollectionSite.findFirstOrThrow({
    where: { id: input.id, connectionId: input.connectionId },
  });
}

export async function deleteBlCollectionSite(id: number, connectionId: number) {
  return db.$transaction(async (tx) => {
    const site = await tx.blCollectionSite.findFirst({
      where: { id, connectionId },
      select: { id: true },
    });
    if (!site) throw new Error("采集源站不存在");

    const deletedSite = await tx.blCollectionSite.deleteMany({ where: { id, connectionId } });
    const deletedSourceBindings = await tx.blSourceBinding.deleteMany({
      where: { connectionId, sourceSiteId: id },
    });
    const deletedMonitorRateExclusions = await tx.upstreamMonitorRateExclusion.deleteMany({
      where: { connectionId, sourceSiteId: id },
    });
    const disabledRulesWithoutSources = await disableRulesWithoutBindings(tx, connectionId);

    return {
      ok: true,
      deletedSites: deletedSite.count,
      deletedSourceBindings: deletedSourceBindings.count,
      deletedMonitorRateExclusions: deletedMonitorRateExclusions.count,
      disabledRulesWithoutSources,
    };
  });
}

export async function testBlCollectionSite(site: BlCollectionSite) {
  try {
    const client = clientForBlCollectionSite(site);
    const token = await ensureBlCollectionToken(site, client);
    const groups = await client.groupsAvailable(token.access_token);
    return { ok: true, message: `连接成功，获取到 ${groups.length} 个分组` };
  } catch (error) {
    return { ok: false, message: friendlyBlCollectionError(error) };
  }
}

export async function ensureBlCollectionToken(
  site: BlCollectionSite,
  client = clientForBlCollectionSite(site),
) {
  if (site.authMode === "manual_token") return ensureManualToken(site, client);

  if (site.siteType === "new_api") {
    return saveTokens(site, await client.login(site.email, blCollectionSitePassword(site)));
  }

  const access = site.accessToken?.trim();
  const expire = effectiveTokenExpire(site.tokenExpire, access);
  const now = Math.floor(Date.now() / 1000);
  if (access && expire > now + TOKEN_REFRESH_SKEW_SECONDS) {
    return { access_token: access, refresh_token: site.refreshToken ?? "", expires_in: expire - now };
  }
  const refresh = site.refreshToken?.trim();
  if (refresh) {
    try {
      return saveTokens(site, await client.refresh(refresh), { fallbackRefreshToken: refresh });
    } catch {
      // Fall through to password login.
    }
  }
  return saveTokens(site, await client.login(site.email, blCollectionSitePassword(site)));
}

function normalizeRechargeRatio(value: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
}

function normalizeProxyUrl(value?: string) {
  const proxy = value?.trim();
  if (!proxy) return null;
  if (!/^https?:\/\//i.test(proxy)) {
    throw new Error("代理地址必须以 http:// 或 https:// 开头，留空表示直连");
  }
  return proxy;
}

async function ensureManualToken(site: BlCollectionSite, client: ReturnType<typeof clientForBlCollectionSite>) {
  const access = normalizeNewApiAccessToken(site, site.accessToken);
  const refresh = site.refreshToken?.trim();
  const expire = effectiveTokenExpire(site.tokenExpire, access);
  const now = Math.floor(Date.now() / 1000);
  if (!access) throw new Error("手动 Token 模式缺少 access_token，请先在目标站点登录后粘贴 token");
  if (!expire || expire > now + TOKEN_REFRESH_SKEW_SECONDS) {
    return { access_token: access, refresh_token: refresh ?? "", expires_in: expire ? expire - now : 0 };
  }
  if (refresh) {
    try {
      return saveTokens(site, await client.refresh(refresh), { fallbackRefreshToken: refresh });
    } catch {
      throw new Error("手动 Token 已过期，refresh_token 刷新失败，请重新粘贴新的 token");
    }
  }
  throw new Error("手动 Token 已过期且没有 refresh_token，请重新登录目标站点并粘贴新的 token");
}

type SaveTokenOptions = {
  fallbackRefreshToken?: string;
};

async function saveTokens(
  site: NewApiTokenContext & { id: number },
  tokens: { access_token?: string; refresh_token?: string; expires_in?: number | string },
  options: SaveTokenOptions = {},
) {
  if (!tokens.access_token) throw new Error("登录响应缺少 access_token");
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = tokenExpiresAt(tokens, now);
  const refreshToken = tokens.refresh_token?.trim() || options.fallbackRefreshToken?.trim() || "";
  const accessToken = normalizeNewApiAccessToken(site, tokens.access_token);
  await db.blCollectionSite.update({
    where: { id: site.id },
    data: {
      accessToken,
      refreshToken,
      tokenExpire: BigInt(expiresAt),
    },
  });
  return { access_token: accessToken, refresh_token: refreshToken, expires_in: Math.max(0, expiresAt - now) };
}

function tokenExpiresAt(tokens: { access_token?: string; expires_in?: number | string }, now: number) {
  const raw = tokens.expires_in;
  if (raw !== undefined && raw !== null && raw !== "") {
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) {
      const seconds = Math.floor(numeric);
      if (seconds <= 0) return now;
      if (seconds > 200_000_000_000) return Math.floor(seconds / 1000);
      if (seconds > 1_000_000_000) return seconds;
      return now + seconds;
    }
  }

  return (tokens.access_token ? jwtExpire(tokens.access_token) : null) ?? now + 3600;
}

function effectiveTokenExpire(storedExpire: bigint | null | undefined, accessToken?: string | null) {
  const stored = normalizeStoredTokenExpire(storedExpire);
  const jwt = accessToken ? jwtExpire(accessToken) : null;
  if (jwt && (!stored || jwt < stored)) return jwt;
  return stored;
}

function normalizeStoredTokenExpire(value: bigint | null | undefined) {
  if (!value) return 0;
  if (value > 200_000_000_000n) return Number(value / 1000n);
  return Number(value);
}

function jwtExpire(token: string) {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as {
      exp?: unknown;
    };
    return typeof decoded.exp === "number" ? decoded.exp : null;
  } catch {
    return null;
  }
}

export function friendlyBlCollectionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (lower.includes("manual token") || message.includes("手动 Token")) return message;
  if (message.includes("登录失败") || message.includes("session 已过期") || message.includes("session 过期")) {
    return message.includes("HTTP 401") ? "账号密码错误或账号已被禁用，请检查后重试" : message;
  }
  if (lower.includes("401")) return "认证失败：自动登录源站请检查邮箱 / 密码；手动 Token 源站请重新粘贴 token";
  if (message.includes("密码")) return "登录失败，请检查邮箱或密码";
  if (lower.includes("captcha") || message.includes("人机验证")) return "目标站点开启了人机验证，请切换为手动 Token";
  if (lower.includes("2fa") || lower.includes("requires_2fa")) return "目标账号开启了 2FA，请切换为手动 Token";
  if (lower.includes("could not resolve") || lower.includes("timed out") || message.includes("连接")) return message;
  if (lower.includes("404")) return "目标站点接口不存在或未开放";
  return safeJsonString(message);
}
