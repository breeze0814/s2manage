import { fetch, ProxyAgent, type Headers, type RequestInit } from "undici";
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

export type HttpClientRequest = Omit<JsonRequest, "proxyUrl">;
export type JsonClientRequest = HttpClientRequest;
export type TextHttpResponse = { readonly status: number; readonly text: string; readonly headers: Record<string, string> };
export type JsonHttpResponse<T = unknown> = { readonly status: number; readonly data: T; readonly headers: Record<string, string> };
export type JsonHttpClient = {
  readonly request: <T = unknown>(input: JsonClientRequest) => Promise<T>;
};
export type JsonResponseHttpClient = JsonHttpClient & {
  readonly requestResponse: <T = unknown>(input: JsonClientRequest) => Promise<JsonHttpResponse<T>>;
};
export type TextHttpClient = { readonly requestText: (input: HttpClientRequest) => Promise<TextHttpResponse> };
export type HttpClient = JsonResponseHttpClient & TextHttpClient;

export function createJsonHttpClient(options: {
  readonly timeoutMs: number;
  readonly proxyUrl: string | null;
}): HttpClient {
  return {
    request: (input) => requestJson({ ...options, ...input }),
    requestResponse: (input) => requestJsonResponse({ ...options, ...input }),
    requestText: (input) => requestTextResponse({ ...options, ...input }),
  };
}

const DEFAULT_TIMEOUT_MS = 25_000;

export async function requestJson<T = unknown>(input: JsonRequest): Promise<T> {
  return (await requestJsonResponse<T>(input)).data;
}

export async function requestJsonResponse<T = unknown>(input: JsonRequest): Promise<JsonHttpResponse<T>> {
  return requestResponse(input, (result) => {
    if (!result.ok) throw new HttpResponseError(result.status, result.text);
    return { data: (result.text.trim() ? JSON.parse(result.text) : {}) as T, headers: result.headers, status: result.status };
  });
}

export async function requestTextResponse(input: JsonRequest): Promise<TextHttpResponse> {
  return requestResponse(input, (result) => {
    if (!result.ok) throw new HttpResponseError(result.status, result.text);
    return { text: result.text, headers: result.headers, status: result.status };
  });
}

async function requestResponse<T>(input: JsonRequest, parse: (result: FetchTextResponse) => T): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await fetchText(input);
    const response = parse(result);
    await logExternalRequest({ input, startedAt, status: result.status });
    return response;
  } catch (error) {
    await logExternalRequest({ input, startedAt, status: error instanceof HttpResponseError ? error.status : null, error });
    throw error;
  }
}

export class HttpResponseError extends Error {
  constructor(readonly status: number, text: string) { super(`HTTP ${status}: ${text.slice(0, 300)}`); }
}

async function logExternalRequest(entry: Readonly<{
  input: JsonRequest;
  startedAt: number;
  status: number | null;
  error?: unknown;
}>) {
  await writeExternalApiLog({
    timestamp: new Date().toISOString(), method: entry.input.method, url: safeRequestUrl(entry.input.url), status: entry.status,
    durationMs: Date.now() - entry.startedAt, outcome: entry.error ? "failed" : "success",
    ...(entry.error ? { error: entry.error instanceof Error ? entry.error.message.slice(0, 500) : String(entry.error).slice(0, 500) } : {}),
  });
}

export function safeRequestUrl(value: string) {
  const url = new URL(value);
  const pathname = url.hostname === "api.telegram.org"
    ? url.pathname.replace(/^\/bot[^/]+/, "/bot[redacted]")
    : url.pathname;
  return `${url.origin}${pathname}`;
}

type FetchTextResponse = { readonly ok: boolean; readonly status: number; readonly text: string; readonly headers: Record<string, string> };

async function fetchText(input: JsonRequest): Promise<FetchTextResponse> {
  const controller = new AbortController();
  const dispatcher = proxyDispatcher(input.proxyUrl);
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(input.url, fetchOptions(input, controller, dispatcher));
    return {
      ok: response.ok,
      status: response.status,
      text: await response.text(),
      headers: responseHeaders(response.headers),
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

function responseHeaders(headers: Headers) {
  const values = Object.fromEntries(headers.entries());
  const cookies = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];
  if (cookies.length) values["set-cookie"] = cookies.join("\n");
  return values;
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
