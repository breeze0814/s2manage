"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { apiRequest, errorMessage, jsonRequest } from "./api";
import type { ConnectionView, HealthMonitor, HealthPolicy, HealthPolicyForm } from "./types";

export function useConnectionsDashboard() {
  const [connections, setConnections] = useState<ConnectionView[]>([]);
  const [monitors, setMonitors] = useState<HealthMonitor[]>([]);
  const [policies, setPolicies] = useState<HealthPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingKeys, setPendingKeys] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    void loadInitialData({
      setConnections, setMonitors, setPolicies, setLoading, setLoadError, setPendingKeys,
    });
  }, []);
  const context = {
    setConnections, setMonitors, setPolicies, setLoading, setLoadError, setPendingKeys,
  };
  const monitorMap = useMemo(
    () => new Map(monitors.map((monitor) => [monitor.connectionId, monitor])),
    [monitors],
  );
  return {
    connections, policies, loading, loadError, pendingKeys, monitorMap,
    isPending: (key: string) => pendingKeys.has(key),
    ...connectionCommands(context),
    ...policyCommands(context),
    connectionCreated: (connection: ConnectionView) => setConnections(
      (current) => [connection, ...current.filter((item) => item.id !== connection.id)],
    ),
  };
}

function connectionCommands(context: DashboardContext) {
  return {
    reload: () => runCommand(context, "reload", async () => {
      await reloadDashboard(context);
      toast.success("对接治理数据已刷新");
    }),
    assignPolicy: (connectionId: string, policyId: number | null) => runMutation({
      context, key: `policy:${connectionId}`,
      mutation: () => apiRequest(`/api/connections/${connectionId}/policy`, jsonRequest("PUT", { policyId })),
      successMessage: policyId === null ? "健康策略已取消" : "健康策略已分配",
    }),
    probe: (connection: ConnectionView) => runProbe(context, connection),
    act: (connection: ConnectionView, action: "suspend" | "restore") => runMutation({
      context, key: `action:${connection.id}`,
      mutation: () => apiRequest(`/api/connections/${connection.id}/action`, jsonRequest("POST", { action })),
      successMessage: action === "suspend" ? "目标账号调度已暂停" : "目标账号调度已恢复",
    }),
    disconnect: (connection: ConnectionView, mode: "unlink" | "full", removePricingMapping: boolean) => runMutation({
      context, key: `disconnect:${connection.id}`,
      mutation: () => apiRequest(`/api/connections/${connection.id}`, jsonRequest("DELETE", { mode, removePricingMapping })),
      successMessage: mode === "full" ? "真实连接及远端资源已删除" : "本地连接已解除",
    }),
  };
}

function policyCommands(context: DashboardContext) {
  return {
    savePolicy: (policy: HealthPolicy | null, form: HealthPolicyForm) => {
      const path = policy ? `/api/connection-health/policies/${policy.id}` : "/api/connection-health/policies";
      return runMutation({
        context, key: `save-policy:${policy?.id ?? "new"}`,
        mutation: () => apiRequest(path, jsonRequest(policy ? "PUT" : "POST", policyPayload(form))),
        successMessage: "健康策略已保存",
      });
    },
    deletePolicy: (policy: HealthPolicy) => runMutation({
      context, key: `delete-policy:${policy.id}`,
      mutation: () => apiRequest(`/api/connection-health/policies/${policy.id}`, { method: "DELETE" }),
      successMessage: "健康策略已删除",
    }),
  };
}

async function runProbe(context: DashboardContext, connection: ConnectionView) {
  return runCommand(context, `probe:${connection.id}`, async () => {
    const result = await mutateAndReload(
      () => apiRequest<{ success: boolean }>(`/api/connections/${connection.id}/probe`, { method: "POST" }),
      () => reloadDashboard(context),
    );
    if (result.success) toast.success("连接探测成功");
    else toast.warning("连接探测未通过");
  });
}

function runMutation(options: Readonly<{
  context: DashboardContext;
  key: string;
  mutation: () => Promise<unknown>;
  successMessage: string;
}>) {
  return runCommand(options.context, options.key, async () => {
    await mutateAndReload(options.mutation, () => reloadDashboard(options.context));
    toast.success(options.successMessage);
  });
}

async function loadInitialData(context: DashboardContext) {
  try { await reloadDashboard(context); }
  catch (error) { toast.error(errorMessage(error)); }
  finally { context.setLoading(false); }
}

async function reloadDashboard(context: DashboardContext) {
  try {
    const [connectionBody, healthBody, policyBody] = await Promise.all([
      apiRequest<{ connections: ConnectionView[] }>("/api/connections"),
      apiRequest<{ monitors: HealthMonitor[] }>("/api/connection-health"),
      apiRequest<{ policies: HealthPolicy[] }>("/api/connection-health/policies"),
    ]);
    context.setConnections(connectionBody.connections);
    context.setMonitors(healthBody.monitors);
    context.setPolicies(policyBody.policies);
    context.setLoadError(null);
  } catch (error) {
    context.setLoadError(errorMessage(error));
    throw error;
  }
}

async function runCommand(context: DashboardContext, key: string, task: () => Promise<void>) {
  context.setPendingKeys((current) => addPending(current, key));
  try { await task(); return true; }
  catch (error) { console.error(error); toast.error(errorMessage(error)); return false; }
  finally { context.setPendingKeys((current) => removePending(current, key)); }
}

async function mutateAndReload<T>(mutation: () => Promise<T>, reload: () => Promise<void>) {
  let result: T;
  try {
    result = await mutation();
  } catch (error) {
    try { await reload(); }
    catch (reloadError) {
      throw new AggregateError([error, reloadError], `${errorMessage(error)}；状态刷新失败: ${errorMessage(reloadError)}`);
    }
    throw error;
  }
  await reload();
  return result;
}

function addPending(current: ReadonlySet<string>, key: string) { return new Set([...current, key]); }
function removePending(current: ReadonlySet<string>, key: string) { const next = new Set(current); next.delete(key); return next; }
function policyPayload(form: HealthPolicyForm) { return { name: form.name, enabled: form.enabled, intervalSeconds: Number(form.intervalSeconds), failureThreshold: Number(form.failureThreshold), recoveryThreshold: Number(form.recoveryThreshold), autoSuspend: form.autoSuspend, autoRestore: form.autoRestore }; }

type SetState<T> = React.Dispatch<React.SetStateAction<T>>;
type DashboardContext = Readonly<{
  setConnections: SetState<ConnectionView[]>;
  setMonitors: SetState<HealthMonitor[]>;
  setPolicies: SetState<HealthPolicy[]>;
  setLoading: (value: boolean) => void;
  setLoadError: (value: string | null) => void;
  setPendingKeys: SetState<ReadonlySet<string>>;
}>;
