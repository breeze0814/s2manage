export type RuleType = "first" | "average" | "min" | "max" | "avg_formula";
export type SourceBinding = { readonly sourceSiteId: number; readonly sourceGroupId: string };
export type TargetGroupView = {
  readonly id: number;
  readonly name: string;
  readonly status?: string | null;
  readonly rate_multiplier?: number | null;
  readonly rule: {
    readonly enabled: boolean;
    readonly ruleVersion: 1;
    readonly ruleType: RuleType;
    readonly parameters: { readonly offset: number; readonly multiplier: number; readonly formula: string };
    readonly lastAppliedAt: string | null;
    readonly lastError: string | null;
  };
  readonly bindings: readonly SourceBinding[];
};

export type SourceSiteOption = { readonly id: number; readonly name: string };
export type SourceRateOption = {
  readonly sourceSiteId: number;
  readonly groupId: string;
  readonly groupName: string;
  readonly platform?: string;
  readonly effectiveRate: number;
};

export type RuleDraft = {
  readonly enabled: boolean;
  readonly ruleVersion: 1;
  readonly ruleType: RuleType;
  readonly offset: string;
  readonly multiplier: string;
  readonly formula: string;
  readonly bindings: readonly SourceBinding[];
};
