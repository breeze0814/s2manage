import { z } from "zod";
import type { HttpClient } from "../../adapters/http-client.ts";
import { testTargetAccountChannel } from "./test-client.ts";
import type { TargetAccount, TargetAccountClient } from "./types.ts";

const ACCOUNT_PAGE_SIZE = 1_000;

const remoteAccountSchema = z.object({
  id: z.coerce.number().int().positive(),
  name: z.string().trim().min(1),
  platform: z.string().trim().min(1),
  status: z.string().trim().min(1),
  rate_multiplier: z.coerce.number().finite().nullable().optional(),
  priority: z.coerce.number().int().nullable().optional(),
  group_ids: z.array(z.coerce.number().int().positive()).optional(),
  account_groups: z.array(z.object({ group_id: z.coerce.number().int().positive() }).passthrough()).optional(),
}).passthrough();

export function createSub2TargetAccountClient(input: {
  readonly baseUrl: string;
  readonly adminApiKey: string;
  readonly http: HttpClient;
}): TargetAccountClient {
  const request = (method: "GET" | "POST", path: string, body?: Record<string, unknown>) => input.http.request({
    url: `${input.baseUrl.replace(/\/+$/, "")}/api/v1/admin${path}`,
    method,
    headers: adminHeaders(input.adminApiKey),
    body,
  });
  return {
    listAccounts: async () => listAllAccounts(request),
    testChannel: (accountId) => testTargetAccountChannel({ ...input, accountId }),
  };
}

async function listAllAccounts(request: RemoteRequest) {
  const accounts: TargetAccount[] = [];
  const accountIds = new Set<number>();
  let page = 1;
  while (true) {
    const result = parseAccountPage(await request("GET", accountPagePath(page)), page);
    appendUniqueAccounts(accounts, accountIds, result.accounts);
    if (!result.hasMore) return accounts;
    page += 1;
  }
}

function parseAccountPage(payload: unknown, requestedPage: number) {
  const value = unwrapData(payload);
  if (Array.isArray(value)) return { accounts: value.map(parseAccount), hasMore: false };
  const record = objectRecord(value, "Invalid target account list response");
  if (!Array.isArray(record.items)) throw new Error("Invalid target account list response");
  const accounts = record.items.map(parseAccount);
  return { accounts, hasMore: hasNextPage(record, requestedPage, accounts.length) };
}

function hasNextPage(record: Record<string, unknown>, requestedPage: number, itemCount: number) {
  const page = positiveInteger(record.page) ?? requestedPage;
  const pageSize = positiveInteger(record.page_size ?? record.pageSize) ?? ACCOUNT_PAGE_SIZE;
  const total = nonNegativeInteger(record.total);
  return total === null ? itemCount === ACCOUNT_PAGE_SIZE : page * pageSize < total;
}

function appendUniqueAccounts(target: TargetAccount[], ids: Set<number>, accounts: readonly TargetAccount[]) {
  for (const account of accounts) {
    if (ids.has(account.id)) throw new Error(`目标账号分页返回重复账号: ${account.id}`);
    ids.add(account.id);
    target.push(account);
  }
}

function parseAccount(payload: unknown): TargetAccount {
  const account = remoteAccountSchema.parse(unwrapData(payload));
  const groupIds = [...(account.group_ids ?? []), ...(account.account_groups ?? []).map((item) => item.group_id)];
  return {
    id: account.id,
    name: account.name,
    platform: account.platform,
    status: account.status,
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

function objectRecord(value: unknown, message: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function nonNegativeInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function accountPagePath(page: number) { return `/accounts?page=${page}&page_size=${ACCOUNT_PAGE_SIZE}`; }

function adminHeaders(adminApiKey: string) {
  return { "x-api-key": adminApiKey, accept: "application/json", "content-type": "application/json; charset=utf-8" };
}

type RemoteRequest = (method: "GET" | "POST", path: string, body?: Record<string, unknown>) => Promise<unknown>;
