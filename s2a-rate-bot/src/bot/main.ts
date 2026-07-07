import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runBot as runBotRuntime } from "./runtime.ts";

export async function runBot() {
  await runBotRuntime();
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runBot().catch((error) => {
    console.error(`[bot] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
