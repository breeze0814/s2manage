import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "../../../../../server/auth/route-support.ts";
import { embedErrorResponse } from "../../../../../server/embeds/route-support.ts";
import { getRuntimeEmbedServices } from "../../../../../server/embeds/runtime.ts";
import { EMBED_KINDS, type EmbedKind } from "../../../../../server/embeds/types.ts";
import { readJsonBody } from "../../../../../server/http/request-body.ts";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: Context) {
  try {
    await requireAuthenticatedRequest(request);
    return NextResponse.json(await getRuntimeEmbedServices().configs.get(kind(context)));
  } catch (error) { return embedErrorResponse(error); }
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    await requireAuthenticatedRequest(request);
    if (kind(context) !== "tickets") throw new Error("该嵌入配置没有可编辑项");
    const config = await getRuntimeEmbedServices().configs.updateTickets(await readJsonBody(request));
    return NextResponse.json(config);
  } catch (error) { return embedErrorResponse(error); }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    await requireAuthenticatedRequest(request);
    const body = await readJsonBody(request) as { action?: unknown };
    if (body.action !== "rotate") throw new Error("不支持的配置操作");
    return NextResponse.json(await getRuntimeEmbedServices().configs.rotate(kind(context)));
  } catch (error) { return embedErrorResponse(error); }
}

function kind(context: Context): EmbedKind {
  const value = context.params.kind as EmbedKind;
  if (!EMBED_KINDS.includes(value)) throw new Error("嵌入类型无效");
  return value;
}

type Context = Readonly<{ params: Readonly<{ kind: string }> }>;
