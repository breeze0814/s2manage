import { createJsonHttpClient, type TextHttpClient } from "../../adapters/http-client.ts";
import type { SettingsService } from "../settings/service.ts";

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
    return parseJson(text, {
      status: response.status,
      contentType: response.headers.get("content-type"),
    });
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`联动小铺请求超时（${timeoutMs}ms）`, { cause: error });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function createRuntimeLiandongTransport(
  settings: SettingsService,
  httpFactory: RuntimeHttpFactory = createJsonHttpClient,
): JsonTransport {
  return { request: async (input) => {
    const snapshot = await settings.get();
    const http = httpFactory({
      timeoutMs: snapshot.worker.timeoutSeconds * 1_000,
      proxyUrl: snapshot.proxy.enabled ? snapshot.proxy.proxyUrl : null,
    });
    const response = await http.requestText({
      url: input.url,
      method: "POST",
      headers: { ...input.headers },
      body: { ...input.body },
    });
    return parseJson(response.text, {
      status: response.status,
      contentType: response.headers["content-type"] ?? null,
    });
  } };
}

function parseJson(text: string, response: Readonly<{ status: number; contentType: string | null }>): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    const contentType = response.contentType?.split(";", 1)[0]?.trim() || "未知";
    const summary = responseSummary(text);
    const kind = looksLikeHtml(text) ? "是 HTML 页面而不是 JSON，可能触发了地域限制或安全验证" : "不是有效 JSON";
    throw new Error(`联动小铺返回的内容${kind}（HTTP ${response.status}，Content-Type: ${contentType}${summary ? `，摘要: ${summary}` : ""}）`, { cause: error });
  }
}

function looksLikeHtml(text: string) {
  return /<(?:!doctype|html|head|body|title)\b/i.test(text);
}

function responseSummary(text: string) {
  const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(text)?.[1] ?? "";
  return title
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

type RuntimeHttpFactory = (options: Readonly<{
  timeoutMs: number;
  proxyUrl: string | null;
}>) => Pick<TextHttpClient, "requestText">;
