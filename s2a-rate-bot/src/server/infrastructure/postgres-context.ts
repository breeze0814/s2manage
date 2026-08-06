import type { Pool, PoolClient, QueryResultRow } from "pg";

export type PostgresContext = Readonly<{ pool: Pool; ready: Promise<void> }>;
export type PostgresExecutor = Pick<Pool | PoolClient, "query">;
export type Awaitable<T> = T | Promise<T>;

export async function rows<T extends QueryResultRow>(
  context: PostgresContext,
  sql: string,
  values: readonly unknown[] = [],
) {
  await context.ready;
  return (await context.pool.query<T>(sql, [...values])).rows;
}

export async function row<T extends QueryResultRow>(
  context: PostgresContext,
  sql: string,
  values: readonly unknown[] = [],
) {
  return (await rows<T>(context, sql, values))[0] ?? null;
}

export async function execute(
  context: PostgresContext,
  sql: string,
  values: readonly unknown[] = [],
) {
  await context.ready;
  return context.pool.query(sql, [...values]);
}

export async function postgresTransaction<T>(
  context: PostgresContext,
  task: (client: PoolClient) => Promise<T>,
) {
  await context.ready;
  const client = await context.pool.connect();
  try {
    await client.query("BEGIN");
    const result = await task(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
