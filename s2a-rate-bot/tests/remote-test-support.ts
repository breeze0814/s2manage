import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

export type RouteHandler = (request: IncomingMessage, response: ServerResponse) => void;

export function json(response: ServerResponse, payload: unknown, statusCode = 200) {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

export async function readJson(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) as unknown : null;
}

export async function withServer<T>(handler: RouteHandler, task: (baseUrl: string) => Promise<T>) {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (typeof address !== "object" || address === null) throw new Error("test server did not bind to a TCP port");
  try {
    return await task(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}
