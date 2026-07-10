export type TargetAccountView = {
  readonly id: number;
  readonly name: string;
  readonly platform: string;
  readonly status: string;
  readonly schedulable: boolean;
  readonly rateMultiplier: number | null;
  readonly priority: number | null;
  readonly groupIds: readonly number[];
};
