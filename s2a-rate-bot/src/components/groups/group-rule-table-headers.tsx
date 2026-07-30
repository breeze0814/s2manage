import { TableHead, TableHeader, TableRow } from "../ui/table";

export function GroupTableHeader() {
  return <TableHeader>
    <TableRow>
      <TableHead className="w-56 sm:px-5">分组 / 倍率</TableHead>
      <TableHead className="w-24">状态</TableHead>
      <TableHead>绑定分组</TableHead>
      <TableHead className="w-56">计算规则</TableHead>
      <TableHead className="w-56">倍率变化 / 最近应用</TableHead>
      <TableHead className="sticky-action-header w-44 sm:px-5">操作</TableHead>
    </TableRow>
  </TableHeader>;
}

export function MasterTableHead() {
  return <TableHeader>
    <TableRow>
      <TableHead className="w-56 sm:px-5">分组 / 倍率</TableHead>
      <TableHead className="w-24">状态</TableHead>
      <TableHead>绑定摘要</TableHead>
      <TableHead className="w-44">倍率变化</TableHead>
      <TableHead className="sticky-action-header w-28 sm:px-5">操作</TableHead>
    </TableRow>
  </TableHeader>;
}
