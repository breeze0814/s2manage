import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts?: Record<string, string>;
};
const pm2Config = require("../ecosystem.config.js") as {
  apps?: Array<{
    name?: string;
    env?: Record<string, unknown>;
  }>;
};

const defaultPort = "15074";
const webApp = pm2Config.apps?.find((app) => app.name === "s2a-manager-web");

assert.match(packageJson.scripts?.dev ?? "", new RegExp(defaultPort), "npm run dev should default to port 15074");
assert.match(packageJson.scripts?.start ?? "", new RegExp(defaultPort), "npm run start should default to port 15074");
assert.equal(webApp?.env?.PORT, 15074, "PM2 web process should listen on port 15074");
