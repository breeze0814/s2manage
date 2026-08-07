import type { NextRequest } from "next/server";
import { exchangeEmbedSession } from "../../../../../server/embeds/session-route-support.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return exchangeEmbedSession(request, "tickets");
}
