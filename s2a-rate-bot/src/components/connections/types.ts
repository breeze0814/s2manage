export type ConnectionStatus = "provisioning" | "active" | "disconnecting" | "disconnected" | "error";
export type ConnectionGroupType = "openai" | "anthropic" | "gemini" | "antigravity";
export type ConnectionProvisioningMode = "managed" | "existing";
export type HealthStateName = "unknown" | "healthy" | "degraded" | "suspended" | "observing";

export type ConnectionView = {
  readonly id: string;
  readonly sourceSiteId: number;
  readonly sourceSiteName: string;
  readonly sourceGroupId: string;
  readonly sourceGroupName: string;
  readonly sourcePlatform: string;
  readonly sourceCredentialId: string;
  readonly targetAccountId: number | null;
  readonly targetAccountName: string;
  readonly targetGroupIds: readonly number[];
  readonly targetGroupNames: readonly string[];
  readonly groupType: ConnectionGroupType;
  readonly resourceName: string;
  readonly provisioningMode: ConnectionProvisioningMode;
  readonly status: ConnectionStatus;
  readonly pricingMappingEnabled: boolean;
  readonly pricingMappingRequested: boolean;
  readonly sourceCredentialDeleted: boolean;
  readonly targetAccountDeleted: boolean;
  readonly lifecycleAction: "provision" | "disconnect" | null;
  readonly lifecycleStage: "idle" | "metadata" | "source" | "target" | "pricing" | "health" | "remote" | "complete";
  readonly disconnectMode: "unlink" | "full";
  readonly disconnectRemovePricing: boolean;
  readonly lastError: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly disconnectedAt: string | null;
  readonly connected: boolean;
  readonly canDeleteRemote: boolean;
};

export type ConnectionResourceOptions = Readonly<{
  sourceCredentials: readonly Readonly<{
    id: string;
    name: string;
    groupId: string;
    status: string;
  }>[];
  targetAccounts: readonly Readonly<{
    id: number;
    name: string;
    platform: string;
    status: string;
    groupIds: readonly number[];
  }>[];
}>;

export type ConnectionLifecycleEvent = Readonly<{
  id: number;
  connectionId: string;
  sourceSiteName: string;
  sourceGroupName: string;
  targetAccountName: string;
  action: "provision" | "disconnect";
  stage: ConnectionView["lifecycleStage"];
  result: "started" | "success" | "failure" | "info";
  message: string;
  createdAt: string;
}>;

export type HealthPolicy = {
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

export type HealthMonitor = {
  readonly connectionId: string;
  readonly state: HealthStateName;
  readonly consecutiveFailures: number;
  readonly consecutiveSuccesses: number;
  readonly lastProbeAt: string | null;
  readonly nextProbeAt: string | null;
  readonly lastResult: string | null;
  readonly lastMessage: string | null;
  readonly lastLatencyMs: number | null;
  readonly lastModel: string | null;
  readonly suspensionReason: "automatic" | "manual" | null;
  readonly updatedAt: string;
  readonly policy: HealthPolicy | null;
};

export type HealthEvent = {
  readonly id: number;
  readonly connectionId: string;
  readonly sourceSiteName: string;
  readonly sourceGroupName: string;
  readonly targetAccountName: string;
  readonly eventType: "probe" | "action" | "policy";
  readonly result: "success" | "failure" | "info";
  readonly fromState: HealthStateName | null;
  readonly toState: HealthStateName | null;
  readonly message: string;
  readonly latencyMs: number | null;
  readonly model: string | null;
  readonly createdAt: string;
};

export type ConnectionEvent = Readonly<
  | { kind: "health"; event: HealthEvent }
  | { kind: "lifecycle"; event: ConnectionLifecycleEvent }
>;

export type ConnectionEventPage<T> = Readonly<{
  events: readonly T[];
  nextCursor: number | null;
}>;

export type ConnectionCreatePreset = {
  readonly siteId: number;
  readonly groupId: string;
  readonly groupType?: string | null;
};

export type HealthPolicyForm = {
  name: string;
  enabled: boolean;
  intervalSeconds: string;
  failureThreshold: string;
  recoveryThreshold: string;
  autoSuspend: boolean;
  autoRestore: boolean;
};
