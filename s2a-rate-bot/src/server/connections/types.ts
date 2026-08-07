import type { TargetAccountTestResult } from "../target-accounts/types.ts";

export type ConnectionGroupType = "openai" | "anthropic" | "gemini" | "antigravity";
export type ConnectionStatus = "provisioning" | "active" | "disconnecting" | "disconnected" | "error";
export type ProvisioningMode = "managed" | "existing";
export type ConnectionLifecycleAction = "provision" | "disconnect";
export type ConnectionLifecycleStage = "idle" | "metadata" | "source" | "target" | "pricing" | "health" | "remote" | "complete";

export type RealConnection = {
  readonly id: string;
  readonly operationId: string;
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
  readonly provisioningMode: ProvisioningMode;
  readonly status: ConnectionStatus;
  readonly pricingMappingEnabled: boolean;
  readonly pricingMappingRequested: boolean;
  readonly sourceCredentialDeleted: boolean;
  readonly targetAccountDeleted: boolean;
  readonly lifecycleAction: ConnectionLifecycleAction | null;
  readonly lifecycleStage: ConnectionLifecycleStage;
  readonly disconnectMode: "unlink" | "full";
  readonly disconnectRemovePricing: boolean;
  readonly lastError: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly disconnectedAt: string | null;
};

export type ConnectionView = Omit<RealConnection, "operationId"> & {
  readonly connected: boolean;
  readonly canDeleteRemote: boolean;
};

export type ConnectionLifecycleEvent = Readonly<{
  id: number;
  connectionId: string;
  action: ConnectionLifecycleAction;
  stage: ConnectionLifecycleStage;
  result: "started" | "success" | "failure" | "info";
  message: string;
  createdAt: string;
  sourceSiteName: string;
  sourceGroupName: string;
  targetAccountName: string;
}>;

export type NewConnectionLifecycleEvent = Omit<ConnectionLifecycleEvent,
  "id" | "sourceSiteName" | "sourceGroupName" | "targetAccountName">;

export type ConnectionLifecycleEventPage = Readonly<{
  events: readonly ConnectionLifecycleEvent[];
  nextCursor: number | null;
}>;

export type ConnectionSourceSite = {
  readonly id: number;
  readonly name: string;
  readonly siteType: "sub2api" | "newapi";
  readonly baseUrl: string;
  readonly enabled: boolean;
};

export type ConnectionSourceRate = {
  readonly sourceSiteId: number;
  readonly groupId: string;
  readonly groupName: string;
  readonly effectiveRate: number;
  readonly platform?: string;
  readonly groupType?: string | null;
  readonly deleted?: boolean;
};

export type ConnectionTargetGroup = {
  readonly id: number;
  readonly name: string;
  readonly platform?: string | null;
  readonly bindings: readonly { readonly sourceSiteId: number; readonly sourceGroupId: string }[];
};

export type ProvisionedCredential = { readonly id: string; readonly key: string };
export type ProvisionedTarget = { readonly id: number; readonly name: string };
export type ExistingSourceCredential = Readonly<{
  id: string;
  name: string;
  groupId: string;
  status: string;
}>;
export type ExistingTargetAccount = Readonly<{
  id: number;
  name: string;
  platform: string;
  status: string;
  groupIds: readonly number[];
}>;

export type ConnectionRemoteGateway = {
  readonly ensureSourceCredential: (input: Readonly<{
    siteId: number;
    groupId: string;
    name: string;
  }>) => Promise<ProvisionedCredential>;
  readonly listSourceCredentials: (siteId: number) => Promise<readonly ExistingSourceCredential[]>;
  readonly deleteSourceCredential: (siteId: number, credentialId: string) => Promise<void>;
  readonly ensureTargetAccount: (input: Readonly<{
    name: string;
    sourceBaseUrl: string;
    apiKey: string;
    groupType: ConnectionGroupType;
    targetGroupIds: readonly number[];
  }>) => Promise<ProvisionedTarget>;
  readonly listTargetAccounts: (targetGroupIds: readonly number[]) => Promise<readonly ExistingTargetAccount[]>;
  readonly renameTargetAccount: (accountId: number, name: string) => Promise<void>;
  readonly deleteTargetAccount: (accountId: number) => Promise<void>;
};

export type ConnectionHealthGateway = {
  readonly probe: (accountId: number) => Promise<TargetAccountTestResult>;
  readonly readSchedulable: (accountId: number) => Promise<boolean>;
  readonly assertSchedulableControl: (accountId: number) => void | Promise<void>;
  readonly setSchedulable: (accountId: number, schedulable: boolean) => Promise<void>;
};
