export type TargetGroup = {
  readonly id: number;
  readonly name: string;
  readonly platform?: string | null;
  readonly status?: string | null;
  readonly rate_multiplier?: number | null;
};

import { TARGET_RULE_VERSION } from "../../core/rule-version.ts";

export type RuleType = "first" | "average" | "min" | "max" | "avg_formula";
export type AdjustmentMode = "fixed" | "percentage";
export type RuleParameters = {
  readonly adjustmentMode: AdjustmentMode;
  readonly adjustmentValue: number;
  readonly minimum: number;
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
  readonly ruleVersion: typeof TARGET_RULE_VERSION;
  readonly ruleType: RuleType;
  readonly parameters: RuleParameters;
  readonly currentRate: number | null;
  readonly lastAppliedFromRate: number | null;
  readonly lastAppliedToRate: number | null;
  readonly lastAppliedAt: string | null;
  readonly lastError: string | null;
};

export type TargetGroupClient = {
  readonly listGroups: () => Promise<readonly TargetGroup[]>;
  readonly updateGroupRate: (groupId: number, rate: number) => Promise<TargetGroup>;
};
