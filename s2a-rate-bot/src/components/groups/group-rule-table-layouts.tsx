import { Table, TableBody } from "../ui/table";
import { GroupTableHeader, MasterTableHead } from "./group-rule-table-headers";

export function GroupTableShell({ count, mobileRows, tabletRows, masterRows, detail }: Readonly<{
  count: number;
  mobileRows: React.ReactNode;
  tabletRows: React.ReactNode;
  masterRows: React.ReactNode;
  detail: React.ReactNode;
}>) {
  return <section className="panel overflow-hidden" aria-label="分组倍率列表" data-group-master-detail>
    <GroupTableSummary count={count} />
    <div className="grid gap-3 p-3 sm:p-4 lg:hidden">{mobileRows}</div>
    <TabletGroupTable rows={tabletRows} />
    <MasterDetailTable rows={masterRows} detail={detail} />
  </section>;
}

function GroupTableSummary({ count }: Readonly<{ count: number }>) {
  return <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-muted/20 px-4 py-2 sm:px-5 xl:px-6">
    <p className="text-sm"><span className="font-semibold">共 {count} 个分组</span><span className="ml-2 text-muted">本地 SQL 快照</span></p>
    <span className="hidden text-xs text-muted sm:inline xl:hidden">操作列：刷新 / 编辑 / 应用</span>
    <span className="hidden text-xs text-muted xl:inline">大屏：点选分组查看完整绑定与规则</span>
  </div>;
}

function TabletGroupTable({ rows }: Readonly<{ rows: React.ReactNode }>) {
  return <div className="desktop-table-viewport hidden rounded-b-xl lg:block xl:hidden">
    <Table className="data-table data-table-sticky min-w-[900px]"><GroupTableHeader /><TableBody>{rows}</TableBody></Table>
  </div>;
}

function MasterDetailTable({ rows, detail }: Readonly<{ rows: React.ReactNode; detail: React.ReactNode }>) {
  return <div className="master-detail-split">
    <div className="desktop-table-viewport min-w-0 rounded-none border-0">
      <Table className="data-table data-table-sticky min-w-[640px]"><MasterTableHead /><TableBody>{rows}</TableBody></Table>
    </div>
    <aside className="detail-rail bg-surface-muted/20" aria-label="分组详情">
      <div className="detail-rail-scroll p-4 2xl:p-5">{detail}</div>
    </aside>
  </div>;
}
