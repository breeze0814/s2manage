import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts?: Record<string, string>;
};
const deploymentGuide = readFileSync("部署指南.md", "utf8");

assert.equal(
  packageJson.scripts?.["pm2:start"],
  "npm run build && pm2 start ecosystem.config.js",
  "PM2 start helper should build before starting the production server",
);

assert.equal(
  packageJson.scripts?.["pm2:restart"],
  "npm run build && pm2 restart ecosystem.config.js --update-env",
  "PM2 restart helper should build before restarting the production server",
);

assert.match(
  deploymentGuide,
  /npm run pm2:start/,
  "PM2 deployment guide should use the build-before-start helper",
);

assert.match(
  deploymentGuide,
  /npm run pm2:restart/,
  "PM2 deployment guide should use the build-before-restart helper",
);
