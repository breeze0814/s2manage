"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, CheckCircle2, Loader2, Play, Plus, RefreshCw, Save, Search, Trash2, XCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";

type CollectionSite = {
  id: number;
  connectionId: number;
  name: string;
  baseUrl: string;
  siteType: string;
  email: string;
  newApiUserId?: string | null;
  authMode: string;
  enabled: boolean;
  intervalMin: number;
  rechargeRatio: number;
  proxyUrl?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  tokenExpire?: bigint | number | string | null;
  lastRunAt?: Date | string | null;
  lastStatus?: string | null;
  lastError?: string | null;
  consecutiveFailures: number;
  lastSuccessAt?: Date | string | null;
};

type TargetGroup = { id: number; name: string; rate_multiplier?: number | null };
type BlRate = {
  site_id: number;
  site_name: string;
  group_id: string;
  name: string;
  platform: string | null;
  recharge_ratio?: number | null;
  rate_multiplier: number | null;
  user_rate?: number | null;
  effective_rate: number | null;
  actual_rate_multiplier: number | null;
  actual_user_rate?: number | null;
  actual_effective_rate?: number | null;
};
type BlChange = {
  id?: number;
  created_at: string;
  site_id: number;
  site_name: string;
  group_id: string;
  group_name: string | null;
  platform: string | null;
  old_value: string | null;
  new_value: string | null;
  actual_old_value: number | null;
  actual_new_value: number | null;
};

type PagerProps = {
  page: number;
  pageSize: number;
  total: number;
  pageSizeLabel: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

type SiteForm = {
  id?: number;
  name: string;
  baseUrl: string;
  siteType: "sub2api" | "new_api";
  authMode: "password" | "manual_token";
  email: string;
  password: string;
  newApiUserId: string;
  enabled: boolean;
  intervalMin: string;
  rechargeRatio: string;
  proxyUrl: string;
  accessToken: string;
  refreshToken: string;
  tokenExpire: string;
};

const defaultForm: SiteForm = {
  name: "",
  baseUrl: "",
  siteType: "sub2api",
  authMode: "password",
  email: "",
  password: "",
  newApiUserId: "",
  enabled: true,
  intervalMin: "5",
  rechargeRatio: "1",
  proxyUrl: "",
  accessToken: "",
  refreshToken: "",
  tokenExpire: "",
};

const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 50;
const RATE_PAGE_SIZE_STORAGE_KEY = "s2a.blSync.ratePageSize";
const CHANGE_PAGE_SIZE_STORAGE_KEY = "s2a.blSync.changePageSize";

function finiteNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeRateByRechargeRatio(value: unknown, rechargeRatio: unknown) {
  const numeric = finiteNumber(value);
  if (numeric === null) return null;
  const ratio = finiteNumber(rechargeRatio);
  return ratio && ratio > 0 ? numeric / ratio : numeric;
}

function getRateValue(row: BlRate | undefined) {
  const actual = finiteNumber(row?.actual_rate_multiplier);
  if (actual !== null) return actual;
  return normalizeRateByRechargeRatio(row?.rate_multiplier, row?.recharge_ratio);
}

function getEffectiveRateValue(row: BlRate | undefined) {
  const actual = finiteNumber(row?.actual_effective_rate);
  if (actual !== null) return actual;
  return normalizeRateByRechargeRatio(row?.effective_rate, row?.recharge_ratio);
}

function buildRateSearchText(rate: BlRate) {
  return [
    rate.site_name,
    rate.site_id,
    rate.group_id,
    rate.name,
    rate.platform ?? "",
    rate.recharge_ratio,
    rate.rate_multiplier,
    rate.effective_rate,
    rate.user_rate,
    rate.actual_rate_multiplier,
    rate.actual_user_rate,
    rate.actual_effective_rate,
  ]
    .map((value) => String(value ?? ""))
    .join(" ")
    .toLowerCase();
}

function formatRate(value: unknown) {
  const numeric = finiteNumber(value);
  return numeric === null ? "-" : numeric.toFixed(4).replace(/\.?0+$/, "");
}

function formatDateTime(value: unknown) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toLocaleString("zh-CN", { hour12: false }) : "-";
}

function statusText(status?: string | null) {
  if (status === "online") return "在线";
  if (status === "offline") return "离线";
  return "未采集";
}

function splitNewApiTokenForForm(site?: CollectionSite | null) {
  const accessToken = site?.accessToken ?? "";
  if (site?.siteType !== "new_api") return { accessToken, userId: "" };

  const separatorIndex = accessToken.indexOf("::");
  if (separatorIndex < 0) return { accessToken, userId: "" };

  return {
    accessToken: accessToken.slice(0, separatorIndex),
    userId: accessToken.slice(separatorIndex + 2).trim(),
  };
}

function toForm(site?: CollectionSite | null): SiteForm {
  if (!site) return { ...defaultForm };
  const token = splitNewApiTokenForForm(site);
  return {
    id: site.id,
    name: site.name,
    baseUrl: site.baseUrl,
    siteType: site.siteType === "new_api" ? "new_api" : "sub2api",
    authMode: site.authMode === "manual_token" ? "manual_token" : "password",
    email: site.email ?? "",
    password: "",
    newApiUserId: site.newApiUserId?.trim() || token.userId,
    enabled: site.enabled,
    intervalMin: String(site.intervalMin ?? 60),
    rechargeRatio: String(site.rechargeRatio ?? 1),
    proxyUrl: site.proxyUrl ?? "",
    accessToken: token.accessToken,
    refreshToken: site.refreshToken ?? "",
    tokenExpire: site.tokenExpire ? String(site.tokenExpire) : "",
  };
}

function siteTypeLabel(value: string) {
  return value === "new_api" ? "New API" : "Sub2API";
}

function clampPageSize(value: unknown, fallback = DEFAULT_PAGE_SIZE) {
  const numeric = Number(value);
  return PAGE_SIZE_OPTIONS.includes(numeric as (typeof PAGE_SIZE_OPTIONS)[number]) ? numeric : fallback;
}

function readStoredPageSize(key: string, fallback = DEFAULT_PAGE_SIZE) {
  if (typeof window === "undefined") return fallback;
  return clampPageSize(window.localStorage.getItem(key), fallback);
}

function writeStoredPageSize(key: string, value: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, String(value));
}

function ruleSyncStatus(result: unknown) {
  const ruleSync = (result as { ruleSync?: { ok?: boolean; summary?: Record<string, unknown> } | null })?.ruleSync;
  const summary = ruleSync?.summary;
  const failed = Number(summary?.failedGroupRules ?? 0) + Number(summary?.failedAccountRules ?? 0) + Number(summary?.failedPriorityRules ?? 0);
  return { ok: ruleSync?.ok !== false, failed };
}

function PaginationControls({ page, pageSize, total, pageSizeLabel, onPageChange, onPageSizeChange }: PagerProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(page, 1), pageCount);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(total, safePage * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 px-4 py-3 text-sm">
      <div className="text-muted-foreground">
        显示 {start}-{end} / {total} 条
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground">{pageSizeLabel}</span>
        <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(clampPageSize(value))}>
          <SelectTrigger className="h-8 w-[92px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((option) => (
              <SelectItem key={option} value={String(option)}>
                {option} 条
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => onPageChange(safePage - 1)} disabled={safePage <= 1}>
          上一页
        </Button>
        <span className="min-w-16 text-center text-muted-foreground">
          {safePage}/{pageCount}
        </span>
        <Button variant="outline" size="sm" onClick={() => onPageChange(safePage + 1)} disabled={safePage >= pageCount}>
          下一页
        </Button>
      </div>
    </div>
  );
}

export function BlSyncPanel({ connectionId }: { connectionId: number }) {
  const utils = trpc.useUtils();
  const { showToast } = useToast();
  const [selectedSiteId, setSelectedSiteId] = useState<string>("__all__");
  const [editingSite, setEditingSite] = useState<CollectionSite | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<SiteForm>(defaultForm);
  const [formError, setFormError] = useState("");
  const [rateSearch, setRateSearch] = useState("");
  const [selectedPlatform, setSelectedPlatform] = useState<string>("__all__");
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [selectedRateKey, setSelectedRateKey] = useState<string>("");
  const [ratePage, setRatePage] = useState(1);
  const [ratePageSize, setRatePageSize] = useState(DEFAULT_PAGE_SIZE);
  const [changePage, setChangePage] = useState(1);
  const [changePageSize, setChangePageSize] = useState(DEFAULT_PAGE_SIZE);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [syncError, setSyncError] = useState("");

  const siteId = selectedSiteId === "__all__" ? undefined : Number(selectedSiteId);
  const changeOffset = (changePage - 1) * changePageSize;
  const { data: sites, isLoading: sitesLoading } = trpc.bl.collectionSites.useQuery({ connectionId });
  const { data: siteBalances, isLoading: balancesLoading, isFetching: balancesFetching } = trpc.bl.collectionSiteBalances.useQuery(
    { connectionId },
    { staleTime: 60_000, refetchOnWindowFocus: false },
  );
  const { data: rates, isLoading: ratesLoading, refetch: refetchRates } = trpc.bl.rates.useQuery({ connectionId, siteId });
  const { data: changesResult, isLoading: changesLoading } = trpc.bl.changes.useQuery({ connectionId, siteId, limit: changePageSize, offset: changeOffset });
  const { data: groups, isLoading: groupsLoading } = trpc.groups.list.useQuery({ connectionId });

  useEffect(() => {
    setRatePageSize(readStoredPageSize(RATE_PAGE_SIZE_STORAGE_KEY));
    setChangePageSize(readStoredPageSize(CHANGE_PAGE_SIZE_STORAGE_KEY));
  }, []);

  useEffect(() => {
    setSelectedSiteId("__all__");
    setRateSearch("");
    setSelectedPlatform("__all__");
    setSelectedGroupId("");
    setSelectedRateKey("");
    setRatePage(1);
    setChangePage(1);
  }, [connectionId]);

  const invalidateCollection = async () => {
    await Promise.all([
      utils.bl.collectionSites.invalidate({ connectionId }),
      utils.bl.collectionSiteBalances.invalidate({ connectionId }),
      utils.bl.sites.invalidate({ connectionId }),
      utils.bl.rates.invalidate({ connectionId }),
      utils.bl.changes.invalidate(),
      utils.bl.health.invalidate({ connectionId }),
      utils.serviceStatus.overview.invalidate({ connectionId }),
      utils.groups.list.invalidate({ connectionId }),
      utils.accounts.list.invalidate({ connectionId }),
      utils.bl.bindings.invalidate({ connectionId, targetType: "group" }),
      utils.bl.bindings.invalidate({ connectionId, targetType: "account" }),
      utils.sync.logs.invalidate(),
    ]);
  };

  const saveSite = trpc.bl.saveCollectionSite.useMutation({
    onSuccess: async () => {
      setFormOpen(false);
      setEditingSite(null);
      setForm(defaultForm);
      setFormError("");
      await invalidateCollection();
      showToast({ title: "采集源已保存", variant: "success" });
    },
    onError: (error) => {
      setFormError(error.message);
      showToast({ title: "保存采集源失败", description: error.message, variant: "error" });
    },
  });
  const deleteSite = trpc.bl.deleteCollectionSite.useMutation({
    onSuccess: async () => {
      setSelectedSiteId("__all__");
      await invalidateCollection();
      showToast({ title: "采集源已删除", variant: "success" });
    },
    onError: (error) => showToast({ title: "删除采集源失败", description: error.message, variant: "error" }),
  });
  const testSite = trpc.bl.testCollectionSite.useMutation({
    onSuccess: (result) => {
      showToast({ title: result.ok ? "采集源连接成功" : "采集源连接失败", description: result.message, variant: result.ok ? "success" : "error" });
    },
    onError: (error) => showToast({ title: "测试采集源失败", description: error.message, variant: "error" }),
  });
  const collectSite = trpc.bl.collectSite.useMutation({
    onSuccess: async (result) => {
      setChangePage(1);
      await invalidateCollection();
      const ruleSync = ruleSyncStatus(result);
      showToast({
        title: result.ok && ruleSync.ok ? "采集完成" : result.ok ? "采集完成，规则应用失败" : "采集失败",
        description: ruleSync.failed > 0 ? `${result.message}；${ruleSync.failed} 条倍率规则应用失败` : result.message,
        variant: result.ok && ruleSync.ok ? "success" : "error",
      });
    },
    onError: (error) => showToast({ title: "采集失败", description: error.message, variant: "error" }),
  });
  const collectAll = trpc.bl.collectAll.useMutation({
    onSuccess: async (result) => {
      setChangePage(1);
      await invalidateCollection();
      const ruleSync = ruleSyncStatus(result);
      showToast({
        title: result.success === result.total && ruleSync.ok ? "采集任务完成" : "采集任务完成，存在失败",
        description: ruleSync.failed > 0 ? `成功 ${result.success}/${result.total}；${ruleSync.failed} 条倍率规则应用失败` : `成功 ${result.success}/${result.total}`,
        variant: result.success === result.total && ruleSync.ok ? "success" : "error",
      });
    },
    onError: (error) => showToast({ title: "批量采集失败", description: error.message, variant: "error" }),
  });
  const sync = trpc.bl.syncToTarget.useMutation({
    onSuccess: async () => {
      setSelectedRateKey("");
      setConfirmOpen(false);
      setSyncError("");
      await Promise.all([
        utils.groups.list.invalidate({ connectionId }),
        utils.sync.logs.invalidate(),
      ]);
      showToast({ title: "倍率已同步", variant: "success" });
    },
    onError: (error) => {
      setSyncError(error.message);
      showToast({ title: "同步倍率失败", description: error.message, variant: "error" });
    },
  });

  const sitesList = useMemo<CollectionSite[]>(() => (Array.isArray(sites) ? sites : []), [sites]);
  const balanceBySiteId = useMemo(() => {
    const map = new Map<number, NonNullable<typeof siteBalances>[number]>();
    for (const balance of siteBalances ?? []) map.set(balance.siteId, balance);
    return map;
  }, [siteBalances]);
  const ratesList = useMemo<BlRate[]>(() => (Array.isArray(rates) ? rates : []), [rates]);
  const changesList = useMemo<BlChange[]>(() => (Array.isArray(changesResult?.changes) ? changesResult.changes : []), [changesResult]);
  const changesTotal = changesResult?.total ?? 0;
  const groupsList: TargetGroup[] = Array.isArray(groups) ? groups : (groups as unknown as { data?: TargetGroup[] })?.data ?? [];
  const rateQuery = rateSearch.trim().toLowerCase();
  const platformOptions = useMemo(
    () =>
      Array.from(
        new Set(
          ratesList
            .map((rate) => rate.platform?.trim())
            .filter((value): value is string => Boolean(value)),
        ),
      ).sort((left, right) => left.localeCompare(right, "zh-Hans-CN")),
    [ratesList],
  );
  const enabledSites = sitesList.filter((site) => site.enabled).length;
  const onlineSites = sitesList.filter((site) => site.lastStatus === "online").length;
  const selectedSourceSite = selectedSiteId === "__all__" ? undefined : sitesList.find((site) => site.id === siteId);
  const filteredRatesList = useMemo(
    () =>
      ratesList.filter((rate) => {
        const platform = rate.platform?.trim() ?? "";
        if (selectedPlatform !== "__all__") {
          if (selectedPlatform === "__empty__") {
            if (platform) return false;
          } else if (platform !== selectedPlatform) {
            return false;
          }
        }
        if (!rateQuery) return true;
        return buildRateSearchText(rate).includes(rateQuery);
      }),
    [rateQuery, ratesList, selectedPlatform],
  );
  const ratesWithKeys = useMemo(() => filteredRatesList.map((rate, index) => ({ key: `${rate.site_id}-${rate.group_id}-${index}`, rate })), [filteredRatesList]);
  const ratePageCount = Math.max(1, Math.ceil(ratesWithKeys.length / ratePageSize));
  const pagedRatesWithKeys = useMemo(
    () => ratesWithKeys.slice((ratePage - 1) * ratePageSize, ratePage * ratePageSize),
    [ratePage, ratePageSize, ratesWithKeys],
  );
  const selectedRate = ratesWithKeys.find((item) => item.key === selectedRateKey)?.rate;
  const selectedTarget = groupsList.find((group) => group.id === Number.parseInt(selectedGroupId, 10));
  const nextRate = getRateValue(selectedRate);

  useEffect(() => {
    if (selectedRateKey && !ratesWithKeys.some((item) => item.key === selectedRateKey)) {
      setSelectedRateKey("");
    }
  }, [ratesWithKeys, selectedRateKey]);

  useEffect(() => {
    setRatePage(1);
  }, [ratePageSize, rateQuery, selectedPlatform, selectedSiteId]);

  useEffect(() => {
    if (ratePage > ratePageCount) setRatePage(ratePageCount);
  }, [ratePage, ratePageCount]);

  useEffect(() => {
    setChangePage(1);
  }, [changePageSize, connectionId, selectedSiteId]);

  useEffect(() => {
    const pageCount = Math.max(1, Math.ceil(changesTotal / changePageSize));
    if (changePage > pageCount) setChangePage(pageCount);
  }, [changePage, changePageSize, changesTotal]);

  const handleRatePageSizeChange = (pageSize: number) => {
    setRatePage(1);
    setRatePageSize(pageSize);
    writeStoredPageSize(RATE_PAGE_SIZE_STORAGE_KEY, pageSize);
  };

  const handleChangePageSizeChange = (pageSize: number) => {
    setChangePage(1);
    setChangePageSize(pageSize);
    writeStoredPageSize(CHANGE_PAGE_SIZE_STORAGE_KEY, pageSize);
  };

  const openCreate = () => {
    setEditingSite(null);
    setForm({ ...defaultForm });
    setFormError("");
    setFormOpen(true);
  };

  const openEdit = (site: CollectionSite) => {
    setEditingSite(site);
    setForm(toForm(site));
    setFormError("");
    setFormOpen(true);
  };

  const handleSaveSite = () => {
    setFormError("");
    const intervalMin = Number(form.intervalMin);
    const rechargeRatio = Number(form.rechargeRatio);
    if (!form.name.trim()) {
      setFormError("请填写采集源名称");
      return;
    }
    if (!/^https?:\/\//i.test(form.baseUrl.trim())) {
      setFormError("源站地址必须以 http:// 或 https:// 开头");
      return;
    }
    if (!Number.isInteger(intervalMin) || intervalMin < 1) {
      setFormError("采集间隔必须是大于 0 的整数分钟");
      return;
    }
    if (!Number.isFinite(rechargeRatio) || rechargeRatio <= 0) {
      setFormError("充值倍率必须大于 0");
      return;
    }
    if (form.proxyUrl.trim() && !/^https?:\/\//i.test(form.proxyUrl.trim())) {
      setFormError("代理地址必须以 http:// 或 https:// 开头，留空表示直连");
      return;
    }
    saveSite.mutate({
      id: form.id,
      connectionId,
      name: form.name.trim(),
      baseUrl: form.baseUrl.trim().replace(/\/+$/, ""),
      siteType: form.siteType,
      authMode: form.authMode,
      email: form.email.trim(),
      password: form.password,
      newApiUserId: form.newApiUserId.trim(),
      enabled: form.enabled,
      intervalMin,
      rechargeRatio,
      proxyUrl: form.proxyUrl.trim(),
      accessToken: form.accessToken.trim(),
      refreshToken: form.refreshToken.trim(),
      tokenExpire: form.tokenExpire.trim(),
    });
  };

  const openConfirm = () => {
    setSyncError("");
    if (!selectedGroupId || !selectedRate || nextRate === null) {
      setSyncError("请选择有效的采集倍率和目标分组");
      return;
    }
    setConfirmOpen(true);
  };

  const handleSync = () => {
    if (!selectedRate || !selectedTarget || nextRate === null) return;
    sync.mutate({
      connectionId,
      groupId: selectedTarget.id,
      rateMultiplier: nextRate,
      sourceSiteId: selectedRate.site_id,
      sourceSiteName: selectedRate.site_name,
      sourceGroupId: selectedRate.group_id,
      sourceGroupName: selectedRate.name,
    });
  };

  const handleRefreshRates = async () => {
    const result = await refetchRates();
    if (result.error) {
      showToast({ title: "刷新倍率失败", description: result.error.message, variant: "error" });
      return;
    }
    showToast({ title: "倍率列表已刷新", variant: "success" });
  };

  const collecting = collectSite.isPending || collectAll.isPending;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">倍率采集</h2>
          <p className="text-sm text-muted-foreground">采集源站分组倍率，供规则绑定、自动同步和手动写入使用。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => collectAll.mutate({ connectionId })} disabled={collecting || sitesList.length === 0}>
            {collectAll.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            全部采集
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            添加采集源
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Card className="h-full">
          <CardContent className="flex min-h-20 flex-col justify-center p-4">
            <div className="text-sm text-muted-foreground">采集源</div>
            <div className="mt-1 text-2xl font-semibold">{sitesList.length}</div>
          </CardContent>
        </Card>
        <Card className="h-full">
          <CardContent className="flex min-h-20 flex-col justify-center p-4">
            <div className="text-sm text-muted-foreground">启用</div>
            <div className="mt-1 text-2xl font-semibold">{enabledSites}</div>
          </CardContent>
        </Card>
        <Card className="h-full">
          <CardContent className="flex min-h-20 flex-col justify-center p-4">
            <div className="text-sm text-muted-foreground">在线</div>
            <div className="mt-1 text-2xl font-semibold">{onlineSites}</div>
          </CardContent>
        </Card>
        <Card className="h-full">
          <CardContent className="flex min-h-20 flex-col justify-center p-4">
            <div className="text-sm text-muted-foreground">当前倍率</div>
            <div className="mt-1 text-2xl font-semibold">{ratesList.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">采集源站</CardTitle>
          {sitesLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
        </CardHeader>
        <CardContent className="p-0">
          {sitesList.length === 0 ? (
            <div className="p-5 text-sm text-muted-foreground">暂无采集源。添加源站后即可把倍率数据采集到 S2A Manager 本地。</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>间隔</TableHead>
                  <TableHead>充值倍率</TableHead>
                  <TableHead className="text-right">余额</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>最近成功</TableHead>
                  <TableHead className="w-56 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sitesList.map((site) => (
                  <TableRow key={site.id}>
                    <TableCell>
                      <button type="button" className="max-w-[260px] text-left" onClick={() => setSelectedSiteId(String(site.id))}>
                        <span className="block truncate font-medium">{site.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{site.baseUrl}</span>
                      </button>
                    </TableCell>
                    <TableCell>{siteTypeLabel(site.siteType)}</TableCell>
                    <TableCell className="font-mono">{site.intervalMin}m</TableCell>
                    <TableCell className="font-mono">{formatRate(site.rechargeRatio)}</TableCell>
                    <TableCell className="text-right">
                      {(() => {
                        const balance = balanceBySiteId.get(site.id);
                        if (!balance) {
                          return balancesLoading || balancesFetching ? (
                            <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-muted-foreground" />
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          );
                        }
                        if (balance.status === "ok") {
                          return <span className="font-mono">{formatRate(balance.balance)}</span>;
                        }
                        const label = balance.status === "unsupported" ? "不支持" : "失败";
                        return (
                          <span className="text-xs text-muted-foreground" title={balance.message ?? undefined}>
                            {label}
                          </span>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      <span
                        className={
                          site.lastStatus === "online"
                            ? "text-teal-700 dark:text-teal-300"
                            : site.lastStatus === "offline"
                              ? "text-destructive"
                              : "text-muted-foreground"
                        }
                      >
                        {statusText(site.lastStatus)}
                      </span>
                      {site.lastError ? <div className="max-w-[220px] truncate text-xs text-muted-foreground" title={site.lastError}>{site.lastError}</div> : null}
                    </TableCell>
                    <TableCell>{formatDateTime(site.lastSuccessAt)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => testSite.mutate({ connectionId, id: site.id })} disabled={testSite.isPending}>
                          {testSite.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                          测试
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => collectSite.mutate({ connectionId, id: site.id })} disabled={collecting || !site.enabled}>
                          {collectSite.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                          采集
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(site)}>
                          编辑
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm(`确定删除采集源「${site.name}」？`)) deleteSite.mutate({ connectionId, id: site.id });
                          }}
                          disabled={deleteSite.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">采集倍率</CardTitle>
            <div className="text-sm text-muted-foreground">
              显示 {ratesWithKeys.length}/{ratesList.length} 条
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-auto">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={rateSearch}
                onChange={(event) => {
                  setRateSearch(event.target.value);
                  setSelectedRateKey("");
                }}
                placeholder="搜索分组、站点、平台、倍率"
                className="w-full pl-9 sm:w-[260px]"
              />
            </div>
            <Select
              value={selectedPlatform}
              onValueChange={(value) => {
                setSelectedPlatform(value);
                setSelectedRateKey("");
              }}
            >
              <SelectTrigger className="w-full sm:w-[170px]">
                <SelectValue placeholder="全部平台" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">全部平台</SelectItem>
                <SelectItem value="__empty__">未标记平台</SelectItem>
                {platformOptions.map((platform) => (
                  <SelectItem key={platform} value={platform}>
                    {platform}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={selectedSiteId}
              onValueChange={(value) => {
                setSelectedSiteId(value);
                setSelectedRateKey("");
              }}
            >
              <SelectTrigger className="w-full sm:w-[220px]">
                <SelectValue placeholder="筛选采集源" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">全部采集源</SelectItem>
                {sitesList.map((site) => (
                  <SelectItem key={site.id} value={String(site.id)}>{site.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedGroupId} onValueChange={setSelectedGroupId} disabled={groupsLoading}>
              <SelectTrigger className="w-full sm:w-[220px]">
                <SelectValue placeholder="目标分组" />
              </SelectTrigger>
              <SelectContent>
                {groupsList.map((group) => (
                  <SelectItem key={group.id} value={String(group.id)}>
                    {group.name} ({formatRate(group.rate_multiplier ?? 1)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={handleRefreshRates} disabled={ratesLoading}>
              {ratesLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              刷新
            </Button>
            <Button size="sm" onClick={openConfirm} disabled={!selectedRateKey || !selectedGroupId || sync.isPending}>
              <ArrowRightLeft className="h-4 w-4" />
              同步选中倍率
            </Button>
            {(rateQuery || selectedPlatform !== "__all__") ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setRateSearch("");
                  setSelectedPlatform("__all__");
                  setSelectedRateKey("");
                }}
              >
                清空
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {ratesLoading ? (
            <div className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载倍率...
            </div>
          ) : ratesList.length === 0 ? (
            <div className="p-5 text-sm text-muted-foreground">暂无倍率数据。先执行一次采集。</div>
          ) : ratesWithKeys.length === 0 ? (
            <div className="flex flex-col gap-3 p-5 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>没有找到匹配的倍率记录，请调整查找条件。</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setRateSearch("");
                  setSelectedPlatform("__all__");
                  setSelectedRateKey("");
                }}
              >
                清空筛选
              </Button>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12" />
                    <TableHead>采集源 / 分组</TableHead>
                    <TableHead>平台</TableHead>
                    <TableHead className="text-right">写入倍率</TableHead>
                    <TableHead className="text-right">原始倍率</TableHead>
                    <TableHead className="text-right">生效倍率</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedRatesWithKeys.map(({ key, rate }) => {
                    const canSync = getRateValue(rate) !== null;
                    return (
                      <TableRow
                        key={key}
                        className={selectedRateKey === key ? "bg-primary/5" : ""}
                        onClick={() => {
                          if (!canSync) return;
                          setSelectedRateKey(key);
                          setSyncError("");
                        }}
                      >
                        <TableCell>
                          <input
                            type="radio"
                            checked={selectedRateKey === key}
                            disabled={!canSync}
                            onChange={() => setSelectedRateKey(key)}
                            aria-label="选择采集倍率"
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          <span className="block">{rate.name || rate.group_id}</span>
                          <span className="block text-xs text-muted-foreground">{rate.site_name} / #{rate.group_id}</span>
                        </TableCell>
                        <TableCell>{rate.platform || "-"}</TableCell>
                        <TableCell className="text-right font-mono">{formatRate(getRateValue(rate))}</TableCell>
                        <TableCell className="text-right font-mono">{formatRate(rate.rate_multiplier)}</TableCell>
                        <TableCell className="text-right font-mono">{formatRate(getEffectiveRateValue(rate))}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <PaginationControls
                page={ratePage}
                pageSize={ratePageSize}
                total={ratesWithKeys.length}
                pageSizeLabel="每页倍率"
                onPageChange={setRatePage}
                onPageSizeChange={handleRatePageSizeChange}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">倍率变更</CardTitle>
          <div className="text-sm text-muted-foreground">
            共 {changesTotal} 条
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {changesLoading ? (
            <div className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载变更...
            </div>
          ) : changesList.length === 0 ? (
            <div className="p-5 text-sm text-muted-foreground">暂无倍率变更记录。</div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>时间</TableHead>
                    <TableHead>采集源 / 分组</TableHead>
                    <TableHead>平台</TableHead>
                    <TableHead className="text-right">旧倍率</TableHead>
                    <TableHead className="text-right">新倍率</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {changesList.map((change, index) => (
                    <TableRow key={change.id ?? `${change.site_id}-${change.group_id}-${change.created_at}-${index}`}>
                      <TableCell className="text-xs text-muted-foreground">{formatDateTime(change.created_at)}</TableCell>
                      <TableCell>
                        <span className="block font-medium">{change.group_name || change.group_id}</span>
                        <span className="block text-xs text-muted-foreground">{change.site_name} / #{change.group_id}</span>
                      </TableCell>
                      <TableCell>{change.platform || "-"}</TableCell>
                      <TableCell className="text-right font-mono">{formatRate(change.actual_old_value ?? change.old_value)}</TableCell>
                      <TableCell className="text-right font-mono">{formatRate(change.actual_new_value ?? change.new_value)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <PaginationControls
                page={changePage}
                pageSize={changePageSize}
                total={changesTotal}
                pageSizeLabel="每页变更"
                onPageChange={setChangePage}
                onPageSizeChange={handleChangePageSizeChange}
              />
            </>
          )}
        </CardContent>
      </Card>

      {syncError ? <p className="text-sm text-destructive">{syncError}</p> : null}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingSite ? "编辑采集源" : "添加采集源"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>名称</Label>
              <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>源站地址</Label>
              <Input value={form.baseUrl} onChange={(event) => setForm((current) => ({ ...current, baseUrl: event.target.value }))} placeholder="https://example.com" />
            </div>
            <div className="space-y-2">
              <Label>源站类型</Label>
              <Select value={form.siteType} onValueChange={(value) => setForm((current) => ({ ...current, siteType: value as SiteForm["siteType"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sub2api">Sub2API</SelectItem>
                  <SelectItem value="new_api">New API</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>认证方式</Label>
              <Select value={form.authMode} onValueChange={(value) => setForm((current) => ({ ...current, authMode: value as SiteForm["authMode"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="password">自动登录</SelectItem>
                  <SelectItem value="manual_token">手动 Token</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{form.siteType === "new_api" ? "用户名" : "邮箱"}</Label>
              <Input value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
            </div>
            {form.siteType === "new_api" ? (
              <div className="space-y-2">
                <Label>New-Api-User</Label>
                <Input value={form.newApiUserId} onChange={(event) => setForm((current) => ({ ...current, newApiUserId: event.target.value }))} placeholder="4465" />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label>密码{editingSite ? "（留空不修改）" : ""}</Label>
              <Input type="password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>采集间隔（分钟）</Label>
              <Input type="number" min="1" step="1" value={form.intervalMin} onChange={(event) => setForm((current) => ({ ...current, intervalMin: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>充值倍率</Label>
              <Input type="number" min="0.0001" step="any" value={form.rechargeRatio} onChange={(event) => setForm((current) => ({ ...current, rechargeRatio: event.target.value }))} />
            </div>
            <div className="md:col-span-2 space-y-2">
              <Label>代理（可选）</Label>
              <Input value={form.proxyUrl} onChange={(event) => setForm((current) => ({ ...current, proxyUrl: event.target.value }))} placeholder="http://user:pass@host:port，留空直连" />
              <p className="text-xs text-muted-foreground">填写后，该采集源的登录、采集、测试等所有请求都通过此 HTTP/HTTPS 代理发出。</p>
            </div>
            <div className="flex flex-col gap-3 rounded-md border border-border/70 p-3 sm:flex-row sm:items-center sm:justify-between md:col-span-2">
              <div className="min-w-0">
                <Label>启用采集</Label>
                <p className="text-xs text-muted-foreground">关闭后 worker 不会自动采集该源站。</p>
              </div>
              <Switch checked={form.enabled} onCheckedChange={(checked) => setForm((current) => ({ ...current, enabled: checked }))} />
            </div>
            {form.authMode === "manual_token" ? (
              <>
                <div className="md:col-span-2 space-y-2">
                  <Label>{form.siteType === "new_api" ? "Session / Cookie / Access Token" : "Access Token"}</Label>
                  <Input value={form.accessToken} onChange={(event) => setForm((current) => ({ ...current, accessToken: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Refresh Token</Label>
                  <Input value={form.refreshToken} onChange={(event) => setForm((current) => ({ ...current, refreshToken: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>过期时间</Label>
                  <Input value={form.tokenExpire} onChange={(event) => setForm((current) => ({ ...current, tokenExpire: event.target.value }))} placeholder="毫秒 / 秒级时间戳或日期时间" />
                </div>
              </>
            ) : null}
          </div>
          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saveSite.isPending}>取消</Button>
            <Button onClick={handleSaveSite} disabled={saveSite.isPending}>
              {saveSite.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认同步倍率</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>采集源：{selectedSourceSite?.name ?? selectedRate?.site_name ?? "-"}</p>
            <p>源分组：{selectedRate?.name || selectedRate?.group_id}</p>
            <p>目标分组：{selectedTarget?.name}</p>
            <p>写入倍率：{formatRate(nextRate)}</p>
            <p className="text-destructive">该操作会直接更新目标 Sub2API 分组倍率。</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={sync.isPending}>取消</Button>
            <Button onClick={handleSync} disabled={sync.isPending}>
              {sync.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : selectedRate ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              确认同步
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
