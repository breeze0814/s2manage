import type {
  ApiEnvelope,
  ListEnvelope,
  Sub2ApiAccountModel,
  Sub2ApiAccountTestResult,
  Sub2ApiDataAccount,
  Sub2ApiDataPayload,
  Sub2ApiUser,
  Sub2ApiUserSearchResult,
} from "@/server/clients/sub2api-admin-types";

export function unwrapEnvelope<T>(json: unknown): T {
  if (json && typeof json === "object" && "code" in json) {
    const envelope = json as ApiEnvelope<T>;
    if (envelope.code !== 0) throw new Error(envelope.message ?? "Sub2API request failed");
    return envelope.data as T;
  }
  return json as T;
}

export function unwrapList<T>(payload: unknown, label: string): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === "object") {
    const envelope = payload as ListEnvelope<T>;
    if (Array.isArray(envelope.items)) return envelope.items;
    if (Array.isArray(envelope.data)) return envelope.data;
    if (envelope.data && typeof envelope.data === "object" && Array.isArray(envelope.data.items)) return envelope.data.items;
  }
  throw new Error(`Unexpected ${label} list response shape`);
}

export function normalizeAccountModels(payload: unknown): Sub2ApiAccountModel[] {
  return unwrapList<unknown>(payload, "account models")
    .map((item): Sub2ApiAccountModel | null => {
      if (typeof item === "string") return { id: item, type: "model", display_name: item, created_at: "" };
      if (!item || typeof item !== "object") return null;
      const model = item as Partial<Sub2ApiAccountModel>;
      if (typeof model.id !== "string" || !model.id.trim()) return null;
      return {
        id: model.id,
        type: model.type ?? null,
        display_name: model.display_name ?? model.id,
        created_at: model.created_at ?? null,
      } satisfies Sub2ApiAccountModel;
    })
    .filter((model): model is Sub2ApiAccountModel => Boolean(model));
}

export function normalizeDataPayload(payload: unknown): Sub2ApiDataPayload {
  if (Array.isArray(payload)) return { proxies: [], accounts: payload as Sub2ApiDataAccount[] };
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>;
    const nested = record.data && typeof record.data === "object" && !Array.isArray(record.data)
      ? record.data as Record<string, unknown>
      : record;
    const accounts = Array.isArray(nested.accounts)
      ? nested.accounts as Sub2ApiDataAccount[]
      : unwrapList<Sub2ApiDataAccount>(nested, "account data");
    return {
      type: typeof nested.type === "string" ? nested.type : undefined,
      version: typeof nested.version === "number" ? nested.version : undefined,
      exported_at: typeof nested.exported_at === "string" ? nested.exported_at : undefined,
      proxies: Array.isArray(nested.proxies) ? nested.proxies : [],
      accounts,
    };
  }
  return { proxies: [], accounts: unwrapList<Sub2ApiDataAccount>(payload, "account data") };
}

function parseSseEvents(raw: string) {
  const events: Array<Record<string, unknown>> = [];
  let dataLines: string[] = [];

  const flush = () => {
    if (dataLines.length === 0) return;
    const data = dataLines.join("\n").trim();
    dataLines = [];
    if (!data || data === "[DONE]") return;
    try {
      const parsed = JSON.parse(data) as unknown;
      if (parsed && typeof parsed === "object") events.push(parsed as Record<string, unknown>);
    } catch {
      events.push({ type: "content", text: data });
    }
  };

  for (const line of raw.split(/\r?\n/)) {
    if (line.trim() === "") {
      flush();
      continue;
    }
    const match = /^data:\s?(.*)$/.exec(line);
    if (match) dataLines.push(match[1] ?? "");
  }

  flush();
  return events;
}

export function compactMessage(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > 160 ? `${text.slice(0, 160)}...` : text;
}

export function parseAccountTestJson(raw: string, latencyMs: number) {
  const parsed = JSON.parse(raw) as ApiEnvelope<Sub2ApiAccountTestResult> | Sub2ApiAccountTestResult;
  const result = unwrapEnvelope<Sub2ApiAccountTestResult>(parsed);
  if (!result || typeof result !== "object" || !("success" in result)) return null;
  return {
    ...result,
    success: Boolean(result.success),
    message: result.message || (result.success ? "账号测试通过" : "账号测试失败"),
    latency_ms: typeof result.latency_ms === "number" ? result.latency_ms : latencyMs,
  } satisfies Sub2ApiAccountTestResult;
}

export function parseAccountTestSse(raw: string, latencyMs: number): Sub2ApiAccountTestResult {
  const events = parseSseEvents(raw);
  const model = events.find((event) => event.type === "test_start" && typeof event.model === "string")?.model as string | undefined;
  const responseText = events.filter((event) => event.type === "content" || event.type === "status").map((event) => String(event.text ?? "")).join("");
  const imageCount = events.filter((event) => event.type === "image" && event.image_url).length;
  const errorEvent = [...events].reverse().find((event) => event.type === "error" || (event.success === false && event.error));

  if (errorEvent) {
    return {
      success: false,
      message: String(errorEvent.error ?? compactMessage(responseText) ?? "账号测试失败"),
      latency_ms: latencyMs,
      model,
      response_text: responseText || undefined,
      image_count: imageCount || undefined,
      events: events as Sub2ApiAccountTestResult["events"],
    };
  }

  const completeEvent = [...events].reverse().find((event) => event.type === "test_complete");
  if (completeEvent?.success) {
    const detail = compactMessage(responseText);
    return {
      success: true,
      message: detail ? `账号测试通过：${detail}` : "账号测试通过",
      latency_ms: latencyMs,
      model,
      response_text: responseText || undefined,
      image_count: imageCount || undefined,
      events: events as Sub2ApiAccountTestResult["events"],
    };
  }

  return {
    success: false,
    message: events.length > 0 ? "测试流未返回完成状态" : "测试接口未返回有效事件",
    latency_ms: latencyMs,
    model,
    response_text: responseText || undefined,
    image_count: imageCount || undefined,
    events: events as Sub2ApiAccountTestResult["events"],
  };
}

export function normalizeUserSearchResult(payload: unknown): Sub2ApiUserSearchResult {
  if (!payload || typeof payload !== "object") throw new Error("Unexpected users list response shape");
  const record = payload as Record<string, unknown>;
  const nested = record.data && typeof record.data === "object" && !Array.isArray(record.data)
    ? record.data as Record<string, unknown>
    : record;
  const items = Array.isArray(nested.items) ? nested.items : null;

  if (!items) throw new Error("Unexpected users list response shape");

  return {
    items: items as Sub2ApiUser[],
    total: typeof nested.total === "number" ? nested.total : items.length,
    page: typeof nested.page === "number" ? nested.page : 1,
    page_size: typeof nested.page_size === "number" ? nested.page_size : items.length,
    pages: typeof nested.pages === "number" ? nested.pages : 1,
  };
}
