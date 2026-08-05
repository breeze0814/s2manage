export type JsonRequest = Readonly<{
  url: string;
  headers: Readonly<Record<string, string>>;
  body: Readonly<Record<string, unknown>>;
}>;

export type JsonTransport = Readonly<{
  request: (input: JsonRequest) => Promise<unknown>;
}>;

const DEFAULT_TIMEOUT_MS = 30_000;

export function createFetchTransport(
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl: typeof fetch = fetch,
): JsonTransport {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error("请求超时必须是正整数");
  return { request: (input) => requestJson(input, timeoutMs, fetchImpl) };
}

async function requestJson(input: JsonRequest, timeoutMs: number, fetchImpl: typeof fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(input.url, {
      method: "POST",
      headers: input.headers,
      body: JSON.stringify(input.body),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`联动小铺返回 HTTP ${response.status}: ${text}`);
    return parseJson(text);
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`联动小铺请求超时（${timeoutMs}ms）`, { cause: error });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error("联动小铺返回的内容不是有效 JSON", { cause: error });
  }
}
