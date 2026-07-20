export class RequestBodyError extends Error {}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch (error) {
    throw new RequestBodyError("请求体必须是有效 JSON", { cause: error });
  }
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const value = await readJsonBody(request);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestBodyError("请求体必须是 JSON 对象");
  }
  return value as Record<string, unknown>;
}
