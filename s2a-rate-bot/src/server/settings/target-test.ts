import type { JsonHttpClient } from "../../adapters/http-client.ts";
import type { AppSettings } from "./service.ts";

export async function testTargetConnection(input: {
  readonly target: AppSettings["target"];
  readonly http: JsonHttpClient;
}) {
  const payload = await input.http.request<unknown>({
    url: `${input.target.baseUrl}/api/v1/admin/groups/all`,
    method: "GET",
    headers: { "x-api-key": input.target.adminApiKey, accept: "application/json" },
  });
  const groups = unwrapGroups(payload);
  return { ok: true, count: groups.length, message: `连接成功，获取到 ${groups.length} 个分组` };
}

function unwrapGroups(payload: unknown) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const data = (payload as Record<string, unknown>).data;
  return Array.isArray(data) ? data : [];
}
