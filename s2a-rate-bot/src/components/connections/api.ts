export async function apiRequest<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const text = await response.text();
  const body = text ? JSON.parse(text) as T & { error?: string } : {} as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `请求失败 HTTP ${response.status}`);
  return body;
}

export function jsonRequest(method: "POST" | "PUT" | "DELETE", body: unknown): RequestInit {
  return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
