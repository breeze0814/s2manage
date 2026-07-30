import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "../../../../../../server/auth/route-support.ts";
import { embedErrorResponse } from "../../../../../../server/embeds/route-support.ts";
import { getRuntimeEmbedServices } from "../../../../../../server/embeds/runtime.ts";
import { readJsonBody } from "../../../../../../server/http/request-body.ts";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: Context) {
  try {
    await requireAuthenticatedRequest(request);
    const body = await readJsonBody(request) as { action?: unknown };
    const service = getRuntimeEmbedServices().lottery;
    if (body.action === "draw") return NextResponse.json(await service.draw(params.id));
    if (body.action === "cancel") return NextResponse.json(service.cancel(params.id));
    throw new Error("不支持的抽奖活动操作");
  } catch (error) { return embedErrorResponse(error); }
}

type Context = Readonly<{ params: Readonly<{ id: string }> }>;
