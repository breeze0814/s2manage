"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { AccountGroupOption, TargetAccountView } from "./types";

export function useAccountsDashboard() {
  const [accounts, setAccounts] = useState<TargetAccountView[]>([]);
  const [groups, setGroups] = useState<AccountGroupOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<number | null>(null);
  useEffect(() => { void refreshAccounts({ setAccounts, setGroups, setLoading }, false); }, []);
  return {
    accounts,
    groups,
    loading,
    pendingId,
    refresh: () => void refreshAccounts({ setAccounts, setGroups, setLoading }, true),
    setSchedulable: (account: TargetAccountView) => void updateSchedulable({ account, setAccounts, setPendingId }),
  };
}

async function refreshAccounts(actions: LoadActions, announce: boolean) {
  actions.setLoading(true);
  try {
    const data = await loadDashboard(announce);
    actions.setAccounts(data.accounts);
    actions.setGroups(data.groups);
    if (announce) toast.success("已从目标站刷新账号并写入本地快照");
  } catch (error) {
    toast.error(errorMessage(error));
  } finally {
    actions.setLoading(false);
  }
}

async function updateSchedulable(actions: UpdateActions) {
  actions.setPendingId(actions.account.id);
  try {
    await api(`/api/accounts/${actions.account.id}/schedulable`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ schedulable: !actions.account.schedulable }),
    });
    actions.setAccounts(await loadAccounts());
    toast.success(actions.account.schedulable ? "账号已暂停调度" : "账号已加入调度");
  } catch (error) {
    toast.error(errorMessage(error));
  } finally {
    actions.setPendingId(null);
  }
}

async function loadAccounts() {
  return (await api<{ accounts: TargetAccountView[] }>("/api/accounts")).accounts;
}

async function loadDashboard(refreshRemote = false) {
  const [accounts, groups] = await Promise.all([
    refreshRemote ? refreshAccountSnapshots() : loadAccounts(),
    api<{ groups: AccountGroupOption[] }>("/api/groups"),
  ]);
  return { accounts, groups: groups.groups };
}

async function refreshAccountSnapshots() {
  return (await api<{ accounts: TargetAccountView[] }>("/api/accounts/refresh", { method: "POST" })).accounts;
}

async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const text = await response.text();
  const body = text ? JSON.parse(text) as { error?: string } : {};
  if (!response.ok) throw new Error(body.error ?? `请求失败 HTTP ${response.status}`);
  return body as T;
}

function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error); }
type SetAccounts = React.Dispatch<React.SetStateAction<TargetAccountView[]>>;
type SetGroups = React.Dispatch<React.SetStateAction<AccountGroupOption[]>>;
type LoadActions = { readonly setAccounts: SetAccounts; readonly setGroups: SetGroups; readonly setLoading: (value: boolean) => void };
type UpdateActions = { readonly account: TargetAccountView; readonly setAccounts: SetAccounts; readonly setPendingId: (value: number | null) => void };
