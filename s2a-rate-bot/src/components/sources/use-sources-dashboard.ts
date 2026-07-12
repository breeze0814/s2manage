"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { SourceRateView, SourceSiteForm, SourceSiteView } from "./types";

export function useSourcesDashboard() {
  const [sites, setSites] = useState<SourceSiteView[]>([]);
  const [rates, setRates] = useState<SourceRateView[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [bulkPending, setBulkPending] = useState(false);
  const [platformPending, setPlatformPending] = useState("");
  const [dialog, setDialog] = useState<DialogState>({ open: false, site: null });
  const [dialogPending, setDialogPending] = useState(false);
  const [search, setSearch] = useState("");
  useEffect(() => { void loadDashboard({ setSites, setRates, setLoading }); }, []);
  return {
    sites, rates, loading, pendingId, bulkPending, platformPending, dialog, dialogPending, search, setSearch,
    enabledCount: useMemo(() => sites.filter((site) => site.enabled).length, [sites]),
    openDialog: (site: SourceSiteView | null) => openDialog(setDialog, site),
    setDialogOpen: (open: boolean) => setDialog((current) => ({ ...current, open })),
    reload: () => void reload({ setSites, setRates, setLoading }),
    refreshSite: (site: SourceSiteView) => void refreshSite({ site, setPendingId, setSites, setRates }),
    refreshAll: () => void refreshAll({ setBulkPending, setSites, setRates }),
    setRatePlatform: (rate: SourceRateView, platform: string | null) => void setRatePlatform({ rate, platform, setPlatformPending, setRates }),
    saveSite: (form: SourceSiteForm) => void saveSite({ form, dialog, setDialog, setDialogPending, setSites, setRates }),
    deleteSite: (site: SourceSiteView) => void deleteSite({ site, setSites, setRates }),
  };
}

async function setRatePlatform(input: { rate: SourceRateView; platform: string | null; setPlatformPending: (value: string) => void; setRates: SetRates }) {
  const key = `${input.rate.sourceSiteId}:${input.rate.groupId}`;
  input.setPlatformPending(key);
  try {
    const body = await api<{ rate: SourceRateView }>("/api/sources/rates", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ siteId: input.rate.sourceSiteId, groupId: input.rate.groupId, platform: input.platform }) });
    input.setRates((rates) => rates.map((rate) => rate.sourceSiteId === body.rate.sourceSiteId && rate.groupId === body.rate.groupId ? body.rate : rate));
    toast.success("分组展示平台已更新");
  } catch (error) { toast.error(errorMessage(error)); } finally { input.setPlatformPending(""); }
}

function openDialog(setDialog: SetDialog, site: SourceSiteView | null) {
  setDialog({ open: true, site });
}

async function reload(actions: LoadActions) {
  actions.setLoading(true);
  try {
    await reloadData(actions.setSites, actions.setRates);
    toast.success("已重新读取页面数据，未请求远端采集站");
  } catch (error) {
    toast.error(errorMessage(error));
  } finally {
    actions.setLoading(false);
  }
}

async function refreshSite(input: RefreshSiteActions) {
  input.setPendingId(input.site.id);
  try {
    await api(`/api/sources/${input.site.id}/refresh`, { method: "POST" });
    await reloadData(input.setSites, input.setRates);
    toast.success(`已重新请求远端采集站「${input.site.name}」`);
  } catch (error) {
    toast.error(errorMessage(error));
  } finally {
    input.setPendingId(null);
  }
}

async function refreshAll(input: RefreshAllActions) {
  input.setBulkPending(true);
  try {
    const body = await api<{ results: Array<{ ok: boolean }> }>("/api/sources/refresh-all", { method: "POST" });
    await reloadData(input.setSites, input.setRates);
    const failed = body.results.filter((result) => !result.ok).length;
    const message = `重新请求全部远端完成：成功 ${body.results.length - failed}，失败 ${failed}`;
    if (failed > 0) toast.warning(message); else toast.success(message);
  } catch (error) {
    toast.error(errorMessage(error));
  } finally {
    input.setBulkPending(false);
  }
}

async function saveSite(input: SaveSiteActions) {
  input.setDialogPending(true);
  try {
    const path = input.dialog.site ? `/api/sources/${input.dialog.site.id}` : "/api/sources";
    await api(path, { method: input.dialog.site ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sitePayload(input.form)) });
    input.setDialog({ open: false, site: null });
    await reloadData(input.setSites, input.setRates);
    toast.success("采集站已保存");
  } catch (error) {
    toast.error(errorMessage(error));
  } finally {
    input.setDialogPending(false);
  }
}

async function deleteSite(input: DeleteSiteActions) {
  try {
    await api(`/api/sources/${input.site.id}`, { method: "DELETE" });
    await reloadData(input.setSites, input.setRates);
    toast.success("采集站已删除");
  } catch (error) {
    toast.error(errorMessage(error));
  }
}

async function loadDashboard(actions: LoadActions) {
  try { await reloadData(actions.setSites, actions.setRates); } catch (error) { toast.error(errorMessage(error)); } finally { actions.setLoading(false); }
}

async function reloadData(setSites: SetSites, setRates: SetRates) {
  const [siteBody, rateBody] = await Promise.all([api<{ sites: SourceSiteView[] }>("/api/sources"), api<{ rates: SourceRateView[] }>("/api/sources/rates")]);
  setSites(siteBody.sites);
  setRates(rateBody.rates);
}

function sitePayload(form: SourceSiteForm) { return { ...form, rechargeRatio: Number(form.rechargeRatio), intervalSeconds: Number(form.intervalSeconds) }; }
async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> { const response = await fetch(url, { cache: "no-store", ...init }); const text = await response.text(); const body = text ? JSON.parse(text) as { error?: string } : {}; if (!response.ok) throw new Error(body.error ?? `请求失败 HTTP ${response.status}`); return body as T; }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error); }
type DialogState = { open: boolean; site: SourceSiteView | null };
type SetSites = React.Dispatch<React.SetStateAction<SourceSiteView[]>>;
type SetRates = React.Dispatch<React.SetStateAction<SourceRateView[]>>;
type SetDialog = React.Dispatch<React.SetStateAction<DialogState>>;
type LoadActions = { setSites: SetSites; setRates: SetRates; setLoading: (value: boolean) => void };
type RefreshSiteActions = { site: SourceSiteView; setPendingId: (value: number | null) => void; setSites: SetSites; setRates: SetRates };
type RefreshAllActions = { setBulkPending: (value: boolean) => void; setSites: SetSites; setRates: SetRates };
type SaveSiteActions = { form: SourceSiteForm; dialog: DialogState; setDialog: SetDialog; setDialogPending: (value: boolean) => void; setSites: SetSites; setRates: SetRates };
type DeleteSiteActions = { site: SourceSiteView; setSites: SetSites; setRates: SetRates };
