import { readRuntimeConfig } from "../shared/config.ts";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export async function runBot() {
  const config = readRuntimeConfig();
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required before the QQBot listener can run");
  }
  throw new Error("QQBot NapCat listener orchestration is not wired yet");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runBot().catch((error) => {
    console.error(`[bot] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
