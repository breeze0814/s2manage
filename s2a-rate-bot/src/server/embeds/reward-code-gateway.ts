import { z } from "zod";
import { createJsonHttpClient, type JsonHttpClient } from "../../adapters/http-client.ts";
import type { SettingsService } from "../settings/service.ts";
import type { LotteryPrize } from "./types.ts";

const rewardCodeSchema = z.object({
  id: z.coerce.number().int().positive(),
  code: z.string().trim().min(1),
  type: z.enum(["balance", "subscription"]),
  value: z.coerce.number().finite().positive(),
});

export type RewardCode = z.infer<typeof rewardCodeSchema>;
export type RewardCodeRequest = Pick<LotteryPrize, "type" | "value"> & { readonly count: number };
export type RewardCodeGateway = {
  readonly generate: (request: RewardCodeRequest, idempotencyKey?: string) => Promise<readonly RewardCode[]>;
};

export function createRewardCodeGateway(input: {
  readonly baseUrl: string;
  readonly adminApiKey: string;
  readonly http: JsonHttpClient;
}): RewardCodeGateway {
  const baseUrl = input.baseUrl.replace(/\/+$/, "");
  const headers = { "x-api-key": input.adminApiKey, accept: "application/json", "content-type": "application/json" };
  return { generate: async (request, idempotencyKey) => parseCodes(await input.http.request({
    url: `${baseUrl}/api/v1/admin/redeem-codes/generate`, method: "POST",
    headers: idempotencyKey ? { ...headers, "idempotency-key": idempotencyKey } : headers, body: request,
  }), request) };
}

export function createRuntimeRewardCodeGateway(settings: SettingsService): RewardCodeGateway {
  return { generate: async (request, idempotencyKey) => {
    const snapshot = await settings.get();
    if (!snapshot.target) throw new Error("目标站尚未配置，无法生成抽奖兑换码");
    const http = createJsonHttpClient({
      timeoutMs: snapshot.worker.timeoutSeconds * 1_000,
      proxyUrl: snapshot.proxy.enabled ? snapshot.proxy.proxyUrl : null,
    });
    return createRewardCodeGateway({ ...snapshot.target, http }).generate(request, idempotencyKey);
  } };
}

function parseCodes(value: unknown, request: RewardCodeRequest) {
  const payload = value && typeof value === "object" && "data" in value
    ? (value as Record<string, unknown>).data
    : value;
  const codes = z.array(rewardCodeSchema).parse(payload);
  if (codes.length !== request.count) {
    throw new Error(`目标站返回 ${codes.length} 个兑换码，预期 ${request.count} 个`);
  }
  if (codes.some((code) => code.type !== request.type || code.value !== request.value)) {
    throw new Error("目标站返回的兑换码类型或额度与奖品配置不一致");
  }
  return codes;
}
