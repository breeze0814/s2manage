import type { ConnectionContext } from "./context.ts";
import { errorMessage, requiredConnection } from "./model.ts";
import type {
  ConnectionLifecycleAction, ConnectionLifecycleStage, RealConnection,
} from "./types.ts";

export function beginStage(context: ConnectionContext, input: StageEventInput) {
  context.store.setStage({
    id: input.connectionId,
    stage: input.stage,
    error: null,
    at: context.now().toISOString(),
  });
  appendEvent(context, { ...input, result: "started" });
}

export function completeStage(context: ConnectionContext, input: StageEventInput) {
  appendEvent(context, { ...input, result: "success" });
}

export function beginLifecycle(context: ConnectionContext, input: Readonly<{
  connection: RealConnection;
  action: ConnectionLifecycleAction;
  stage: ConnectionLifecycleStage;
  mode: RealConnection["disconnectMode"];
  removePricing: boolean;
  message: string;
}>) {
  const at = context.now().toISOString();
  context.store.setLifecycle({
    id: input.connection.id,
    status: input.action === "provision" ? "provisioning" : "disconnecting",
    action: input.action,
    stage: input.stage,
    mode: input.mode,
    removePricing: input.removePricing,
    error: null,
    at,
  });
  appendEvent(context, {
    connectionId: input.connection.id,
    action: input.action,
    stage: input.stage,
    result: "started",
    message: input.message,
  });
}

export function failLifecycle(
  context: ConnectionContext,
  connectionId: string,
  error: unknown,
) {
  const current = requiredConnection(context, connectionId);
  if (!current.lifecycleAction) throw error;
  const message = errorMessage(error);
  context.store.setLifecycle({
    id: current.id,
    status: "error",
    action: current.lifecycleAction,
    stage: current.lifecycleStage,
    mode: current.disconnectMode,
    removePricing: current.disconnectRemovePricing,
    error: message,
    at: context.now().toISOString(),
  });
  appendEvent(context, {
    connectionId: current.id,
    action: current.lifecycleAction,
    stage: current.lifecycleStage,
    result: "failure",
    message,
  });
}

function appendEvent(context: ConnectionContext, input: LifecycleEventInput) {
  context.store.appendEvent({ ...input, createdAt: context.now().toISOString() });
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
