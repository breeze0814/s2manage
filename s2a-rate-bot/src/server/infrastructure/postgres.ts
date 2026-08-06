import { Pool } from "pg";

const DEFAULT_POOL_SIZE = 10;

export function createPostgresPool(connectionString: string, options: Readonly<{
  connectionTimeoutMillis?: number;
}> = {}) {
  return new Pool({
    connectionString,
    max: DEFAULT_POOL_SIZE,
    application_name: "s2a-rate-bot",
    connectionTimeoutMillis: options.connectionTimeoutMillis,
  });
}
