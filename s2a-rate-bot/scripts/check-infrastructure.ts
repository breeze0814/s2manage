import { createClient } from "redis";
import { createPostgresPool } from "../src/server/infrastructure/postgres.ts";
import { infrastructureEnvironment } from "../src/server/infrastructure/runtime-env.ts";
import { assertPostgresSchema } from "../src/storage/postgres-schema.ts";

const CONNECTION_TIMEOUT_MS = 10_000;

if (!process.env.APP_SECRET?.trim()) throw new Error("APP_SECRET is required");

const environment = infrastructureEnvironment(process.env);
const postgres = createPostgresPool(environment.postgresUrl, {
  connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
});
const redis = createClient({
  url: environment.redisUrl,
  socket: { connectTimeout: CONNECTION_TIMEOUT_MS, reconnectStrategy: false },
});
redis.on("error", (error) => console.error("[redis-check]", error.message));

try {
  await assertPostgresSchema(postgres);
  await postgres.query("SELECT 1");
  await redis.connect();
  const reply = await redis.ping();
  if (reply !== "PONG") throw new Error(`Redis health check returned ${reply}`);
  console.log("Infrastructure ready: PostgreSQL=ready, Redis=ready");
} finally {
  if (redis.isOpen) redis.destroy();
  await postgres.end();
}
