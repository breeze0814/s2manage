import type { Pool } from "pg";

type SchemaRequirement = Readonly<{
  name: string;
  expectedVersion: number;
}>;

export async function assertPostgresSchemaVersion(pool: Pool, requirement: SchemaRequirement) {
  const table = await pool.query<{ name: string | null }>(
    "SELECT to_regclass('app_schema_migrations') AS name",
  );
  if (!table.rows[0]?.name) throw new Error("PostgreSQL schema is not initialized; run npm run db:migrate");
  const result = await pool.query<{ version: number }>(
    "SELECT version FROM app_schema_migrations WHERE name=$1", [requirement.name],
  );
  const version = result.rows[0]?.version;
  if (version === undefined) throw new Error(migrationError(requirement.name, "not initialized"));
  if (version > requirement.expectedVersion) {
    throw new Error(`PostgreSQL ${requirement.name} schema is newer than this application`);
  }
  if (version < requirement.expectedVersion) throw new Error(migrationError(requirement.name, "outdated"));
}

function migrationError(name: string, state: string) {
  return `PostgreSQL ${name} schema is ${state}; run npm run db:migrate`;
}
