import { z } from "zod";
import type { EmbedConfigService } from "./config-service.ts";
import { basicSettings } from "./config-service.ts";
import type { EmbedSessionService } from "./session.ts";
import type { EmbedUpstreamGateway } from "./upstream.ts";
import { normalizedOrigin } from "./upstream.ts";
import { EmbedError, type EmbedIdentity, type EmbedKind } from "./types.ts";

const requestSchema = z.object({
  embedToken: z.string().trim().min(1),
  sub2apiToken: z.string().trim().min(1),
  userId: z.string().trim().optional(),
  urlUserId: z.string().trim().optional(),
  srcHost: z.string().trim().min(1),
  srcUrl: z.string().trim().optional(),
});

export type EmbedIdentityService = ReturnType<typeof createEmbedIdentityService>;

export function createEmbedIdentityService(input: {
  readonly configs: EmbedConfigService;
  readonly sessions: EmbedSessionService;
  readonly upstream: EmbedUpstreamGateway;
}) {
  return {
    exchange: async (kind: EmbedKind, raw: unknown) => exchangeIdentity(input, kind, raw),
  };
}

async function exchangeIdentity(input: IdentityDependencies, kind: EmbedKind, raw: unknown) {
  const request = requestSchema.parse(raw);
  const config = await input.configs.getByToken(request.embedToken);
  if (!config || config.kind !== kind) throw new EmbedError("嵌入配置不存在或链接已失效", 404);
  const configuredOrigin = basicSettings(config).sourceOrigin;
  const currentOrigin = await input.upstream.sourceOrigin();
  const requestOrigin = parseOrigin(request.srcHost);
  if (configuredOrigin !== currentOrigin || requestOrigin !== currentOrigin) {
    throw new EmbedError("嵌入来源与当前目标站不一致", 403);
  }
  const user = await fetchVerifiedUser(input, requestOrigin, request.sub2apiToken);
  const claimedUserId = request.userId || request.urlUserId;
  if (claimedUserId && claimedUserId !== user.id) throw new EmbedError("用户身份校验失败", 403);
  const identity = buildIdentity(kind, request, requestOrigin, user);
  return { sessionToken: await input.sessions.issue(identity), identity, config };
}

async function fetchVerifiedUser(input: IdentityDependencies, origin: string, token: string) {
  try {
    const user = await input.upstream.currentUser(origin, token);
    if (!user.id) throw new Error("上游用户响应缺少 ID");
    return user;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new EmbedError(`Sub2API 用户认证失败：${message}`, 401);
  }
}

function buildIdentity(
  kind: EmbedKind,
  request: z.infer<typeof requestSchema>,
  origin: string,
  user: Awaited<ReturnType<EmbedUpstreamGateway["currentUser"]>>,
): EmbedIdentity {
  return {
    kind,
    embedToken: request.embedToken,
    srcHost: origin,
    srcUrl: validSourceUrl(request.srcUrl, origin),
    sub2apiUserId: user.id,
    sub2apiEmail: user.email,
    sub2apiRole: user.role,
    sub2apiBalance: user.balance,
  };
}

function validSourceUrl(value: string | undefined, origin: string) {
  if (!value) return "";
  let url: URL;
  try { url = new URL(value); } catch { throw new EmbedError("来源页面地址无效"); }
  if (url.origin !== origin) throw new EmbedError("来源页面地址与目标站不一致", 403);
  return url.toString();
}

function parseOrigin(value: string) {
  try { return normalizedOrigin(value); } catch { throw new EmbedError("嵌入来源地址无效"); }
}

type IdentityDependencies = Parameters<typeof createEmbedIdentityService>[0];
