const { spawn } = require("node:child_process");
const { resolve } = require("node:path");

const mode = process.argv[2];
const port = process.env.PORT || "18074";

if (mode !== "dev" && mode !== "start") {
  throw new Error("Next.js 启动模式必须是 dev 或 start");
}
if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
  throw new Error(`PORT 必须是 1-65535 的整数，当前值: ${port}`);
}

const nextBin = resolve(__dirname, "../node_modules/next/dist/bin/next");
const child = spawn(process.execPath, [nextBin, mode, "-p", port], { stdio: "inherit", env: process.env });

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
