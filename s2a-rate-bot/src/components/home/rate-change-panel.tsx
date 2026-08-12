import { ArrowRight, CirclePlus, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { Tag } from "../ui/tag";

const HOME_CHANGE_LIMIT = 20;
const HOME_CHANGE_PREVIEW = 10;

export type RateChange = {
  readonly id: number;
  readonly sourceSiteName: string;
  readonly groupId: string;
  readonly groupName: string;
  readonly platform: string | null;
  readonly changeType: "added" | "updated" | "deleted";
  readonly oldRate: number | null;
  readonly newRate: number | null;
  readonly collectedAt: string;
};

export function RateChangePanel({ changes }: Readonly<{ changes: readonly RateChange[] }>) {
  const visibleChanges = changes.slice(0, HOME_CHANGE_LIMIT);
  const previewChanges = visibleChanges.slice(0, HOME_CHANGE_PREVIEW);
  return (
    <section className="panel overflow-hidden" aria-labelledby="rate-change-title">
      <div className="panel-header">
        <div>
          <h2 id="rate-change-title" className="panel-title">最近倍率变化</h2>
          <p className="panel-description">仅展示最近 24 小时内发现的倍率变化、新增与删除分组。</p>
        </div>
        <Tag>{changes.length} 条变化</Tag>
      </div>
      {visibleChanges.length ? (
        <div className="home-feed-viewport">
          <ChangeList changes={previewChanges} />
          {visibleChanges.length > HOME_CHANGE_PREVIEW ? (
            <p className="border-t border-border px-4 py-3 text-center text-xs text-muted sm:px-5 xl:px-6">
              已显示最近 {HOME_CHANGE_PREVIEW} 条，共 {changes.length} 条变化
            </p>
          ) : null}
        </div>
      ) : (
        <EmptyChanges />
      )}
    </section>
  );
}

function ChangeList({ changes }: Readonly<{ changes: readonly RateChange[] }>) {
  return (
    <div className="divide-y divide-border">
      {changes.map((change) => <ChangeRow key={change.id} change={change} />)}
    </div>
  );
}

function ChangeRow({ change }: Readonly<{ change: RateChange }>) {
  const state = changeState(change);
  return (
    <article className="flex flex-col gap-2 px-4 py-2.5 transition-colors hover:bg-surface-muted/50 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md ${state.iconClass}`} aria-hidden="true">
          {state.icon}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium">{change.groupName}</p>
            <Tag tone={state.tone}>{state.label}</Tag>
          </div>
          <p className="mt-1 text-xs text-muted">
            {change.sourceSiteName} · {change.platform ?? "未知平台"} · {formatTime(change.collectedAt)}
          </p>
        </div>
      </div>
      <RateTransition change={change} />
    </article>
  );
}

function RateTransition({ change }: Readonly<{ change: RateChange }>) {
  return (
    <div className="flex shrink-0 items-center gap-2 font-mono text-sm font-semibold tabular-nums" aria-label={rateChangeLabel(change)}>
      <span className="text-muted">{formatRate(change.oldRate)}</span>
      <ArrowRight className="size-4 text-muted" aria-hidden="true" />
      <span className={change.changeType === "deleted" ? "text-danger" : "text-effective-rate"}>
        {change.changeType === "deleted" ? "已删除" : formatRate(change.newRate)}
      </span>
    </div>
  );
}

function changeState(change: RateChange) {
  if (change.changeType === "added") return { label: "新增", tone: "success" as const, icon: <CirclePlus className="size-4" />, iconClass: "bg-success/10 text-success" };
  if (change.changeType === "deleted") return { label: "已删除", tone: "danger" as const, icon: <Trash2 className="size-4" />, iconClass: "bg-danger/10 text-danger" };
  const increased = (change.newRate ?? 0) > (change.oldRate ?? 0);
  return increased
    ? { label: "上调", tone: "warning" as const, icon: <TrendingUp className="size-4" />, iconClass: "bg-warning/10 text-warning" }
    : { label: "下调", tone: "primary" as const, icon: <TrendingDown className="size-4" />, iconClass: "bg-info/10 text-info" };
}

function rateChangeLabel(change: RateChange) {
  if (change.changeType === "added") return `新增倍率 ${formatRate(change.newRate)}`;
  if (change.changeType === "deleted") return `删除前倍率 ${formatRate(change.oldRate)}`;
  return `倍率从 ${formatRate(change.oldRate)} 变为 ${formatRate(change.newRate)}`;
}

function EmptyChanges() {
  return (
    <div className="empty-state-inline m-4 rounded-lg border border-dashed border-border-strong bg-surface-muted/40">
      <p>最近 24 小时暂无倍率变化。</p>
    </div>
  );
}

function formatRate(value: number | null) {
  return value === null ? "—" : `×${Number(value.toFixed(4))}`;
}

function formatTime(value: string) {
  return new Date(value).toLocaleString("zh-CN");
}
