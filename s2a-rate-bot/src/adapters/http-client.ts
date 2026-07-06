import { fetch, ProxyAgent, type RequestInit } from "undici";

type JsonBody = Record<string, unknown>;

export type JsonRequest = {
  readonly url: string;
  readonly method: "GET" | "POST";
  readonly headers: Record<string, string>;
  readonly body?: JsonBody;
  readonly timeoutMs?: number;
  readonly proxyUrl?: string | null;
};

const DEFAULT_TIMEOUT_MS = 25_000;

export async function requestJson(input: JsonRequest) {
  const result = await fetchText(input);
  if (!result.ok) throw new Error(`HTTP ${result.status}: ${result.text.slice(0, 300)}`);
  return result.text.trim() ? JSON.parse(result.text) as unknown : {};
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
