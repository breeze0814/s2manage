import assert from "node:assert/strict";
import { test } from "node:test";
import type { Pool } from "pg";
import { createPostgresCollectionStore } from "../src/server/collection/postgres-store.ts";

test("PostgreSQL collection create binds all 18 insert values", async () => {
  let capturedSql = "";
  let capturedValues: readonly unknown[] = [];
  const query = async (sql: string, values: readonly unknown[] = []) => {
    capturedSql = sql;
    capturedValues = values;
    return { rows: [{ id: 1 }], rowCount: 1 };
  };
  const store = createPostgresCollectionStore({
    pool: { query } as unknown as Pool,
    ready: Promise.resolve(),
  });

  await store.create({
    name: "Source", remark: "Main", siteType: "sub2api",
    baseUrl: "https://source.example.com", websiteUrl: "", authMode: "password",
    username: "user@example.com", newApiUserId: "", passwordEnc: "password",
    accessTokenEnc: "access-token", refreshTokenEnc: "refresh-token", rechargeRatio: 1,
    balanceAlertThreshold: null, intervalSeconds: 600, useProxy: false, enabled: true,
  });

  assert.match(capturedSql,
    /\(\$1,\$2,\$3,\$4,\$5,\$6,\$7,\$8,\$9,\$10,\$11,\$12,\$13,\$14,\$15,\$16,\$17,\$18\)/);
  assert.equal(capturedValues.length, 18);
  assert.equal(capturedValues[16], capturedValues[17]);
});
