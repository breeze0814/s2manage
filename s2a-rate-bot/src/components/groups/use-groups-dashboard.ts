"use client";

import { useEffect, useState } from "react";
import type { RuleDraft, SourceRateOption, SourceSiteOption, TargetGroupView } from "./types";

export function useGroupsDashboard() {
  const [groups, setGroups] = useState<TargetGroupView[]>([]);
  const [sites, setSites] = useState<SourceSiteOption[]>([]);
  const [rates, setRates] = useState<SourceRateOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => { void loadAll({ setGroups, setSites, setRates, setLoading, setMessage }); }, []);
  return {
    groups, sites, rates, loading, pending, message,
    refresh: () => void refreshGroups({ setGroups, setLoading, setMessage }),
    save: (groupId: number, draft: RuleDraft) => void saveRule({ groupId, draft, setGroups, setPending, setMessage }),
    preview: (groupId: number) => void executeAction({ groupId, action: "preview", setPending, setMessage, setGroups }),
    apply: (groupId: number) => void executeAction({ groupId, action: "apply", setPending, setMessage, setGroups }),
  };
}

async function loadAll(input: LoadActions) {
  try {
    const [groupBody, siteBody, rateBody] = await Promise.all([
      api<{ groups: TargetGroupView[] }>("/api/groups"),
      api<{ sites: SourceSiteOption[] }>("/api/sources"),
      api<{ rates: SourceRateOption[] }>("/api/sources/rates"),
    ]);
    input.setGroups(groupBody.groups); input.setSites(siteBody.sites); input.setRates(rateBody.rates);
  } catch (error) {
    input.setMessage(errorMessage(error));
  } finally {
    input.setLoading(false);
  }
}

async function refreshGroups(input: Pick<LoadActions, "setGroups" | "setLoading" | "setMessage">) {
  input.setLoading(true);
  try {
    input.setGroups((await api<{ groups: TargetGroupView[] }>("/api/groups")).groups);
    input.setMessage("已刷新目标站分组，数据直接来自远端 API");
  } catch (error) {
    input.setMessage(errorMessage(error));
  } finally {
    input.setLoading(false);
  }
}

async function saveRule(input: SaveActions) {
  input.setPending(`save:${input.groupId}`);
  try {
    await api(`/api/groups/${input.groupId}/rule`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(rulePayload(input.draft)) });
    input.setGroups((await api<{ groups: TargetGroupView[] }>("/api/groups")).groups);
    input.setMessage("倍率规则已保存");
  } catch (error) {
    input.setMessage(errorMessage(error));
  } finally {
    input.setPending("");
  }
}

async function executeAction(input: ExecuteActions) {
  input.setPending(`${input.action}:${input.groupId}`);
  try {
    const body = await api<{ decision: { action: string; nextRate: number | null; reason?: string } }>(`/api/groups/${input.groupId}/${input.action}`, { method: "POST" });
    input.setMessage(decisionMessage(input.action, body.decision));
    if (input.action === "apply") input.setGroups((await api<{ groups: TargetGroupView[] }>("/api/groups")).groups);
  } catch (error) {
    input.setMessage(errorMessage(error));
  } finally {
    input.setPending("");
  }
}

function rulePayload(draft: RuleDraft) {
  return { enabled: draft.enabled, ruleVersion: 1, ruleType: draft.ruleType, parameters: { offset: Number(draft.offset), multiplier: Number(draft.multiplier), formula: draft.formula }, bindings: draft.bindings.map((binding) => ({ sourceSiteId: binding.sourceSiteId, sourceGroupId: binding.sourceGroupId })) };
}

function decisionMessage(action: string, decision: { action: string; nextRate: number | null; reason?: string }) {
  if (decision.action === "skip") return `${action === "apply" ? "执行" : "预览"}跳过：${decision.reason ?? "倍率未变化"}`;
  return `${action === "apply" ? "已应用" : "预览结果"}：${decision.nextRate}`;
}

async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> { const response = await fetch(url, { cache: "no-store", ...init }); const text = await response.text(); const body = text ? JSON.parse(text) as { error?: string } : {}; if (!response.ok) throw new Error(body.error ?? `请求失败 HTTP ${response.status}`); return body as T; }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error); }
type SetGroups = React.Dispatch<React.SetStateAction<TargetGroupView[]>>;
type LoadActions = { setGroups: SetGroups; setSites: React.Dispatch<React.SetStateAction<SourceSiteOption[]>>; setRates: React.Dispatch<React.SetStateAction<SourceRateOption[]>>; setLoading: (value: boolean) => void; setMessage: (value: string) => void };
type SaveActions = { groupId: number; draft: RuleDraft; setGroups: SetGroups; setPending: (value: string) => void; setMessage: (value: string) => void };
type ExecuteActions = { groupId: number; action: "preview" | "apply"; setGroups: SetGroups; setPending: (value: string) => void; setMessage: (value: string) => void };
