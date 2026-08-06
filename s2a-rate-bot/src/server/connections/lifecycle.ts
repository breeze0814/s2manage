import type { ConnectionContext } from "./context.ts";
import { errorMessage, requiredConnection } from "./model.ts";
import type {
  ConnectionLifecycleAction, ConnectionLifecycleStage, RealConnection,
} from "./types.ts";

export async function beginStage(context: ConnectionContext, input: StageEventInput) {
  await context.store.setStage({
    id: input.connectionId,
    stage: input.stage,
    error: null,
    at: context.now().toISOString(),
  });
  await appendEvent(context, { ...input, result: "started" });
}

export async function completeStage(context: ConnectionContext, input: StageEventInput) {
  await appendEvent(context, { ...input, result: "success" });
}

export async function beginLifecycle(context: ConnectionContext, input: Readonly<{
  connection: RealConnection;
  action: ConnectionLifecycleAction;
  stage: ConnectionLifecycleStage;
  mode: RealConnection["disconnectMode"];
  removePricing: boolean;
  message: string;
}>) {
  const at = context.now().toISOString();
  await context.store.setLifecycle({
    id: input.connection.id,
    status: input.action === "provision" ? "provisioning" : "disconnecting",
    action: input.action,
    stage: input.stage,
    mode: input.mode,
    removePricing: input.removePricing,
    error: null,
    at,
  });
  await appendEvent(context, {
    connectionId: input.connection.id,
    action: input.action,
    stage: input.stage,
    result: "started",
    message: input.message,
  });
}

export async function failLifecycle(
  context: ConnectionContext,
  connectionId: string,
  error: unknown,
) {
  const current = await requiredConnection(context, connectionId);
  if (!current.lifecycleAction) throw error;
  const message = errorMessage(error);
  await context.store.setLifecycle({
    id: current.id,
    status: "error",
    action: current.lifecycleAction,
    stage: current.lifecycleStage,
    mode: current.disconnectMode,
    removePricing: current.disconnectRemovePricing,
    error: message,
    at: context.now().toISOString(),
  });
  await appendEvent(context, {
    connectionId: current.id,
    action: current.lifecycleAction,
    stage: current.lifecycleStage,
    result: "failure",
    message,
  });
}

async function appendEvent(context: ConnectionContext, input: LifecycleEventInput) {
  await context.store.appendEvent({ ...input, createdAt: context.now().toISOString() });
}

type StageEventInput = Readonly<{
  connectionId: string;
  action: ConnectionLifecycleAction;
  stage: ConnectionLifecycleStage;
  message: string;
}>;
type LifecycleEventInput = StageEventInput & Readonly<{
  result: "started" | "success" | "failure" | "info";
}>;
