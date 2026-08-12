"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import type {
  AccountGroupOption, AccountSourceBinding, AccountSourceRate, AccountSourceSite,
  AccountTestState, AccountTestSummary, TargetAccountView,
} from "./types";

export function useAccountsDashboard() {
  const [accounts, setAccounts] = useState<TargetAccountView[]>([]);
  const [groups, setGroups] = useState<AccountGroupOption[]>([]);
  const [rates, setRates] = useState<AccountSourceRate[]>([]);
  const [sites, setSites] = useState<AccountSourceSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [testPendingIds, setTestPendingIds] = useState<number[]>([]);
  const [bindingPendingId, setBindingPendingId] = useState<number | null>(null);
  const [schedulePendingId, setSchedulePendingId] = useState<number | null>(null);
  const [batchTesting, setBatchTesting] = useState(false);
  useEffect(() => { void loadDashboard({ setAccounts, setGroups, setRates, setSites, setLoading, setLoadError }, false); }, []);
  return {
    accounts, groups, rates, sites, loading, loadError, testPendingIds, bindingPendingId, schedulePendingId, batchTesting,
    refresh: () => void loadDashboard({ setAccounts, setGroups, setRates, setSites, setLoading, setLoadError }, true),
    bindSource: (account: TargetAccountView, binding: AccountSourceBinding | null) =>
      saveBinding({ account, binding, setAccounts, setBindingPendingId }),
    testChannel: (account: TargetAccountView) => void testChannel({ account, setAccounts, setTestPendingIds }),
    setSchedulable: (account: TargetAccountView, schedulable: boolean) =>
      setAccountSchedulable({ account, schedulable, setAccounts, setSchedulePendingId }),
    testAll: () => void testAllChannels({ accounts, setAccounts, setTestPendingIds, setBatchTesting }),
  };
}

async function setAccountSchedulable(input: ScheduleActions) {
  input.setSchedulePendingId(input.account.id);
  try {
    const body = await api<{ account: TargetAccountView }>(`/api/accounts/${input.account.id}/schedulable`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ schedulable: input.schedulable }),
    });
    input.setAccounts((accounts) => replaceAccount(accounts, body.account));
    toast.success(input.schedulable ? "账号调度已启用" : "账号调度已禁用");
    return true;
  } catch (error) {
    toast.error("更新账号调度失败", { description: errorMessage(error) });
    return false;
  } finally {
    input.setSchedulePendingId(null);
  }
}

async function loadDashboard(actions: LoadActions, refreshRemote: boolean) {
  actions.setLoading(true);
  actions.setLoadError("");
  try {
    const data = await fetchDashboard(refreshRemote);
    actions.setAccounts(data.accounts); actions.setGroups(data.groups);
    actions.setRates(data.rates); actions.setSites(data.sites);
    if (refreshRemote) toast.success("已从目标站刷新账号并写入本地快照");
  } catch (error) {
    actions.setLoadError(errorMessage(error));
    toast.error(errorMessage(error));
  } finally {
    actions.setLoading(false);
  }
}

async function saveBinding(input: BindingActions) {
  input.setBindingPendingId(input.account.id);
  try {
    const body = await api<{ account: TargetAccountView }>(`/api/accounts/${input.account.id}/binding`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ binding: input.binding }),
    });
    input.setAccounts((accounts) => replaceAccount(accounts, body.account));
    toast.success(input.binding ? "账号采集分组绑定已保存" : "账号采集分组绑定已清除");
    return true;
  } catch (error) {
    toast.error("保存账号采集分组绑定失败", { description: errorMessage(error) });
    return false;
  } finally {
    input.setBindingPendingId(null);
  }
}

async function testChannel(input: TestActions) {
  input.setTestPendingIds((ids) => [...new Set([...ids, input.account.id])]);
  try {
    const body = await api<{ account: TargetAccountView; test: AccountTestState }>(`/api/accounts/${input.account.id}/test`, { method: "POST" });
    input.setAccounts((accounts) => replaceAccount(accounts, body.account));
    showTestFeedback(input.account.name, body.test);
  } catch (error) {
    toast.error(`${input.account.name} 通道测试失败`, { description: errorMessage(error) });
  } finally {
    input.setTestPendingIds((ids) => ids.filter((id) => id !== input.account.id));
  }
}

async function testAllChannels(input: BatchTestActions) {
  input.setBatchTesting(true);
  input.setTestPendingIds(input.accounts.map((account) => account.id));
  try {
    const body = await api<{ accounts: TargetAccountView[]; summary: AccountTestSummary }>("/api/accounts/test-all", { method: "POST" });
    input.setAccounts(body.accounts);
    showBatchFeedback(body.summary);
  } catch (error) {
    toast.error("批量通道测试失败", { description: errorMessage(error) });
  } finally {
    input.setTestPendingIds([]);
    input.setBatchTesting(false);
  }
}

async function fetchDashboard(refreshRemote: boolean) {
  const [accounts, groups, rates, sites] = await Promise.all([
    refreshRemote ? refreshAccountSnapshots() : loadAccounts(),
    api<{ groups: AccountGroupOption[] }>("/api/groups"),
    api<{ rates: AccountSourceRate[] }>("/api/sources/rates"),
    api<{ sites: AccountSourceSite[] }>("/api/sources"),
  ]);
  return { accounts, groups: groups.groups, rates: rates.rates, sites: sites.sites };
}

function showTestFeedback(accountName: string, test: AccountTestState) {
  const title = `${accountName} ${test.status === "available" ? "通道可用" : test.status === "unavailable" ? "通道不可用" : "测试请求错误"}`;
  const options = { description: testDescription(test) };
  if (test.status === "available") toast.success(title, options);
  else toast.error(title, options);
}

function showBatchFeedback(summary: AccountTestSummary) {
  const description = `共 ${summary.total} 个，可用 ${summary.available}，不可用 ${summary.unavailable}，请求错误 ${summary.errors}`;
  if (summary.unavailable || summary.errors) toast.warning("批量测试完成", { description });
  else toast.success("批量测试完成", { description });
}

function testDescription(test: AccountTestState) {
  const details = [`${test.latencyMs} ms`];
  if (test.model) details.push(test.model);
  return `${test.message} · ${details.join(" · ")}`;
}

function replaceAccount(accounts: readonly TargetAccountView[], account: TargetAccountView) {
  return accounts.map((item) => item.id === account.id ? account : item);
}

async function loadAccounts() { return (await api<{ accounts: TargetAccountView[] }>("/api/accounts")).accounts; }
async function refreshAccountSnapshots() { return (await api<{ accounts: TargetAccountView[] }>("/api/accounts/refresh", { method: "POST" })).accounts; }
async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> { const response = await fetch(url, { cache: "no-store", ...init }); const text = await response.text(); const body = text ? JSON.parse(text) as { error?: string } : {}; if (!response.ok) throw new Error(body.error ?? `请求失败 HTTP ${response.status}`); return body as T; }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error); }
type SetAccounts = React.Dispatch<React.SetStateAction<TargetAccountView[]>>;
type SetIds = React.Dispatch<React.SetStateAction<number[]>>;
type LoadActions = { readonly setAccounts: SetAccounts; readonly setGroups: React.Dispatch<React.SetStateAction<AccountGroupOption[]>>; readonly setRates: React.Dispatch<React.SetStateAction<AccountSourceRate[]>>; readonly setSites: React.Dispatch<React.SetStateAction<AccountSourceSite[]>>; readonly setLoading: (value: boolean) => void; readonly setLoadError: (value: string) => void };
type BindingActions = { readonly account: TargetAccountView; readonly binding: AccountSourceBinding | null; readonly setAccounts: SetAccounts; readonly setBindingPendingId: (value: number | null) => void };
type ScheduleActions = { readonly account: TargetAccountView; readonly schedulable: boolean; readonly setAccounts: SetAccounts; readonly setSchedulePendingId: (value: number | null) => void };
type TestActions = { readonly account: TargetAccountView; readonly setAccounts: SetAccounts; readonly setTestPendingIds: SetIds };
type BatchTestActions = { readonly accounts: readonly TargetAccountView[]; readonly setAccounts: SetAccounts; readonly setTestPendingIds: SetIds; readonly setBatchTesting: (value: boolean) => void };
