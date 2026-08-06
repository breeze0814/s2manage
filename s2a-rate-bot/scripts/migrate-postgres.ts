import { createPostgresPool } from "../src/server/infrastructure/postgres.ts";
import { postgresConnectionUrl } from "../src/server/infrastructure/runtime-env.ts";
import {
  migratePostgresSchema,
  POSTGRES_APPLICATION_SCHEMA_VERSION,
} from "../src/storage/postgres-schema.ts";
import { POSTGRES_LOTTERY_SCHEMA_VERSION } from "../src/storage/postgres-lottery-schema.ts";

const pool = createPostgresPool(postgresConnectionUrl(process.env));

try {
  await migratePostgresSchema(pool);
  console.log(
    `PostgreSQL migrations completed: application=${POSTGRES_APPLICATION_SCHEMA_VERSION}, `
      + `lottery=${POSTGRES_LOTTERY_SCHEMA_VERSION}`,
  );
} finally {
  await pool.end();
}
