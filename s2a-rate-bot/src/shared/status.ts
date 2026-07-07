export type ServiceStatus = {
  readonly name: string;
  readonly state: "ready" | "not_configured" | "error";
  readonly detail: string;
};

export type StatusRuntimeEvent = {
  readonly service: "api" | "worker" | "bot";
  readonly status: "running" | "success" | "failed";
  readonly message: string;
  readonly createdAt: string;
};

export type StatusAppConfig = {
  readonly target: { readonly baseUrl: string; readonly adminApiKey: string } | null;
  readonly bot: {
    readonly enabled: boolean;
    readonly wsUrl: string;
    readonly targetGroupId: string;
    readonly botUserId: string;
  };
  readonly sources: readonly unknown[];
};

export function buildStatus(input: {
  readonly databaseUrl: string | null;
  readonly appConfig?: StatusAppConfig | null;
  readonly runtimeEvents?: readonly StatusRuntimeEvent[];
}): ServiceStatus[] {
  return [
    {
      name: "api",
      state: "ready",
      detail: "pub UI and JSON status API are available",
    },
    workerStatus(input),
    botStatus(input),
  ];
}

function workerStatus(input: {
  readonly databaseUrl: string | null;
  readonly appConfig?: StatusAppConfig | null;
  readonly runtimeEvents?: readonly StatusRuntimeEvent[];
}): ServiceStatus {
  if (!input.databaseUrl) {
    return {
      name: "worker",
      state: "not_configured",
      detail: "DATABASE_URL is required before worker orchestration can run",
    };
  }
  if (!input.appConfig?.target) {
    return { name: "worker", state: "not_configured", detail: "target station is required before worker orchestration can run" };
  }
  if (input.appConfig.sources.length === 0) {
    return { name: "worker", state: "not_configured", detail: "add at least one source station before worker orchestration can run" };
  }
  const event = latestEvent(input, "worker");
  if (event?.status === "failed") return { name: "worker", state: "error", detail: `last failure: ${event.message}` };
  return {
    name: "worker",
    state: "ready",
    detail: event ? `last ${event.status}: ${event.message}` : "sub2 source collection and target group rule worker are configured",
  };
}

function botStatus(input: {
  readonly databaseUrl: string | null;
  readonly appConfig?: StatusAppConfig | null;
  readonly runtimeEvents?: readonly StatusRuntimeEvent[];
}): ServiceStatus {
  if (!input.databaseUrl) {
    return {
      name: "bot",
      state: "not_configured",
      detail: "DATABASE_URL is required before bot orchestration can run",
    };
  }
  const bot = input.appConfig?.bot;
  if (!bot?.enabled) return { name: "bot", state: "not_configured", detail: "QQBot is disabled" };
  if (!bot.wsUrl.trim()) return { name: "bot", state: "not_configured", detail: "NapCat WebSocket URL is empty" };
  if (!bot.targetGroupId.trim()) return { name: "bot", state: "not_configured", detail: "target QQ group is empty" };
  if (!bot.botUserId.trim()) return { name: "bot", state: "not_configured", detail: "current Bot QQ is empty" };
  if (!input.appConfig?.target) return { name: "bot", state: "not_configured", detail: "target Sub2API is not configured" };
  const event = latestEvent(input, "bot");
  if (event?.status === "failed") return { name: "bot", state: "error", detail: `last failure: ${event.message}` };
  return {
    name: "bot",
    state: "ready",
    detail: event ? `last ${event.status}: ${event.message}` : "NapCat listener, passive commands, private pushes, and invite stats are configured",
  };
}

function latestEvent(input: { readonly runtimeEvents?: readonly StatusRuntimeEvent[] }, service: StatusRuntimeEvent["service"]) {
  return input.runtimeEvents?.find((event) => event.service === service) ?? null;
}
