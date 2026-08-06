import type { NextRequest } from "next/server";
import { embedErrorResponse, requireEmbedIdentity } from "../../../../../../server/embeds/route-support.ts";
import { getRuntimeEmbedServices } from "../../../../../../server/embeds/runtime.ts";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: Context) {
  try {
    const runtime = getRuntimeEmbedServices();
    const identity = await requireEmbedIdentity(request, "tickets", runtime.sessions);
    const file = await runtime.tickets.attachmentUser(params.id, identity);
    return new Response(Buffer.from(file.data), {
      headers: { "content-type": file.contentType, "content-length": String(file.sizeBytes), "cache-control": "private, no-store" },
    });
  } catch (error) { return embedErrorResponse(error); }
}

type Context = Readonly<{ params: Readonly<{ id: string }> }>;
