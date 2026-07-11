import { fetch, ProxyAgent, type RequestInit } from "undici";
import { writeExternalApiLog } from "../server/logging/business-logger.ts";

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
  const startedAt = Date.now();
  try {
    const result = await fetchText(input);
    if (!result.ok) throw new HttpResponseError(result.status, result.text);
    await logExternalRequest(input, startedAt, result.status);
    return (result.text.trim() ? JSON.parse(result.text) : {}) as T;
  } catch (error) {
    await logExternalRequest(input, startedAt, error instanceof HttpResponseError ? error.status : null, error);
    throw error;
  }
}

class HttpResponseError extends Error {
  constructor(readonly status: number, text: string) { super(`HTTP ${status}: ${text.slice(0, 300)}`); }
}

async function logExternalRequest(input: JsonRequest, startedAt: number, status: number | null, error?: unknown) {
  await writeExternalApiLog({
    timestamp: new Date().toISOString(), method: input.method, url: safeRequestUrl(input.url), status,
    durationMs: Date.now() - startedAt, outcome: error ? "failed" : "success",
    ...(error ? { error: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500) } : {}),
  });
}

function safeRequestUrl(value: string) { const url = new URL(value); return `${url.origin}${url.pathname}`; }

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
