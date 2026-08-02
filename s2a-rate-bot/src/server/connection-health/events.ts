import type {
  ConnectionHealthMonitor, ConnectionHealthState, ConnectionHealthStateName, NewHealthEvent,
} from "./types.ts";

export type ProbeResult = Readonly<{
  success: boolean;
  message: string;
  latencyMs: number;
  model: string | null;
}>;

export function probeEvent(input: Readonly<{
  monitor: ConnectionHealthMonitor;
  state: ConnectionHealthState;
  result: ProbeResult;
  at: string;
}>): NewHealthEvent {
  return {
    connectionId: input.monitor.connectionId,
    eventType: "probe",
    result: input.result.success ? "success" : "failure",
    fromState: input.monitor.state,
    toState: input.state.state,
    message: input.result.message,
    latencyMs: Math.round(input.result.latencyMs),
    model: input.result.model,
    createdAt: input.at,
  };
}

export function policyEvent(connectionId: string, policyId: number | null, at: string): NewHealthEvent {
  return {
    connectionId,
    eventType: "policy",
    result: "info",
    fromState: null,
    toState: null,
    message: policyId === null ? "已取消健康策略" : `已分配健康策略 #${policyId}`,
    latencyMs: null,
    model: null,
    createdAt: at,
  };
}

export function actionEvent(input: Readonly<{
  connectionId: string;
  fromState: ConnectionHealthStateName;
  toState: ConnectionHealthStateName;
  message: string;
  result: "success" | "failure" | "info";
  at: string;
}>): NewHealthEvent {
  return {
    connectionId: input.connectionId,
    eventType: "action",
    result: input.result,
    fromState: input.fromState,
    toState: input.toState,
    message: input.message,
    latencyMs: null,
    model: null,
    createdAt: input.at,
  };
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
