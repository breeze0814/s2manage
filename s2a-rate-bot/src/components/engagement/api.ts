export async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", ...options.headers },
    cache: "no-store",
  });
  const text = await response.text();
  let body: unknown = {};
  if (text) {
    try { body = JSON.parse(text); } catch { throw new Error(`服务器返回了无效 JSON（HTTP ${response.status}）`); }
  }
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body ? String(body.error) : `请求失败（HTTP ${response.status}）`;
    throw new Error(message);
  }
  return body as T;
}
