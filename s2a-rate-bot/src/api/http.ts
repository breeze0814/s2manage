import type { IncomingMessage, ServerResponse } from "node:http";

export function sendJson(response: ServerResponse, statusCode: number, body: unknown) {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

export async function readJsonBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return null;
  return JSON.parse(raw) as unknown;
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function sendError(response: ServerResponse, statusCode: number, error: unknown) {
  sendJson(response, statusCode, { error: errorMessage(error) });
}

export class BadRequestError extends Error {}
