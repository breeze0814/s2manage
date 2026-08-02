import { HealthPolicyConflictError } from "./errors.ts";
import type {
  ConnectionHealthMonitor, ConnectionHealthPolicy, ConnectionHealthState,
  ConnectionHealthStateName,
} from "./types.ts";
import type { ProbeResult } from "./events.ts";

const MILLISECONDS_PER_SECOND = 1_000;

export function nextProbeAt(at: Date, intervalSeconds: number) {
  return new Date(at.getTime() + intervalSeconds * MILLISECONDS_PER_SECOND).toISOString();
}

export function probeState(
  monitor: ConnectionHealthMonitor,
  result: ProbeResult,
  at: Date,
): ConnectionHealthState {
  const policy = requiredMonitorPolicy(monitor);
  const transition = result.success
    ? successTransition(monitor, policy)
    : failureTransition(monitor, policy);
  const { policy: _policy, ...current } = monitor;
  return {
    ...current,
    state: transition.state,
    consecutiveFailures: transition.failures,
    consecutiveSuccesses: transition.successes,
    suspensionReason: transition.suspensionReason,
    lastProbeAt: at.toISOString(),
    nextProbeAt: nextProbeAt(at, policy.intervalSeconds),
    lastResult: result.success ? "success" : "failure",
    lastMessage: result.message,
    lastLatencyMs: Math.round(result.latencyMs),
    lastModel: result.model,
    updatedAt: at.toISOString(),
  };
}

export function retryableActionState(state: ConnectionHealthState): ConnectionHealthState {
  if (state.state === "suspended") return { ...state, state: "degraded", suspensionReason: null };
  if (state.state === "healthy") return { ...state, state: "observing", suspensionReason: "automatic" };
  return state;
}

export function requiredMonitorPolicy(monitor: ConnectionHealthMonitor) {
  if (!monitor.policy) throw new HealthPolicyConflictError("真实连接尚未分配健康策略");
  return monitor.policy;
}

function successTransition(monitor: ConnectionHealthMonitor, policy: ConnectionHealthPolicy): Transition {
  const successes = monitor.consecutiveSuccesses + 1;
  if (monitor.suspensionReason === "manual") {
    return transition({ state: "suspended", failures: 0, successes, suspensionReason: "manual" });
  }
  if (monitor.suspensionReason === "automatic" && !policy.autoRestore) {
    return transition({ state: "suspended", failures: 0, successes, suspensionReason: "automatic" });
  }
  if (monitor.state !== "suspended" && monitor.state !== "observing") {
    return transition({ state: "healthy", failures: 0, successes, suspensionReason: null });
  }
  const recovered = successes >= policy.recoveryThreshold;
  return transition({
    state: recovered ? "healthy" : "observing",
    failures: 0,
    successes,
    suspensionReason: recovered ? null : monitor.suspensionReason,
  });
}

function failureTransition(monitor: ConnectionHealthMonitor, policy: ConnectionHealthPolicy): Transition {
  const failures = monitor.consecutiveFailures + 1;
  if (monitor.suspensionReason) {
    return transition({ state: "suspended", failures, successes: 0, suspensionReason: monitor.suspensionReason });
  }
  const suspended = policy.autoSuspend && failures >= policy.failureThreshold;
  return transition({
    state: suspended ? "suspended" : "degraded",
    failures,
    successes: 0,
    suspensionReason: suspended ? "automatic" : null,
  });
}

function transition(input: Transition): Transition {
  return input;
}

type Transition = Readonly<{
  state: ConnectionHealthStateName;
  failures: number;
  successes: number;
  suspensionReason: ConnectionHealthState["suspensionReason"];
}>;
