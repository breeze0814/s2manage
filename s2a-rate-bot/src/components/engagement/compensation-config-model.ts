import type { CompensationRule } from "../../core/compensation";
import type { AdminCompensationSettings } from "../../server/compensation/types";

export type CompensationConfigDraft = Readonly<{
  enabled: boolean;
  activityName: string;
  description: string;
  baseUrl: string;
  username: string;
  password: string;
  rules: readonly CompensationRuleDraft[];
}>;

export type CompensationRuleDraft = Omit<CompensationRule, "startAt" | "endAt"> & Readonly<{
  startAt: string;
  endAt: string;
}>;

const DEFAULT_RATE_PERCENT = 100;

export function configDraft(settings: AdminCompensationSettings): CompensationConfigDraft {
  return {
    enabled: settings.enabled,
    activityName: settings.activityName,
    description: settings.description,
    baseUrl: settings.baseUrl,
    username: settings.username,
    password: "",
    rules: settings.rules.map((rule) => ({
      ...rule,
      startAt: toInput(rule.startAt),
      endAt: toInput(rule.endAt),
    })),
  };
}

export function configRequest(draft: CompensationConfigDraft) {
  return {
    ...draft,
    rules: draft.rules.map((rule) => ({
      ...rule,
      startAt: toIso(rule.startAt),
      endAt: toIso(rule.endAt),
    })),
  };
}

export function newRule(): CompensationRuleDraft {
  return {
    id: crypto.randomUUID(),
    name: "",
    startAt: "",
    endAt: "",
    ratePercent: DEFAULT_RATE_PERCENT,
  };
}

function toIso(value: string) { return value ? new Date(value).toISOString() : ""; }

function toInput(value: string) {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}
