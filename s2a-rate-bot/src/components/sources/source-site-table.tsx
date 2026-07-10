import { Pencil, RefreshCw, Trash2 } from "lucide-react";
import type { SourceSiteView } from "./types";

export function SourceSiteTable({ sites, pendingId, onRefresh, onEdit, onDelete }: Readonly<{
  sites: readonly SourceSiteView[];
  pendingId: number | null;
  onRefresh: (site: SourceSiteView) => void;
  onEdit: (site: SourceSiteView) => void;
  onDelete: (site: SourceSiteView) => void;
}>) {
  if (sites.length === 0) return <p className="rounded-lg bg-surface-muted p-4 text-sm text-muted">还没有采集站。</p>;
  return (
    <>
      <div className="space-y-3 md:hidden">{sites.map((site) => <SourceCard key={site.id} site={site} pending={pendingId === site.id} onRefresh={onRefresh} onEdit={onEdit} onDelete={onDelete} />)}</div>
      <div className="hidden overflow-hidden rounded-lg border border-border md:block">
        <table className="w-full text-left text-sm"><SiteTableHead /><tbody>{sites.map((site) => <SourceRow key={site.id} site={site} pending={pendingId === site.id} onRefresh={onRefresh} onEdit={onEdit} onDelete={onDelete} />)}</tbody></table>
      </div>
    </>
  );
}

function SiteTableHead() {
  return <thead className="bg-surface-muted text-muted"><tr><th className="p-3">采集站</th><th className="p-3">类型</th><th className="p-3">状态</th><th className="p-3">账户/余额</th><th className="p-3">最后运行</th><th className="p-3 text-right">操作</th></tr></thead>;
}

function SourceRow(props: SourceActions & { site: SourceSiteView; pending: boolean }) {
  const { site } = props;
  return (
    <tr className="border-t border-border">
      <td className="p-3"><p className="font-medium">{site.name}</p><p className="max-w-64 truncate text-xs text-muted">{site.baseUrl}</p></td>
      <td className="p-3">{site.siteType === "newapi" ? "New API" : "Sub2API"}</td>
      <td className="p-3"><Status site={site} /></td>
      <td className="p-3">{site.accountLabel ?? "-"}<p className="text-xs text-muted">余额 {site.balance ?? "-"}</p></td>
      <td className="p-3 text-xs text-muted">{formatTime(site.lastRunAt)}</td>
      <td className="p-3"><ActionButtons {...props} /></td>
    </tr>
  );
}

function SourceCard(props: SourceActions & { site: SourceSiteView; pending: boolean }) {
  const { site } = props;
  return (
    <article className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3"><div><h3 className="font-medium">{site.name}</h3><p className="break-all text-xs text-muted">{site.baseUrl}</p></div><Status site={site} /></div>
      <dl className="grid grid-cols-2 gap-2 text-sm"><Info label="类型" value={site.siteType === "newapi" ? "New API" : "Sub2API"} /><Info label="账户" value={site.accountLabel ?? "-"} /><Info label="余额" value={String(site.balance ?? "-")} /><Info label="最后运行" value={formatTime(site.lastRunAt)} /></dl>
      <ActionButtons {...props} />
    </article>
  );
}

function ActionButtons({ site, pending, onRefresh, onEdit, onDelete }: SourceActions & { site: SourceSiteView; pending: boolean }) {
  return (
    <div className="flex justify-end gap-1">
      <IconButton label="刷新" marker="data-refresh-site" disabled={pending || !site.enabled} onClick={() => onRefresh(site)}><RefreshCw className={`size-4 ${pending ? "animate-spin" : ""}`} /></IconButton>
      <IconButton label="编辑" marker="data-edit-site" onClick={() => onEdit(site)}><Pencil className="size-4" /></IconButton>
      <IconButton label="删除" marker="data-delete-site" onClick={() => onDelete(site)}><Trash2 className="size-4" /></IconButton>
    </div>
  );
}

function IconButton({ label, marker, children, ...button }: Readonly<{ label: string; marker: string; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>>) {
  return <button type="button" aria-label={label} title={label} {...{ [marker]: true }} {...button} className="flex size-10 items-center justify-center rounded-lg text-muted hover:bg-surface-muted disabled:opacity-40">{children}</button>;
}

function Status({ site }: Readonly<{ site: SourceSiteView }>) {
  const text = !site.enabled ? "已停用" : site.lastStatus === "failed" ? "失败" : site.lastStatus === "success" ? "正常" : "未运行";
  const tone = site.lastStatus === "failed" ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300" : site.enabled ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-surface-muted text-muted";
  return <span title={site.lastError ?? undefined} className={`rounded-full px-2 py-1 text-xs ${tone}`}>{text}</span>;
}

function Info({ label, value }: Readonly<{ label: string; value: string }>) { return <div><dt className="text-xs text-muted">{label}</dt><dd>{value}</dd></div>; }
function formatTime(value: string | null) { return value ? new Date(value).toLocaleString("zh-CN") : "-"; }
type SourceActions = { onRefresh: (site: SourceSiteView) => void; onEdit: (site: SourceSiteView) => void; onDelete: (site: SourceSiteView) => void };
