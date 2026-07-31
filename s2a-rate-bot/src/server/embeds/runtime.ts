import { getRuntimeSettingsService } from "../settings/runtime.ts";
import { createSqliteEmbedConfigStore } from "./config-store.ts";
import { basicSettings, createEmbedConfigService, type EmbedConfigService } from "./config-service.ts";
import { createEmbedIdentityService } from "./identity-service.ts";
import { createLeaderboardService } from "./leaderboard-service.ts";
import { createLotteryService } from "./lottery-service.ts";
import { createSqliteLotteryStore } from "./lottery-store.ts";
import { createRuntimeRewardCodeGateway } from "./reward-code-gateway.ts";
import { createEmbedSessionService, type EmbedSessionService } from "./session.ts";
import { createTicketService } from "./ticket-service.ts";
import { createSqliteTicketStore } from "./ticket-store.ts";
import { createEmbedUpstreamGateway } from "./upstream.ts";

const DEFAULT_DATABASE_URL = "file:./data/s2a-rate-bot.db";
const globalEmbeds = globalThis as typeof globalThis & { s2aEmbedRuntime?: ReturnType<typeof buildEmbedRuntime> };

export function getRuntimeEmbedServices(env: NodeJS.ProcessEnv = process.env) {
  if (env === process.env && globalEmbeds.s2aEmbedRuntime) return globalEmbeds.s2aEmbedRuntime;
  const runtime = buildEmbedRuntime(env);
  if (env === process.env) globalEmbeds.s2aEmbedRuntime = runtime;
  return runtime;
}

function buildEmbedRuntime(env: NodeJS.ProcessEnv) {
  const secret = env.APP_SECRET;
  if (!secret) throw new Error("APP_SECRET is required");
  const settings = getRuntimeSettingsService(env);
  const store = createSqliteEmbedConfigStore(env.DATABASE_URL ?? DEFAULT_DATABASE_URL);
  const ticketsStore = createSqliteTicketStore(env.DATABASE_URL ?? DEFAULT_DATABASE_URL);
  const lotteryStore = createSqliteLotteryStore(env.DATABASE_URL ?? DEFAULT_DATABASE_URL);
  const upstream = createEmbedUpstreamGateway(settings);
  const configs = createEmbedConfigService({ store, sourceOrigin: upstream.sourceOrigin });
  const sessions = createActiveEmbedSessionService(createEmbedSessionService(secret), configs);
  const identities = createEmbedIdentityService({ configs, sessions, upstream });
  const tickets = createTicketService({ store: ticketsStore, configs });
  const leaderboard = createLeaderboardService({ upstream });
  const lottery = createLotteryService({
    store: lotteryStore,
    rewards: createRuntimeRewardCodeGateway(settings),
    balance: (identity) => upstream.userBalance(identity.sub2apiUserId),
  });
  return {
    configs, identities, sessions, tickets, leaderboard, lottery,
    close: () => { lotteryStore.close(); ticketsStore.close(); store.close(); },
  };
}

export function createActiveEmbedSessionService(
  tokens: EmbedSessionService,
  configs: Pick<EmbedConfigService, "get">,
): EmbedSessionService {
  return {
    issue: tokens.issue,
    verify: async (token, kind) => {
      const identity = await tokens.verify(token, kind);
      if (!identity) return null;
      const current = await configs.get(kind);
      const settings = basicSettings(current);
      return identity.embedToken === current.embedToken && identity.srcHost === settings.sourceOrigin
        ? identity
        : null;
    },
  };
}
