import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { readJsonBody } from "../http/request-body.ts";
import { ticketSettings } from "./config-service.ts";
import { embedErrorResponse } from "./route-support.ts";
import { getRuntimeEmbedServices } from "./runtime.ts";
import { EMBED_KINDS, type EmbedKind } from "./types.ts";

export async function exchangeEmbedSession(request: NextRequest, value: string) {
  try {
    const kind = parseKind(value);
    const body = await readJsonBody(request);
    const runtime = getRuntimeEmbedServices();
    const result = await runtime.identities.exchange(kind, body);
    const settings = kind === "tickets"
      ? ticketSettings(result.config)
      : kind === "compensation" ? await runtime.compensationConfig.getPublic() : undefined;
    return NextResponse.json({ sessionToken: result.sessionToken, expiresIn: 1_800, settings }, {
      headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" },
    });
  } catch (error) {
    return embedErrorResponse(error);
  }
}

function parseKind(value: string): EmbedKind {
  if (!EMBED_KINDS.includes(value as EmbedKind)) throw new Error("嵌入类型无效");
  return value as EmbedKind;
}
