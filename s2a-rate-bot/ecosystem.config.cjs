const path = require("node:path");

const ROOT = __dirname;
const LOG_DIRECTORY = path.join(ROOT, "logs");
const NPM_COMMAND = process.platform === "win32" ? "npm.cmd" : "npm";

module.exports = {
  apps: [
    {
      name: "s2a-rate-web",
      cwd: ROOT,
      script: NPM_COMMAND,
      args: "run start:pm2",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_memory_restart: "512M",
      out_file: path.join(LOG_DIRECTORY, "pm2-web-out.log"),
      error_file: path.join(LOG_DIRECTORY, "pm2-web-error.log"),
      merge_logs: true,
      time: true,
      env: { NODE_ENV: "production" },
    },
    {
      name: "s2a-rate-worker",
      cwd: ROOT,
      script: NPM_COMMAND,
      args: "run worker",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_memory_restart: "384M",
      out_file: path.join(LOG_DIRECTORY, "pm2-worker-out.log"),
      error_file: path.join(LOG_DIRECTORY, "pm2-worker-error.log"),
      merge_logs: true,
      time: true,
      env: { NODE_ENV: "production" },
    },
  ],
};
