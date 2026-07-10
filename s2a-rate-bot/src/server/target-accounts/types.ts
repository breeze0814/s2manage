export type TargetAccount = {
  readonly id: number;
  readonly name: string;
  readonly platform: string;
  readonly status: string;
  readonly schedulable: boolean;
  readonly rateMultiplier: number | null;
  readonly priority: number | null;
  readonly groupIds: readonly number[];
};

export type TargetAccountClient = {
  readonly listAccounts: () => Promise<readonly TargetAccount[]>;
  readonly setSchedulable: (accountId: number, schedulable: boolean) => Promise<TargetAccount>;
};
