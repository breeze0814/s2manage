import { spawn } from "node:child_process";

const commands = [
  ["api", "npm", ["run", "dev:api"]],
  ["worker", "npm", ["run", "dev:worker"]],
  ["bot", "npm", ["run", "dev:bot"]],
];

const children = new Map();
let stopping = false;

for (const [name, command, args] of commands) {
  const child = spawn(command, args, {
    env: {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV ?? "development",
    },
    stdio: "inherit",
  });
  children.set(name, child);
  child.on("exit", (code, signal) => {
    children.delete(name);
    if (stopping) return;
    const reason = signal ? `signal ${signal}` : `code ${code ?? 0}`;
    console.error(`[dev] ${name} exited with ${reason}`);
    stopAll(code && code > 0 ? code : 1);
  });
}

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));

function stopAll(exitCode) {
  if (stopping) return;
  stopping = true;
  for (const child of children.values()) child.kill("SIGTERM");
  const deadline = setTimeout(() => process.exit(exitCode), 2_000);
  deadline.unref();
  if (children.size === 0) process.exit(exitCode);
}
