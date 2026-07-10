import { clearedSessionResponse } from "../../../../server/auth/route-support.ts";

export const runtime = "nodejs";

export function POST() {
  return clearedSessionResponse();
}
