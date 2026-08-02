export type ConnectionHealthStateName = "unknown" | "healthy" | "degraded" | "suspended" | "observing";
export type ConnectionSuspensionReason = "automatic" | "manual";

export type ConnectionHealthPolicy = {
  readonly id: number;
  readonly name: string;
  readonly enabled: boolean;
  readonly intervalSeconds: number;
  readonly failureThreshold: number;
  readonly recoveryThreshold: number;
  readonly autoSuspend: boolean;
  readonly autoRestore: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type ConnectionHealthState = {
  readonly connectionId: string;
  readonly state: ConnectionHealthStateName;
  readonly consecutiveFailures: number;
  readonly consecutiveSuccesses: number;
  readonly lastProbeAt: string | null;
  readonly nextProbeAt: string | null;
  readonly lastResult: string | null;
  readonly lastMessage: string | null;
  readonly lastLatencyMs: number | null;
  readonly lastModel: string | null;
  readonly suspensionReason: ConnectionSuspensionReason | null;
  readonly updatedAt: string;
};

export type ConnectionHealthMonitor = ConnectionHealthState & {
  readonly policy: ConnectionHealthPolicy | null;
};

export type ConnectionHealthActionState = {
  readonly connectionId: string;
  readonly accountId: number;
  readonly originalSchedulable: boolean;
  readonly lastAppliedSchedulable: boolean;
  readonly pendingSchedulable: boolean | null;
  readonly conflict: boolean;
  readonly updatedAt: string;
};

export type ConnectionHealthEvent = {
  readonly id: number;
  readonly connectionId: string;
  readonly eventType: "probe" | "action" | "policy";
  readonly result: "success" | "failure" | "info";
  readonly fromState: ConnectionHealthStateName | null;
  readonly toState: ConnectionHealthStateName | null;
  readonly message: string;
  readonly latencyMs: number | null;
  readonly model: string | null;
  readonly createdAt: string;
  readonly sourceSiteName: string;
  readonly sourceGroupName: string;
  readonly targetAccountName: string;
};

export type NewHealthEvent = Omit<ConnectionHealthEvent,
  "id" | "sourceSiteName" | "sourceGroupName" | "targetAccountName">;

export type ConnectionHealthEventPage = Readonly<{
  events: readonly ConnectionHealthEvent[];
  nextCursor: number | null;
}>;

export type HealthProbeExecution = {
  readonly monitor: ConnectionHealthMonitor;
  readonly success: boolean;
  readonly message: string;
};
