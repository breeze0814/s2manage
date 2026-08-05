import type { JsonTransport } from "./http.ts";
import { loginLiandong } from "./liandong-auth.ts";
import { findLiandongOrder } from "./liandong-orders.ts";
import type { CompensationSettings, LiandongOrder, LiandongSession } from "./types.ts";

export type LiandongGateway = Readonly<{
  login: (settings: CompensationSettings) => Promise<LiandongSession>;
  findOrder: (
    settings: CompensationSettings,
    session: LiandongSession,
    tradeNo: string,
  ) => Promise<LiandongOrder | null>;
}>;

export function createLiandongGateway(transport: JsonTransport): LiandongGateway {
  return {
    login: (settings) => loginLiandong({
      baseUrl: settings.baseUrl,
      credentials: { username: settings.username, password: settings.password },
      transport,
    }),
    findOrder: (settings, session, tradeNo) => findLiandongOrder({
      baseUrl: settings.baseUrl,
      merchantToken: session.merchantToken,
      tradeNo,
      transport,
    }),
  };
}
