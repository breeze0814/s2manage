export type TargetAccount = {
  readonly id: number;
  readonly name: string;
  readonly platform: string;
  readonly status: string;
  readonly rateMultiplier: number | null;
  readonly priority: number | null;
  readonly groupIds: readonly number[];
};

export type TargetAccountBinding = {
  readonly sourceSiteId: number;
  readonly sourceGroupId: string;
};

export type TargetAccountTestStatus = "available" | "unavailable" | "error";
export type TargetAccountTestState = {
  readonly status: TargetAccountTestStatus;
  readonly message: string;
  readonly latencyMs: number;
  readonly model?: string;
  readonly testedAt: string;
};

export type TargetAccountView = TargetAccount & {
  readonly binding: TargetAccountBinding | null;
  readonly lastTest: TargetAccountTestState | null;
};

export type TargetAccountTestExecution = {
  readonly account: TargetAccountView;
  readonly test: TargetAccountTestState;
};

export type TargetAccountTestResult = {
  readonly success: boolean;
  readonly message: string;
  readonly latencyMs: number;
  readonly model?: string;
};

export type TargetAccountClient = {
  readonly listAccounts: () => Promise<readonly TargetAccount[]>;
  readonly testChannel: (accountId: number) => Promise<TargetAccountTestResult>;
};
