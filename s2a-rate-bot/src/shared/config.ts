export type RuntimeConfig = {
  readonly port: number;
  readonly host: string;
  readonly databaseUrl: string | null;
  readonly proxyUrl: string | null;
};

const DEFAULT_API_PORT = 18074;
const DEFAULT_DATABASE_URL = "file:./data/s2a-rate-bot.db";

function parsePort(value: string | undefined) {
  if (!value) return DEFAULT_API_PORT;
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`Invalid PORT: ${value}`);
  }
  return port;
}

export function readRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  return {
    port: parsePort(env.PORT ?? env.S2A_RATE_BOT_PORT),
    host: env.HOST ?? "127.0.0.1",
    databaseUrl: env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
    proxyUrl: proxyUrl(env),
  };
}

function proxyUrl(env: NodeJS.ProcessEnv) {
  return env.S2A_RATE_BOT_HTTPS_PROXY
    ?? env.S2A_RATE_BOT_HTTP_PROXY
    ?? env.HTTPS_PROXY
    ?? env.HTTP_PROXY
    ?? env.https_proxy
    ?? env.http_proxy
    ?? null;
}
