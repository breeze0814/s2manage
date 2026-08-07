"use client";

import { Activity, ExternalLink, Loader2, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/button";
import { ConfirmAlert } from "../ui/confirm-alert";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuPortal, ContextMenuSeparator, ContextMenuTrigger, type ContextMenuItemProps } from "../ui/context-menu";
import { Tag } from "../ui/tag";
import type { SourceSiteView } from "./types";

export function SourceSiteTable({ sites, selectedSiteId, pendingId, pendingIds = new Set(), onSelect, onMonitors, onRefresh, onEdit, onDelete }: Readonly<{
  sites: readonly SourceSiteView[];
  selectedSiteId: number | null;
  pendingId: number | null;
  pendingIds?: ReadonlySet<number>;
  onSelect: (siteId: number) => void;
  onMonitors: (site: SourceSiteView) => void;
  onRefresh: (site: SourceSiteView) => void;
  onEdit: (site: SourceSiteView) => void;
  onDelete: (site: SourceSiteView) => void;
}>) {
  const [deleteTarget, setDeleteTarget] = useState<SourceSiteView | null>(null);
  if (sites.length === 0) return <p className="empty-state">还没有采集站，请先添加一个采集源。</p>;
  return (
    <>
      <div role="listbox" aria-label="选择采集站" className="grid gap-3">
        {sites.map((site) => (
          <SourceCard
            key={site.id}
            site={site}
            selected={selectedSiteId === site.id}
            pending={pendingId === site.id || pendingIds.has(site.id)}
            onSelect={onSelect}
            onMonitors={onMonitors}
            onRefresh={onRefresh}
            onEdit={onEdit}
            onDelete={setDeleteTarget}
          />
        ))}
      </div>
      <ConfirmAlert
        open={deleteTarget !== null}
        title="删除采集站"
        description={`确定删除采集站「${deleteTarget?.name ?? ""}」？此操作无法撤销。`}
        confirmLabel="确认删除"
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        onConfirm={() => {
          if (deleteTarget) onDelete(deleteTarget);
          setDeleteTarget(null);
        }}
      />
    </>
  );
}

function SourceCard(props: SourceActions & { site: SourceSiteView; selected: boolean; pending: boolean; onSelect: (siteId: number) => void }) {
  const { site } = props;
  return (
    <ContextMenu onOpenChange={(open) => { if (open) props.onSelect(site.id); }}>
      <ContextMenuTrigger asChild>
        <article
          role="option"
          aria-selected={props.selected}
          tabIndex={0}
          onClick={() => props.onSelect(site.id)}
          onKeyDown={(event) => selectWithKeyboard(event, site.id, props.onSelect)}
          className={`cursor-context-menu space-y-3 rounded-lg border bg-surface px-4 py-3.5 shadow-panel outline-none transition-[border-color,background-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-primary data-[state=open]:border-primary data-[state=open]:bg-primary/5 data-[state=open]:ring-1 data-[state=open]:ring-primary/20 ${
            props.selected
              ? "border-primary bg-primary/5 ring-1 ring-primary/20 shadow-md"
              : "border-border-strong hover:border-primary/40 hover:bg-surface-muted/55"
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate font-medium" title={site.name}>{site.name}</h3>
                <TypeTag type={site.siteType} />
                <Status site={site} />
              </div>
              <p className="mt-1 truncate text-xs text-muted" title={site.baseUrl}>{site.baseUrl}</p>
            </div>
          </div>
          <SiteMetrics site={site} />
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <SiteMeta site={site} />
            <CardActions site={site} pending={props.pending} onMonitors={props.onMonitors} onRefresh={props.onRefresh} onEdit={props.onEdit} onDelete={props.onDelete} />
          </div>
        </article>
      </ContextMenuTrigger>
      <SourceCardMenu {...props} />
    </ContextMenu>
  );
}

function SiteMetrics({ site }: Readonly<{ site: SourceSiteView }>) {
  return (
    <dl className="grid grid-cols-3 gap-3 border-t border-border pt-3 text-center">
      <SiteMetric label="余额" value={site.balance} className="text-balance-value" />
      <SiteMetric label="今日消费" value={site.todayConsume} className={site.todayConsume && site.todayConsume > 0 ? "text-warning" : "text-muted"} />
      <SiteMetric label="历史充值" value={site.historyRecharge} className="text-foreground" />
    </dl>
  );
}

function SiteMetric({ label, value, className }: Readonly<{ label: string; value: number | null; className: string }>) {
  const display = formatMetric(value);
  return <div className="min-w-0"><dt className="text-xs text-muted">{label}</dt><dd title={display} className={`mt-1 truncate font-mono text-sm font-semibold tabular-nums ${className}`}>{display}</dd></div>;
}

function CardActions({
  site,
  pending,
  onMonitors,
  onRefresh,
  onEdit,
  onDelete,
}: SourceActions & { site: SourceSiteView; pending: boolean }) {
  return (
    <div
      className="flex shrink-0 items-center justify-end gap-1.5"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {site.siteType === "sub2api" ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          data-channel-monitors
          aria-label="渠道监控"
          title="渠道监控"
          disabled={!site.enabled}
          onClick={() => onMonitors(site)}
          className="compact-icon-button"
        >
          <Activity className="size-3.5" />
        </Button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        data-refresh-site
        aria-label="刷新采集站"
        title="刷新采集站"
        disabled={pending || !site.enabled}
        onClick={() => onRefresh(site)}
        className="compact-icon-button"
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        data-edit-site
        aria-label="编辑采集站"
        title="编辑采集站"
        onClick={() => onEdit(site)}
        className="compact-icon-button"
      >
        <Pencil className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        data-delete-site
        aria-label="删除采集站"
        title="删除采集站"
        onClick={() => onDelete(site)}
        className="compact-icon-button text-danger hover:border-danger/40 hover:bg-danger/10 hover:text-danger"
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}

function SiteMeta({ site }: Readonly<{ site: SourceSiteView }>) {
  return (
    <div className="flex min-w-0 flex-wrap gap-1.5">
      <Tag tone="rate" className="font-mono tabular-nums">充值 ×{site.rechargeRatio}</Tag>
      {site.useProxy ? <Tag tone="info">使用代理</Tag> : null}
      {site.balanceAlertThreshold !== null && site.balance !== null && site.balance <= site.balanceAlertThreshold ? <Tag tone="danger">余额低于阈值</Tag> : null}
      {site.remark ? <Tag title={site.remark}><span className="max-w-40 truncate">{site.remark}</span></Tag> : null}
    </div>
  );
}

function TypeTag({ type }: Readonly<{ type: SourceSiteView["siteType"] }>) {
  return <Tag tone="primary">{type === "newapi" ? "New API" : "Sub2API"}</Tag>;
}

function SourceCardMenu({ site, pending, onMonitors, onRefresh, onEdit, onDelete }: SourceActions & { site: SourceSiteView; pending: boolean }) {
  return (
    <ContextMenuPortal>
      <ContextMenuContent aria-label={`${site.name} 操作`}>
        <WebsiteMenuItem site={site} />
        {site.siteType === "sub2api" ? <MenuItem marker="data-channel-monitors" disabled={!site.enabled} onSelect={() => onMonitors(site)} icon={<Activity className="size-4" />} label="渠道监控" /> : null}
        <MenuItem marker="data-refresh-site" disabled={pending || !site.enabled} onSelect={() => onRefresh(site)} icon={<RefreshCw className={`size-4 ${pending ? "animate-spin" : ""}`} />} label="刷新采集站" />
        <MenuItem marker="data-edit-site" onSelect={() => onEdit(site)} icon={<Pencil className="size-4" />} label="编辑采集站" />
        <ContextMenuSeparator className="my-1 h-px bg-border" />
        <MenuItem marker="data-delete-site" danger onSelect={() => onDelete(site)} icon={<Trash2 className="size-4" />} label="删除采集站" />
      </ContextMenuContent>
    </ContextMenuPortal>
  );
}

function WebsiteMenuItem({ site }: Readonly<{ site: SourceSiteView }>) {
  if (!site.websiteUrl) return <MenuItem marker="data-open-site-website" disabled icon={<ExternalLink className="size-4" />} label="未配置官网" />;
  return (
    <ContextMenuItem asChild>
      <a href={site.websiteUrl} target="_blank" rel="noopener noreferrer" data-open-site-website className={MENU_ITEM_CLASS}>
        <ExternalLink className="size-4" />
        打开官网
      </a>
    </ContextMenuItem>
  );
}

function MenuItem({ marker, icon, label, danger = false, ...item }: Readonly<{ marker: string; icon: React.ReactNode; label: string; danger?: boolean } & ContextMenuItemProps>) {
  return (
    <ContextMenuItem
      {...{ [marker]: true }}
      {...item}
      className={`${MENU_ITEM_CLASS} ${danger ? "text-danger data-[highlighted]:bg-danger/10 data-[highlighted]:text-danger" : "data-[highlighted]:bg-surface-muted"}`}
    >
      {icon}
      {label}
    </ContextMenuItem>
  );
}

function Status({ site }: Readonly<{ site: SourceSiteView }>) {
  const text = !site.enabled ? "已停用" : site.lastStatus === "failed" ? "失败" : site.lastStatus === "partial" ? "部分成功" : site.lastStatus === "success" ? "正常" : "未运行";
  const tone = site.lastStatus === "failed" ? "danger" : site.lastStatus === "partial" ? "warning" : site.enabled ? "success" : "neutral";
  return <Tag title={site.lastError ?? undefined} tone={tone}>{text}</Tag>;
}

function formatMetric(value: number | null) {
  return value === null ? "-" : Number(value.toFixed(4)).toLocaleString("zh-CN", { maximumFractionDigits: 4 });
}

function selectWithKeyboard(event: React.KeyboardEvent, siteId: number, onSelect: (siteId: number) => void) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  onSelect(siteId);
}

const MENU_ITEM_CLASS = "flex min-h-9 cursor-pointer select-none items-center gap-2 rounded-md px-3 py-2 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-40";
type SourceActions = {
  onMonitors: (site: SourceSiteView) => void;
  onRefresh: (site: SourceSiteView) => void;
  onEdit: (site: SourceSiteView) => void;
  onDelete: (site: SourceSiteView) => void;
};
