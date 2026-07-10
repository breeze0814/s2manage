import type { JsonHttpClient } from "../../adapters/http-client.ts";
import type { TargetGroup, TargetGroupClient } from "./types.ts";

export function createSub2TargetGroupClient(input: {
  readonly baseUrl: string;
  readonly adminApiKey: string;
  readonly http: JsonHttpClient;
}): TargetGroupClient {
  const baseUrl = input.baseUrl.replace(/\/+$/, "");
  const headers = { "x-api-key": input.adminApiKey, accept: "application/json", "content-type": "application/json" };
  return {
    listGroups: async () => unwrapGroups(await input.http.request({ url: `${baseUrl}/api/v1/admin/groups/all`, method: "GET", headers })),
    updateGroupRate: async (groupId, rate) => unwrapGroup(await input.http.request({ url: `${baseUrl}/api/v1/admin/groups/${groupId}`, method: "PUT", headers, body: { rate_multiplier: rate } })),
  };
}

function unwrapGroups(value: unknown): TargetGroup[] {
  const data = unwrap(value);
  return Array.isArray(data) ? data as TargetGroup[] : [];
}

function unwrapGroup(value: unknown): TargetGroup {
  const data = unwrap(value);
  if (!data || typeof data !== "object" || !("id" in data)) throw new Error("目标站分组更新响应无效");
  return data as TargetGroup;
}

function unwrap(value: unknown) {
  return value && typeof value === "object" && "data" in value ? (value as Record<string, unknown>).data : value;
}
