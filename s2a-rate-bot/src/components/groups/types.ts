export type RuleType = "first" | "average" | "min" | "max" | "avg_formula";
export type AdjustmentMode = "fixed" | "percentage";
export type SourceBinding = { readonly sourceSiteId: number; readonly sourceGroupId: string };
export type TargetGroupView = {
  readonly id: number;
  readonly name: string;
  readonly platform?: string | null;
  readonly status?: string | null;
  readonly rate_multiplier?: number | null;
  readonly rule: {
    readonly enabled: boolean;
    readonly ruleVersion: 2;
    readonly ruleType: RuleType;
    readonly parameters: { readonly adjustmentMode: AdjustmentMode; readonly adjustmentValue: number; readonly minimum: number; readonly formula: string };
    readonly lastAppliedFromRate: number | null;
    readonly lastAppliedToRate: number | null;
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
  readonly rawRate: number | null;
  readonly effectiveRate: number;
};

export type RuleDraft = {
  readonly enabled: boolean;
  readonly ruleVersion: 2;
  readonly ruleType: RuleType;
  readonly adjustmentMode: AdjustmentMode;
  readonly adjustmentValue: string;
  readonly minimum: string;
  readonly formula: string;
  readonly bindings: readonly SourceBinding[];
};
