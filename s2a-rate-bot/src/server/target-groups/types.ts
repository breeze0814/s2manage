export type TargetGroup = {
  readonly id: number;
  readonly name: string;
  readonly status?: string | null;
  readonly rate_multiplier?: number | null;
};

export type RuleType = "first" | "average" | "min" | "max" | "avg_formula";
export type RuleParameters = {
  readonly offset: number;
  readonly multiplier: number;
  readonly formula: string;
};

export type SourceBinding = {
  readonly sourceSiteId: number;
  readonly sourceGroupId: string;
};

export type TargetRule = {
  readonly targetGroupId: number;
  readonly targetGroupName: string;
  readonly enabled: boolean;
  readonly ruleVersion: 1;
  readonly ruleType: RuleType;
  readonly parameters: RuleParameters;
  readonly currentRate: number | null;
  readonly lastAppliedAt: string | null;
  readonly lastError: string | null;
};

export type TargetGroupClient = {
  readonly listGroups: () => Promise<readonly TargetGroup[]>;
  readonly updateGroupRate: (groupId: number, rate: number) => Promise<TargetGroup>;
};
