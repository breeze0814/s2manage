import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const ROOT = new URL("../", import.meta.url);

function source(path: string) {
  const file = new URL(path, ROOT);
  assert.equal(existsSync(file), true, `${path} should exist`);
  return readFileSync(file, "utf8");
}

test("PM2 deploys the web and Worker as separate managed processes", () => {
  const ecosystem = source("ecosystem.config.cjs");
  const pkg = source("package.json");

  assert.match(ecosystem, /s2a-rate-web/);
  assert.match(ecosystem, /s2a-rate-worker/);
  assert.match(ecosystem, /run start:pm2/);
  assert.match(ecosystem, /run worker/);
  assert.match(ecosystem, /autorestart: true/);
  assert.match(pkg, /pm2:start/);
  assert.match(pkg, /"pm2":/);
  assert.match(pkg, /node --env-file=\.env scripts\/start-next\.cjs start/);
});

test("deployment script provisions infrastructure and reloads PM2 services", () => {
  const deploy = source("deploy.sh");
  assert.match(deploy, /set -Eeuo pipefail/);
  assert.match(deploy, /git pull --ff-only/);
  assert.match(deploy, /npm ci/);
  assert.match(deploy, /docker compose .* up -d --wait/);
  assert.match(deploy, /npm run db:migrate/);
  assert.match(deploy, /npm run check:infrastructure/);
  assert.match(deploy, /npm run build/);
  assert.ok(deploy.indexOf("npm run db:migrate") < deploy.indexOf("npm run check:infrastructure"));
  assert.ok(deploy.indexOf("npm run check:infrastructure") < deploy.indexOf("npm run build"));
  assert.match(deploy, /deployment_mode="pm2"/);
  assert.match(deploy, /startOrReload .*--update-env/);
  assert.match(deploy, /--pm2/);
  assert.match(deploy, /--docker/);
  assert.match(deploy, /deployment_mode.*docker/);
  assert.match(deploy, /--migrate-sqlite/);
  assert.match(deploy, /npm run migrate:postgres/);
  assert.match(deploy, /PM2_BIN.* save/);
});

test("Next.js port can be overridden through the PORT environment variable", () => {
  const starter = source("scripts/start-next.cjs");
  assert.match(starter, /process\.env\.PORT \|\| "18074"/);
  assert.match(starter, /Number\(port\) < 1/);
  assert.match(starter, /Number\(port\) > 65535/);
});

test("PM2 and business logs rotate at approximately two megabytes", () => {
  const setup = source("scripts/setup-pm2-logrotate.cjs");
  const logger = source("src/server/logging/business-logger.ts");

  assert.match(setup, /pm2-logrotate:max_size", "2M/);
  assert.match(setup, /node_modules\/\.bin\/pm2/);
  assert.match(setup, /pm2-logrotate:retain", "5/);
  assert.match(setup, /pm2-logrotate:compress", "true/);
  assert.match(logger, /MAX_LOG_BYTES = 2 \* 1024 \* 1024/);
  assert.match(logger, /ROTATED_LOG_COUNT = 5/);
  assert.match(logger, /rotateIfRequired/);
});
