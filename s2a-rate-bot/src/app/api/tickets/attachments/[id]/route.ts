import type { NextRequest } from "next/server";
import { requireAuthenticatedRequest } from "../../../../../server/auth/route-support.ts";
import { embedErrorResponse } from "../../../../../server/embeds/route-support.ts";
import { getRuntimeEmbedServices } from "../../../../../server/embeds/runtime.ts";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: Context) {
  try {
    await requireAuthenticatedRequest(request);
    const file = await getRuntimeEmbedServices().tickets.attachmentAdmin(params.id);
    return new Response(Buffer.from(file.data), {
      headers: { "content-type": file.contentType, "content-length": String(file.sizeBytes), "cache-control": "private, no-store" },
    });
  } catch (error) { return embedErrorResponse(error); }
}

type Context = Readonly<{ params: Readonly<{ id: string }> }>;
