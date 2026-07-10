import { z } from "zod";
import type { JsonHttpClient } from "../../adapters/http-client.ts";
import type { TargetAccount, TargetAccountClient } from "./types.ts";

const remoteAccountSchema = z.object({
  id: z.coerce.number().int().positive(),
  name: z.string().trim().min(1),
  platform: z.string().trim().min(1),
  status: z.string().trim().min(1),
  schedulable: z.boolean(),
  rate_multiplier: z.coerce.number().finite().nullable().optional(),
  priority: z.coerce.number().int().nullable().optional(),
  group_ids: z.array(z.coerce.number().int().positive()).optional(),
  account_groups: z.array(z.object({ group_id: z.coerce.number().int().positive() }).passthrough()).optional(),
}).passthrough();

export function createSub2TargetAccountClient(input: {
  readonly baseUrl: string;
  readonly adminApiKey: string;
  readonly http: JsonHttpClient;
}): TargetAccountClient {
  const request = (method: "GET" | "POST", path: string, body?: Record<string, unknown>) => input.http.request({
    url: `${input.baseUrl.replace(/\/+$/, "")}/api/v1/admin${path}`,
    method,
    headers: adminHeaders(input.adminApiKey),
    body,
  });
  return {
    listAccounts: async () => parseAccountList(await request("GET", "/accounts?page=1&page_size=1000")),
    setSchedulable: async (accountId, schedulable) => parseAccount(await request("POST", `/accounts/${accountId}/schedulable`, { schedulable })),
  };
}

function parseAccountList(payload: unknown) {
  const value = unwrapData(payload);
  const list = Array.isArray(value) ? value : recordItems(value);
  if (!list) throw new Error("Invalid target account list response");
  return list.map(parseAccount);
}

function parseAccount(payload: unknown): TargetAccount {
  const account = remoteAccountSchema.parse(unwrapData(payload));
  const groupIds = [...(account.group_ids ?? []), ...(account.account_groups ?? []).map((item) => item.group_id)];
  return {
    id: account.id,
    name: account.name,
    platform: account.platform,
    status: account.status,
    schedulable: account.schedulable,
    rateMultiplier: account.rate_multiplier ?? null,
    priority: account.priority ?? null,
    groupIds: [...new Set(groupIds)],
  };
}

function unwrapData(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  return "data" in record ? record.data : value;
}

function recordItems(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const items = (value as Record<string, unknown>).items;
  return Array.isArray(items) ? items : null;
}

function adminHeaders(adminApiKey: string) {
  return { "x-api-key": adminApiKey, accept: "application/json", "content-type": "application/json; charset=utf-8" };
}
