import { assertPostgresSchema } from "../../storage/postgres-schema.ts";
import { createPostgresPool } from "./postgres.ts";
import { createRuntimeRedis } from "./redis.ts";
import { infrastructureEnvironment } from "./runtime-env.ts";

export type RuntimeInfrastructure = ReturnType<typeof buildRuntimeInfrastructure>;
const globalInfrastructure = globalThis as typeof globalThis & {
  s2aInfrastructure?: RuntimeInfrastructure;
};

export function getRuntimeInfrastructure(env: NodeJS.ProcessEnv = process.env) {
  if (env === process.env && globalInfrastructure.s2aInfrastructure) {
    return globalInfrastructure.s2aInfrastructure;
  }
  const infrastructure = buildRuntimeInfrastructure(env);
  if (env === process.env) globalInfrastructure.s2aInfrastructure = infrastructure;
  return infrastructure;
}

function buildRuntimeInfrastructure(env: NodeJS.ProcessEnv) {
  const values = infrastructureEnvironment(env);
  const pool = createPostgresPool(values.postgresUrl);
  const postgresReady = assertPostgresSchema(pool);
  const redis = createRuntimeRedis(values.redisUrl);
  return {
    postgres: { pool, ready: postgresReady },
    redis,
    status: async () => {
      await postgresReady;
      await pool.query("SELECT 1");
      await redis.ready;
      const redisReply = await redis.client.ping();
      if (redisReply !== "PONG") throw new Error(`Redis health check returned ${redisReply}`);
      return { postgres: "ready" as const, redis: "ready" as const };
    },
    close: async () => { await Promise.all([pool.end(), redis.close()]); },
  };
}
