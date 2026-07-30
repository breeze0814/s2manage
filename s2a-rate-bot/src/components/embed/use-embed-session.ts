"use client";

import { useEffect, useState } from "react";
import type { EmbedKind } from "../../server/embeds/types";

export type EmbedSessionState = {
  readonly token: string;
  readonly settings?: Record<string, unknown>;
};

export function useEmbedSession(kind: EmbedKind) {
  const [session, setSession] = useState<EmbedSessionState | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const initialize = async () => {
      try {
        const request = sessionRequest(new URL(window.location.href));
        applyEmbedTheme(request.theme);
        const response = await exchange(kind, request);
        clearSensitiveQuery();
        if (active) setSession({ token: response.sessionToken, settings: response.settings });
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      } finally { if (active) setLoading(false); }
    };
    void initialize();
    return () => { active = false; };
  }, [kind]);
  return { session, error, loading };
}

export async function embedRequestJson<T>(path: string, token: string, options: RequestInit = {}) {
  const isForm = options.body instanceof FormData;
  const response = await fetch(path, {
    ...options, cache: "no-store",
    headers: { accept: "application/json", authorization: `Bearer ${token}`, ...(isForm ? {} : { "content-type": "application/json" }), ...options.headers },
  });
  const text = await response.text();
  let body: unknown = {};
  if (text) { try { body = JSON.parse(text); } catch { throw new Error(`服务返回无效响应（HTTP ${response.status}）`); } }
  if (!response.ok) throw new Error(errorMessage(body, response.status));
  return body as T;
}

async function exchange(kind: EmbedKind, request: ReturnType<typeof sessionRequest>) {
  const response = await fetch(`/api/embed/${kind}/session`, {
    method: "POST", headers: { "content-type": "application/json" }, cache: "no-store",
    body: JSON.stringify(request),
  });
  const body = await response.json() as { sessionToken?: string; settings?: Record<string, unknown>; error?: string };
  if (!response.ok || !body.sessionToken) throw new Error(body.error || "嵌入会话初始化失败");
  return { sessionToken: body.sessionToken, settings: body.settings };
}

function sessionRequest(url: URL) {
  const query = url.searchParams;
  const request = {
    embedToken: requiredQuery(query, "embed_token"),
    sub2apiToken: requiredQuery(query, "token"),
    userId: query.get("user_id") || undefined,
    srcHost: requiredQuery(query, "src_host"),
    srcUrl: query.get("src_url") || undefined,
    theme: query.get("theme") || undefined,
  };
  return request;
}

function requiredQuery(query: URLSearchParams, name: string) {
  const value = query.get(name)?.trim();
  if (!value) throw new Error(`缺少嵌入参数：${name}`);
  return value;
}

function clearSensitiveQuery() {
  const url = new URL(window.location.href);
  url.searchParams.delete("token");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function applyEmbedTheme(theme?: string) {
  if (theme !== "light" && theme !== "dark") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

function errorMessage(body: unknown, status: number) {
  return body && typeof body === "object" && "error" in body ? String(body.error) : `请求失败（HTTP ${status}）`;
}
