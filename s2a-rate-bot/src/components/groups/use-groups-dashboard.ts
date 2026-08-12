"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { TARGET_RULE_VERSION } from "../../core/rule-version";
import type { RuleDraft, SourceRateOption, SourceSiteOption, TargetGroupView } from "./types";

export function useGroupsDashboard() {
  const [groups, setGroups] = useState<TargetGroupView[]>([]);
  const [sites, setSites] = useState<SourceSiteOption[]>([]);
  const [rates, setRates] = useState<SourceRateOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [pending, setPending] = useState("");
  useEffect(() => { void loadAll({ setGroups, setSites, setRates, setLoading, setLoadError }); }, []);
  return {
    groups, sites, rates, loading, loadError, pending,
    refresh: () => void refreshGroups({ setGroups, setLoading, setLoadError }),
    refreshOne: (groupId: number) => void refreshGroup({ groupId, setGroups, setPending }),
    save: (groupId: number, draft: RuleDraft) => saveRule({ groupId, draft, setGroups, setPending }),
    preview: (groupId: number) => void executeAction({ groupId, action: "preview", setPending, setGroups }),
    apply: (groupId: number) => void executeAction({ groupId, action: "apply", setPending, setGroups }),
  };
}

async function loadAll(input: LoadActions) {
  input.setLoadError("");
  try {
    const [groupBody, siteBody, rateBody] = await Promise.all([
      api<{ groups: TargetGroupView[] }>("/api/groups"),
      api<{ sites: SourceSiteOption[] }>("/api/sources"),
      api<{ rates: SourceRateOption[] }>("/api/sources/rates"),
    ]);
    input.setGroups(groupBody.groups); input.setSites(siteBody.sites); input.setRates(rateBody.rates);
  } catch (error) {
    input.setLoadError(errorMessage(error));
    toast.error(errorMessage(error));
  } finally {
    input.setLoading(false);
  }
}

async function refreshGroups(input: Pick<LoadActions, "setGroups" | "setLoading" | "setLoadError">) {
  input.setLoading(true);
  input.setLoadError("");
  try {
    input.setGroups((await api<{ groups: TargetGroupView[] }>("/api/groups/refresh", { method: "POST" })).groups);
    toast.success("已从目标站刷新全部分组并写入本地快照");
  } catch (error) {
    input.setLoadError(errorMessage(error));
    toast.error(errorMessage(error));
  } finally {
    input.setLoading(false);
  }
}

async function saveRule(input: SaveActions): Promise<boolean> {
  input.setPending(`save:${input.groupId}`);
  try {
    await api(`/api/groups/${input.groupId}/rule`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(rulePayload(input.draft)) });
    input.setGroups((await api<{ groups: TargetGroupView[] }>("/api/groups")).groups);
    toast.success("倍率规则已保存");
    return true;
  } catch (error) {
    toast.error(errorMessage(error));
    return false;
  } finally {
    input.setPending("");
  }
}

async function executeAction(input: ExecuteActions) {
  input.setPending(`${input.action}:${input.groupId}`);
  try {
    const body = await api<{ decision: { action: string; nextRate: number | null; reason?: string } }>(`/api/groups/${input.groupId}/${input.action}`, { method: "POST" });
    toast.success(decisionMessage(input.action, body.decision));
    if (input.action === "apply") input.setGroups((await api<{ groups: TargetGroupView[] }>("/api/groups")).groups);
  } catch (error) {
    toast.error(errorMessage(error));
  } finally {
    input.setPending("");
  }
}

function rulePayload(draft: RuleDraft) {
  const minimum = finiteNumber(draft.minimum, "计算最小值");
  if (minimum < 0) throw new Error("计算最小值必须大于或等于 0");
  return {
    enabled: draft.enabled, ruleVersion: TARGET_RULE_VERSION, ruleType: draft.ruleType,
    parameters: { adjustmentMode: draft.adjustmentMode,
      adjustmentValue: finiteNumber(draft.adjustmentValue, "倍率调整值"), minimum, formula: draft.formula },
    bindings: draft.bindings.map((binding) => ({
      sourceSiteId: binding.sourceSiteId, sourceGroupId: binding.sourceGroupId,
    })),
  };
}

async function refreshGroup(input: RefreshGroupActions) {
  input.setPending(`refresh:${input.groupId}`);
  try {
    const body = await api<{ group: TargetGroupView | null }>(`/api/groups/${input.groupId}/refresh`, { method: "POST" });
    if (body.group === null) {
      input.setGroups((groups) => groups.filter((group) => group.id !== input.groupId));
      toast.warning("目标站已删除该分组，已清理本地规则");
      return;
    }
    input.setGroups((groups) => groups.map((group) => group.id === input.groupId ? body.group! : group));
    toast.success(`已刷新分组「${body.group.name}」并写入本地快照`);
  } catch (error) {
    toast.error(errorMessage(error));
  } finally {
    input.setPending("");
  }
}

function finiteNumber(value: string, label: string) {
  if (value.trim() === "") throw new Error(`${label}不能为空`);
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new Error(`${label}必须是有效数字`);
  return numeric;
}

function decisionMessage(action: string, decision: { action: string; nextRate: number | null; reason?: string }) {
  if (decision.action === "skip") return `${action === "apply" ? "执行" : "预览"}跳过：${decision.reason ?? "倍率未变化"}`;
  return `${action === "apply" ? "已应用" : "预览结果"}：${decision.nextRate}`;
}

async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> { const response = await fetch(url, { cache: "no-store", ...init }); const text = await response.text(); const body = text ? JSON.parse(text) as { error?: string } : {}; if (!response.ok) throw new Error(body.error ?? `请求失败 HTTP ${response.status}`); return body as T; }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error); }
type SetGroups = React.Dispatch<React.SetStateAction<TargetGroupView[]>>;
type LoadActions = { setGroups: SetGroups; setSites: React.Dispatch<React.SetStateAction<SourceSiteOption[]>>; setRates: React.Dispatch<React.SetStateAction<SourceRateOption[]>>; setLoading: (value: boolean) => void; setLoadError: (value: string) => void };
type SaveActions = { groupId: number; draft: RuleDraft; setGroups: SetGroups; setPending: (value: string) => void };
type ExecuteActions = { groupId: number; action: "preview" | "apply"; setGroups: SetGroups; setPending: (value: string) => void };
type RefreshGroupActions = { groupId: number; setGroups: SetGroups; setPending: (value: string) => void };
