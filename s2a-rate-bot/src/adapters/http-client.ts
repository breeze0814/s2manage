import { fetch, ProxyAgent, type RequestInit } from "undici";

type JsonBody = Record<string, unknown>;

export type JsonRequest = {
  readonly url: string;
  readonly method: "GET" | "POST" | "PUT" | "DELETE";
  readonly headers: Record<string, string>;
  readonly body?: JsonBody;
  readonly timeoutMs?: number;
  readonly proxyUrl?: string | null;
};

export type JsonClientRequest = Omit<JsonRequest, "timeoutMs" | "proxyUrl">;
export type JsonHttpClient = {
  readonly request: <T = unknown>(input: JsonClientRequest) => Promise<T>;
};

export function createJsonHttpClient(options: {
  readonly timeoutMs: number;
  readonly proxyUrl: string | null;
}): JsonHttpClient {
  return {
    request: (input) => requestJson({ ...input, ...options }),
  };
}

const DEFAULT_TIMEOUT_MS = 25_000;

export async function requestJson<T = unknown>(input: JsonRequest): Promise<T> {
  const result = await fetchText(input);
  if (!result.ok) throw new Error(`HTTP ${result.status}: ${result.text.slice(0, 300)}`);
  return (result.text.trim() ? JSON.parse(result.text) : {}) as T;
}

async function fetchText(input: JsonRequest) {
  const controller = new AbortController();
  const dispatcher = proxyDispatcher(input.proxyUrl);
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(input.url, fetchOptions(input, controller, dispatcher));
    return {
      ok: response.ok,
      status: response.status,
      text: await response.text(),
    };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Request timeout after ${input.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`, { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timer);
    await dispatcher?.close();
  }
}

function fetchOptions(input: JsonRequest, controller: AbortController, dispatcher: ProxyAgent | null) {
  return {
    method: input.method,
    signal: controller.signal,
    headers: input.headers,
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
    dispatcher: dispatcher ?? undefined,
  } satisfies RequestInit;
}

function proxyDispatcher(proxyUrl: string | null | undefined) {
  const url = proxyUrl?.trim();
  return url ? new ProxyAgent({ uri: url, proxyTunnel: false }) : null;
}
