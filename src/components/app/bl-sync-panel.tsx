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
  authMode: string;
  enabled: boolean;
  intervalMin: number;
  rechargeRatio: number;
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

type SiteForm = {
  id?: number;
  name: string;
  baseUrl: string;
  siteType: "sub2api" | "new_api";
  authMode: "password" | "manual_token";
  email: string;
  password: string;
  enabled: boolean;
  intervalMin: string;
  rechargeRatio: string;
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
  enabled: true,
  intervalMin: "60",
  rechargeRatio: "1",
  accessToken: "",
  refreshToken: "",
  tokenExpire: "",
};

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

function toForm(site?: CollectionSite | null): SiteForm {
  if (!site) return { ...defaultForm };
  return {
    id: site.id,
    name: site.name,
    baseUrl: site.baseUrl,
    siteType: site.siteType === "new_api" ? "new_api" : "sub2api",
    authMode: site.authMode === "manual_token" ? "manual_token" : "password",
    email: site.email ?? "",
    password: "",
    enabled: site.enabled,
    intervalMin: String(site.intervalMin ?? 60),
    rechargeRatio: String(site.rechargeRatio ?? 1),
    accessToken: site.accessToken ?? "",
    refreshToken: site.refreshToken ?? "",
    tokenExpire: site.tokenExpire ? String(site.tokenExpire) : "",
  };
}

function siteTypeLabel(value: string) {
  return value === "new_api" ? "New API" : "Sub2API";
}

function ruleSyncStatus(result: unknown) {
  const ruleSync = (result as { ruleSync?: { ok?: boolean; summary?: Record<string, unknown> } | null })?.ruleSync;
  const summary = ruleSync?.summary;
  const failed = Number(summary?.failedGroupRules ?? 0) + Number(summary?.failedAccountRules ?? 0);
  return { ok: ruleSync?.ok !== false, failed };
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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [syncError, setSyncError] = useState("");

  const siteId = selectedSiteId === "__all__" ? undefined : Number(selectedSiteId);
  const { data: sites, isLoading: sitesLoading } = trpc.bl.collectionSites.useQuery({ connectionId });
  const { data: rates, isLoading: ratesLoading, refetch: refetchRates } = trpc.bl.rates.useQuery({ connectionId, siteId });
  const { data: changes, isLoading: changesLoading } = trpc.bl.changes.useQuery({ connectionId, siteId, limit: 50 });
  const { data: groups, isLoading: groupsLoading } = trpc.groups.list.useQuery({ connectionId });

  useEffect(() => {
    setSelectedSiteId("__all__");
    setRateSearch("");
    setSelectedPlatform("__all__");
    setSelectedGroupId("");
    setSelectedRateKey("");
  }, [connectionId]);

  const invalidateCollection = async () => {
    await Promise.all([
      utils.bl.collectionSites.invalidate({ connectionId }),
      utils.bl.sites.invalidate({ connectionId }),
      utils.bl.rates.invalidate({ connectionId }),
      utils.bl.changes.invalidate({ connectionId }),
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
  const ratesList = useMemo<BlRate[]>(() => (Array.isArray(rates) ? rates : []), [rates]);
  const changesList = useMemo<BlChange[]>(() => (Array.isArray(changes) ? changes : []), [changes]);
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
  const selectedRate = ratesWithKeys.find((item) => item.key === selectedRateKey)?.rate;
  const selectedTarget = groupsList.find((group) => group.id === Number.parseInt(selectedGroupId, 10));
  const nextRate = getRateValue(selectedRate);

  useEffect(() => {
    if (selectedRateKey && !ratesWithKeys.some((item) => item.key === selectedRateKey)) {
      setSelectedRateKey("");
    }
  }, [ratesWithKeys, selectedRateKey]);

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
    saveSite.mutate({
      id: form.id,
      connectionId,
      name: form.name.trim(),
      baseUrl: form.baseUrl.trim().replace(/\/+$/, ""),
      siteType: form.siteType,
      authMode: form.authMode,
      email: form.email.trim(),
      password: form.password,
      enabled: form.enabled,
      intervalMin,
      rechargeRatio,
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
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">采集源</div>
            <div className="mt-1 text-2xl font-semibold">{sitesList.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">启用</div>
            <div className="mt-1 text-2xl font-semibold">{enabledSites}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">在线</div>
            <div className="mt-1 text-2xl font-semibold">{onlineSites}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">当前倍率</div>
            <div className="mt-1 text-2xl font-semibold">{ratesList.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
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
                    <TableCell>
                      <span className={site.lastStatus === "online" ? "text-emerald-700" : site.lastStatus === "offline" ? "text-destructive" : "text-muted-foreground"}>
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
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={rateSearch}
                onChange={(event) => {
                  setRateSearch(event.target.value);
                  setSelectedRateKey("");
                }}
                placeholder="搜索分组、站点、平台、倍率"
                className="w-[260px] pl-9"
              />
            </div>
            <Select
              value={selectedPlatform}
              onValueChange={(value) => {
                setSelectedPlatform(value);
                setSelectedRateKey("");
              }}
            >
              <SelectTrigger className="w-[170px]">
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
              <SelectTrigger className="w-[220px]">
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
              <SelectTrigger className="w-[220px]">
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
            <div className="flex items-center justify-between gap-3 p-5 text-sm text-muted-foreground">
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
                {ratesWithKeys.map(({ key, rate }) => {
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
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">倍率变更</CardTitle>
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
                  <TableRow key={`${change.site_id}-${change.group_id}-${change.created_at}-${index}`}>
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
            <div className="md:col-span-2 flex items-center justify-between rounded-md border border-border/70 p-3">
              <div>
                <Label>启用采集</Label>
                <p className="text-xs text-muted-foreground">关闭后 worker 不会自动采集该源站。</p>
              </div>
              <Switch checked={form.enabled} onCheckedChange={(checked) => setForm((current) => ({ ...current, enabled: checked }))} />
            </div>
            {form.authMode === "manual_token" ? (
              <>
                <div className="md:col-span-2 space-y-2">
                  <Label>Access Token</Label>
                  <Input value={form.accessToken} onChange={(event) => setForm((current) => ({ ...current, accessToken: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Refresh Token</Label>
                  <Input value={form.refreshToken} onChange={(event) => setForm((current) => ({ ...current, refreshToken: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>过期时间</Label>
                  <Input value={form.tokenExpire} onChange={(event) => setForm((current) => ({ ...current, tokenExpire: event.target.value }))} placeholder="秒级时间戳或日期时间" />
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
