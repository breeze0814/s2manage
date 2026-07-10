import {
  authenticatedResponse,
  authErrorResponse,
  credentialsFromRequest,
  runtimeAuth,
} from "../../../../server/auth/route-support.ts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const token = await runtimeAuth().setup(await credentialsFromRequest(request));
    return authenticatedResponse(token);
  } catch (error) {
    return authErrorResponse(error, error instanceof Error && error.message.includes("已初始化") ? 409 : 400);
  }
}
