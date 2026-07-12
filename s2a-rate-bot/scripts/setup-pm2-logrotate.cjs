const { execFileSync } = require("node:child_process");
const { resolve } = require("node:path");

const pm2 = resolve(__dirname, process.platform === "win32" ? "../node_modules/.bin/pm2.cmd" : "../node_modules/.bin/pm2");

run(["install", "pm2-logrotate"]);
run(["set", "pm2-logrotate:max_size", "2M"]);
run(["set", "pm2-logrotate:retain", "5"]);
run(["set", "pm2-logrotate:compress", "true"]);
run(["set", "pm2-logrotate:dateFormat", "YYYY-MM-DD_HH-mm-ss"]);
run(["set", "pm2-logrotate:workerInterval", "30"]);
run(["set", "pm2-logrotate:rotateInterval", "0 0 * * *"]);

function run(args) {
  execFileSync(pm2, args, { stdio: "inherit" });
}
