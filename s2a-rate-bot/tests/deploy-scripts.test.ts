import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts?: Record<string, string>;
};
const ecosystem = require("../ecosystem.config.cjs") as {
  apps?: Array<{
    name?: string;
    script?: string;
    args?: string;
    env?: Record<string, unknown>;
  }>;
};

assert.equal(
  packageJson.scripts?.dev,
  "node scripts/dev.mjs",
  "dev script should start all local s2a-rate-bot processes",
);

assert.equal(packageJson.scripts?.["dev:api"], "tsx src/api/server.ts");
assert.equal(packageJson.scripts?.["dev:worker"], "tsx src/worker/main.ts");
assert.equal(packageJson.scripts?.["dev:bot"], "tsx src/bot/main.ts");
assert.equal(packageJson.scripts?.["pm2:start"], "mkdir -p logs && pm2 start ecosystem.config.cjs");
assert.equal(packageJson.scripts?.["pm2:restart"], "mkdir -p logs && pm2 restart ecosystem.config.cjs --update-env");
assert.equal(packageJson.scripts?.["pm2:stop"], "pm2 stop ecosystem.config.cjs");
assert.equal(packageJson.scripts?.["pm2:delete"], "pm2 delete ecosystem.config.cjs");
assert.equal(packageJson.scripts?.["pm2:logs"], "pm2 logs s2a-rate-bot-api s2a-rate-bot-worker s2a-rate-bot-bot");

const apps = ecosystem.apps ?? [];
assert.deepEqual(
  apps.map((app) => app.name),
  ["s2a-rate-bot-api", "s2a-rate-bot-worker", "s2a-rate-bot-bot"],
  "PM2 should manage api, worker, and bot processes",
);

assert.deepEqual(
  apps.map((app) => [app.script, app.args]),
  [
    ["npm", "run api"],
    ["npm", "run worker"],
    ["npm", "run bot"],
  ],
);

assert.equal(apps[0]?.env?.PORT, 18074);
assert.equal(apps[0]?.env?.HOST, "127.0.0.1");
assert.equal(apps[1]?.env?.NODE_ENV, "production");
assert.equal(apps[2]?.env?.NODE_ENV, "production");
