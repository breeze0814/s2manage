import { getRuntimeSettingsService } from "../settings/runtime.ts";
import { createAesGcmSecretCipher } from "../crypto.ts";
import { createPostgresCompensationClaimStore } from "../compensation/claim-postgres-store.ts";
import { createCompensationConfigService } from "../compensation/config-service.ts";
import { createPostgresCompensationConfigStore } from "../compensation/config-postgres-store.ts";
import { createRuntimeLiandongTransport } from "../compensation/http.ts";
import { createRuntimeJsonOrderGateway } from "../compensation/json-order-gateway.ts";
import { createLiandongGateway } from "../compensation/liandong-gateway.ts";
import { createCompensationService } from "../compensation/service.ts";
import { createPostgresEmbedConfigStore } from "./config-postgres-store.ts";
import { basicSettings, createEmbedConfigService, type EmbedConfigService } from "./config-service.ts";
import { createEmbedIdentityService } from "./identity-service.ts";
import { createLeaderboardService } from "./leaderboard-service.ts";
import { createLotteryService } from "./lottery-service.ts";
import { createRuntimeLotteryEligibilityGateway } from "./lottery-eligibility-gateway.ts";
import { createPostgresLotteryStore } from "./lottery-postgres-store.ts";
import { createRuntimeRewardCodeGateway } from "./reward-code-gateway.ts";
import { createRedisEmbedSessionService, type EmbedSessionService } from "./session.ts";
import { createTicketService } from "./ticket-service.ts";
import { createPostgresTicketStore } from "./ticket-postgres-store.ts";
import { createEmbedUpstreamGateway } from "./upstream.ts";
import { getRuntimeInfrastructure } from "../infrastructure/runtime.ts";

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
  const infrastructure = getRuntimeInfrastructure(env);
  const settings = getRuntimeSettingsService(env);
  const cipher = createAesGcmSecretCipher(secret);
  const store = createPostgresEmbedConfigStore(infrastructure.postgres);
  const ticketsStore = createPostgresTicketStore(infrastructure.postgres);
  const lotteryStore = createPostgresLotteryStore(infrastructure.postgres);
  const compensationConfigStore = createPostgresCompensationConfigStore(infrastructure.postgres);
  const compensationClaimStore = createPostgresCompensationClaimStore(infrastructure.postgres);
  const upstream = createEmbedUpstreamGateway(settings);
  const configs = createEmbedConfigService({ store, sourceOrigin: upstream.sourceOrigin });
  const sessions = createActiveEmbedSessionService(createRedisEmbedSessionService(infrastructure.redis), configs);
  const identities = createEmbedIdentityService({ configs, sessions, upstream });
  const tickets = createTicketService({ store: ticketsStore, configs });
  const leaderboard = createLeaderboardService({ upstream });
  const lottery = createLotteryService({
    store: lotteryStore,
    rewards: createRuntimeRewardCodeGateway(settings),
    eligibility: createRuntimeLotteryEligibilityGateway(
      settings,
      (identity) => upstream.userBalance(identity.sub2apiUserId),
    ),
  });
  const compensationConfig = createCompensationConfigService({ store: compensationConfigStore, cipher });
  const compensation = createCompensationService({
    config: compensationConfig,
    claims: compensationClaimStore,
    liandong: createLiandongGateway(createRuntimeLiandongTransport(settings)),
    jsonOrders: createRuntimeJsonOrderGateway(),
    rewards: createRuntimeRewardCodeGateway(settings),
  });
  return {
    configs, identities, sessions, tickets, leaderboard, lottery, compensationConfig, compensation,
    close: async () => {
      compensationClaimStore.close(); compensationConfigStore.close();
      ticketsStore.close(); store.close();
      await lotteryStore.close();
    },
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
