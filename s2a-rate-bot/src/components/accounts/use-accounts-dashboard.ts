"use client";

import { useEffect, useState } from "react";
import type { TargetAccountView } from "./types";

export function useAccountsDashboard() {
  const [accounts, setAccounts] = useState<TargetAccountView[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => { void refreshAccounts({ setAccounts, setLoading, setMessage }, false); }, []);
  return {
    accounts,
    loading,
    pendingId,
    message,
    refresh: () => void refreshAccounts({ setAccounts, setLoading, setMessage }, true),
    setSchedulable: (account: TargetAccountView) => void updateSchedulable({ account, setAccounts, setPendingId, setMessage }),
  };
}

async function refreshAccounts(actions: LoadActions, announce: boolean) {
  actions.setLoading(true);
  try {
    actions.setAccounts(await loadAccounts());
    if (announce) actions.setMessage("已从目标站刷新账号状态");
  } catch (error) {
    actions.setMessage(errorMessage(error));
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
    actions.setMessage(actions.account.schedulable ? "账号已暂停调度" : "账号已加入调度");
  } catch (error) {
    actions.setMessage(errorMessage(error));
  } finally {
    actions.setPendingId(null);
  }
}

async function loadAccounts() {
  return (await api<{ accounts: TargetAccountView[] }>("/api/accounts")).accounts;
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
type LoadActions = { readonly setAccounts: SetAccounts; readonly setLoading: (value: boolean) => void; readonly setMessage: (value: string) => void };
type UpdateActions = { readonly account: TargetAccountView; readonly setAccounts: SetAccounts; readonly setPendingId: (value: number | null) => void; readonly setMessage: (value: string) => void };
