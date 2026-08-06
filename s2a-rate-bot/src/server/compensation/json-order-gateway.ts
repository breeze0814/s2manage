import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseLiandongOrderPage } from "./liandong-orders.ts";
import type { LiandongOrder } from "./types.ts";

const DEFAULT_ORDER_FILE = resolve(process.cwd(), "data", "ld.json");

export type JsonOrderCatalog = Readonly<{
  sourceName: string;
  orderCount: number;
  findOrder: (tradeNo: string) => LiandongOrder | null;
}>;

export type JsonOrderGateway = Readonly<{
  load: () => Promise<JsonOrderCatalog>;
}>;

export function createJsonOrderGateway(input: Readonly<{
  path: string;
  sourceName: string;
  read: (path: string) => Promise<string>;
}>): JsonOrderGateway {
  return { load: () => loadCatalog(input) };
}

export function createRuntimeJsonOrderGateway(): JsonOrderGateway {
  return createJsonOrderGateway({
    path: DEFAULT_ORDER_FILE,
    sourceName: "data/ld.json",
    read: (path) => readFile(path, "utf8"),
  });
}

async function loadCatalog(input: Parameters<typeof createJsonOrderGateway>[0]): Promise<JsonOrderCatalog> {
  const payload = await readPayload(input);
  let page;
  try {
    page = parseLiandongOrderPage(payload);
  } catch (error) {
    throw new Error(`JSON 订单文件结构无效：${errorMessage(error)}`);
  }
  return Object.freeze({
    sourceName: input.sourceName,
    orderCount: page.list.length,
    findOrder: (tradeNo: string) => page.list.find((order) => order.tradeNo === tradeNo.trim()) ?? null,
  });
}

async function readPayload(input: Parameters<typeof createJsonOrderGateway>[0]) {
  let text: string;
  try {
    text = await input.read(input.path);
  } catch (error) {
    throw new Error(`读取 JSON 订单文件失败（${input.sourceName}）：${errorMessage(error)}`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`JSON 订单文件无效（${input.sourceName}）：${errorMessage(error)}`);
  }
}

function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error); }
