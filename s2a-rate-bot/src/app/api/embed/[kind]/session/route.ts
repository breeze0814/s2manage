import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ticketSettings } from "../../../../../server/embeds/config-service.ts";
import { embedErrorResponse } from "../../../../../server/embeds/route-support.ts";
import { getRuntimeEmbedServices } from "../../../../../server/embeds/runtime.ts";
import { EMBED_KINDS, type EmbedKind } from "../../../../../server/embeds/types.ts";
import { readJsonBody } from "../../../../../server/http/request-body.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: Context) {
  try {
    const kind = parseKind(context.params.kind);
    const result = await getRuntimeEmbedServices().identities.exchange(kind, await readJsonBody(request));
    const settings = await sessionSettings(kind, result.config);
    return NextResponse.json({ sessionToken: result.sessionToken, expiresIn: 1_800, settings }, {
      headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" },
    });
  } catch (error) { return embedErrorResponse(error); }
}

async function sessionSettings(kind: EmbedKind, config: Parameters<typeof ticketSettings>[0]) {
  if (kind === "tickets") return ticketSettings(config);
  if (kind === "compensation") return getRuntimeEmbedServices().compensationConfig.getPublic();
  return undefined;
}

function parseKind(value: string): EmbedKind {
  if (!EMBED_KINDS.includes(value as EmbedKind)) throw new Error("嵌入类型无效");
  return value as EmbedKind;
}

type Context = Readonly<{ params: Readonly<{ kind: string }> }>;
