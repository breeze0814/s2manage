"use client";

import { useState } from "react";
import { Loader2, Pencil, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";

type AnnouncementStatus = "draft" | "active" | "archived";
type NotifyMode = "silent" | "popup";

type AnnouncementRow = {
  id: number;
  title: string;
  content: string;
  status?: AnnouncementStatus | null;
  notify_mode?: NotifyMode | null;
  created_at?: string | Date | null;
  createdAt?: string | Date | null;
};

type AnnouncementRuleRow = {
  id: number;
  name: string;
  enabled: boolean;
  titleTemplate: string;
  contentTemplate: string;
  status: AnnouncementStatus;
  notifyMode: NotifyMode;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

type AnnouncementForm = {
  id?: number;
  title: string;
  content: string;
  status: AnnouncementStatus;
  notify_mode: NotifyMode;
};

type RuleForm = {
  id?: number;
  name: string;
  enabled: boolean;
  titleTemplate: string;
  contentTemplate: string;
  status: AnnouncementStatus;
  notifyMode: NotifyMode;
};

const defaultRuleTitleTemplate = "分组 {{groupName}} 倍率已调整为 {{newRate}}";
const defaultRuleContentTemplate = [
  "分组：{{groupName}} (#{{groupId}})",
  "原倍率：{{oldRate}}",
  "新倍率：{{newRate}}",
  "来源：{{sourceLabel}}",
  "时间：{{changedAt}}",
].join("\n");

const templateVariables = [
  "connectionName",
  "groupName",
  "groupId",
  "oldRate",
  "newRate",
  "sourceLabel",
  "sourceSiteName",
  "sourceGroupName",
  "sourceRate",
  "ruleMode",
  "ruleExpression",
  "changedAt",
  "action",
];

function normalizeAnnouncements(response: unknown): AnnouncementRow[] {
  if (Array.isArray(response)) return response as AnnouncementRow[];
  return (response as { items?: AnnouncementRow[]; data?: AnnouncementRow[] } | undefined)?.items ?? [];
}

function newAnnouncementForm(): AnnouncementForm {
  return {
    title: "",
    content: "",
    status: "active",
    notify_mode: "silent",
  };
}

function newRuleForm(): RuleForm {
  return {
    name: "倍率调整公告",
    enabled: true,
    titleTemplate: defaultRuleTitleTemplate,
    contentTemplate: defaultRuleContentTemplate,
    status: "active",
    notifyMode: "silent",
  };
}

function dateLabel(value?: string | Date | null) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN");
}

export function AnnouncementsPanel({ connectionId }: { connectionId: number }) {
  const utils = trpc.useUtils();
  const { showToast } = useToast();
  const { data: announcements, error: listError, isLoading, isFetching, refetch } = trpc.announcements.list.useQuery({ connectionId });
  const rulesQuery = trpc.announcements.rules.useQuery({ connectionId });

  const [editOpen, setEditOpen] = useState(false);
  const [editData, setEditData] = useState<AnnouncementForm>(() => newAnnouncementForm());
  const [ruleOpen, setRuleOpen] = useState(false);
  const [ruleForm, setRuleForm] = useState<RuleForm>(() => newRuleForm());
  const [error, setError] = useState("");
  const [ruleError, setRuleError] = useState("");

  const preview = trpc.announcements.previewRule.useQuery(
    {
      titleTemplate: ruleForm.titleTemplate || " ",
      contentTemplate: ruleForm.contentTemplate || " ",
    },
    { enabled: ruleOpen && (!!ruleForm.titleTemplate.trim() || !!ruleForm.contentTemplate.trim()) },
  );

  const create = trpc.announcements.create.useMutation({
    onSuccess: async () => {
      setEditOpen(false);
      await refetch();
      showToast({ title: "公告已创建", variant: "success" });
    },
    onError: (e) => {
      setError(e.message);
      showToast({ title: "创建公告失败", description: e.message, variant: "error" });
    },
  });
  const update = trpc.announcements.update.useMutation({
    onSuccess: async () => {
      setEditOpen(false);
      await refetch();
      showToast({ title: "公告已保存", variant: "success" });
    },
    onError: (e) => {
      setError(e.message);
      showToast({ title: "保存公告失败", description: e.message, variant: "error" });
    },
  });
  const del = trpc.announcements.delete.useMutation({
    onSuccess: async () => {
      await refetch();
      showToast({ title: "公告已删除", variant: "success" });
    },
    onError: (e) => {
      setError(e.message);
      showToast({ title: "删除公告失败", description: e.message, variant: "error" });
    },
  });

  const createRule = trpc.announcements.createRule.useMutation();
  const updateRule = trpc.announcements.updateRule.useMutation();
  const deleteRule = trpc.announcements.deleteRule.useMutation();
  const ruleSaving = createRule.isPending || updateRule.isPending || deleteRule.isPending;

  const openCreate = () => {
    setEditData(newAnnouncementForm());
    setError("");
    setEditOpen(true);
  };

  const openEdit = (announcement: AnnouncementRow) => {
    setEditData({
      id: announcement.id,
      title: announcement.title,
      content: announcement.content,
      status: announcement.status ?? "active",
      notify_mode: announcement.notify_mode ?? "silent",
    });
    setError("");
    setEditOpen(true);
  };

  const openCreateRule = () => {
    setRuleForm(newRuleForm());
    setRuleError("");
    setRuleOpen(true);
  };

  const openEditRule = (rule: AnnouncementRuleRow) => {
    setRuleForm({
      id: rule.id,
      name: rule.name,
      enabled: rule.enabled,
      titleTemplate: rule.titleTemplate,
      contentTemplate: rule.contentTemplate,
      status: rule.status,
      notifyMode: rule.notifyMode,
    });
    setRuleError("");
    setRuleOpen(true);
  };

  const invalidateRules = async () => {
    await Promise.all([
      utils.announcements.rules.invalidate({ connectionId }),
      utils.sync.logs.invalidate(),
    ]);
  };

  const handleSubmit = () => {
    if (!editData.title.trim() || !editData.content.trim()) {
      setError("请填写标题和内容");
      return;
    }
    if (editData.id) {
      update.mutate({ connectionId, id: editData.id, title: editData.title, content: editData.content, status: editData.status, notify_mode: editData.notify_mode });
    } else {
      create.mutate({ connectionId, title: editData.title, content: editData.content, status: editData.status, notify_mode: editData.notify_mode });
    }
  };

  const handleRuleSubmit = async () => {
    setRuleError("");
    try {
      const payload = {
        connectionId,
        name: ruleForm.name.trim(),
        enabled: ruleForm.enabled,
        titleTemplate: ruleForm.titleTemplate.trim(),
        contentTemplate: ruleForm.contentTemplate.trim(),
        status: ruleForm.status,
        notifyMode: ruleForm.notifyMode,
      };
      if (!payload.name) throw new Error("请填写规则名称");
      if (!payload.titleTemplate || !payload.contentTemplate) throw new Error("请填写标题模板和内容模板");

      if (ruleForm.id) {
        await updateRule.mutateAsync({ ...payload, id: ruleForm.id });
      } else {
        await createRule.mutateAsync(payload);
      }

      await invalidateRules();
      setRuleOpen(false);
      showToast({ title: ruleForm.id ? "公告规则已保存" : "公告规则已创建", variant: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setRuleError(message);
      showToast({ title: ruleForm.id ? "保存公告规则失败" : "创建公告规则失败", description: message, variant: "error" });
    }
  };

  const handleDeleteRule = async (rule: AnnouncementRuleRow) => {
    if (!confirm(`确定删除公告规则「${rule.name}」？`)) return;
    try {
      await deleteRule.mutateAsync({ connectionId, id: rule.id });
      await invalidateRules();
      showToast({ title: "公告规则已删除", variant: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setRuleError(message);
      showToast({ title: "删除公告规则失败", description: message, variant: "error" });
    }
  };

  const handleRefresh = async () => {
    const [announcementResult, ruleResult] = await Promise.all([refetch(), rulesQuery.refetch()]);
    if (announcementResult.error || ruleResult.error) {
      showToast({
        title: "刷新公告失败",
        description: announcementResult.error?.message ?? ruleResult.error?.message,
        variant: "error",
      });
      return;
    }
    showToast({ title: "公告已刷新", variant: "success" });
  };

  const statusBadge = (status: AnnouncementStatus) => {
    const map: Record<AnnouncementStatus, { label: string; variant: "default" | "secondary" | "destructive" }> = {
      active: { label: "已发布", variant: "default" },
      draft: { label: "草稿", variant: "secondary" },
      archived: { label: "已归档", variant: "secondary" },
    };
    const item = map[status] ?? map.active;
    return <Badge variant={item.variant}>{item.label}</Badge>;
  };

  const notifyLabel = (mode?: NotifyMode | null) => mode === "popup" ? "弹窗" : "静默";

  if (isLoading && rulesQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        加载中...
      </div>
    );
  }

  const list = normalizeAnnouncements(announcements);
  const rules = (rulesQuery.data ?? []) as AnnouncementRuleRow[];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">公告管理</h2>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isFetching || rulesQuery.isFetching}>
            {isFetching || rulesQuery.isFetching ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
            刷新
          </Button>
          <Button variant="outline" size="sm" onClick={openCreateRule} disabled={ruleSaving}>
            <Plus className="mr-1 h-4 w-4" />
            新建公告规则
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" />
            新建公告
          </Button>
        </div>
      </div>

      {listError ? <p className="text-sm text-destructive">加载公告失败：{listError.message}</p> : null}
      {rulesQuery.error ? <p className="text-sm text-destructive">加载公告规则失败：{rulesQuery.error.message}</p> : null}
      {error && !editOpen ? <p className="text-sm text-destructive">{error}</p> : null}
      {ruleError && !ruleOpen ? <p className="text-sm text-destructive">{ruleError}</p> : null}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">#</TableHead>
                <TableHead>规则名称</TableHead>
                <TableHead className="w-24">启用</TableHead>
                <TableHead className="w-24">发布</TableHead>
                <TableHead className="w-24">通知</TableHead>
                <TableHead>标题模板</TableHead>
                <TableHead className="w-40">更新时间</TableHead>
                <TableHead className="w-24">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rulesQuery.isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">加载公告规则中...</TableCell></TableRow>
              ) : rules.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">暂无公告规则</TableCell></TableRow>
              ) : (
                rules.map((rule, idx) => (
                  <TableRow key={rule.id}>
                    <TableCell>{idx + 1}</TableCell>
                    <TableCell className="font-medium">{rule.name}</TableCell>
                    <TableCell>{rule.enabled ? <Badge variant="success">启用</Badge> : <Badge variant="secondary">停用</Badge>}</TableCell>
                    <TableCell>{statusBadge(rule.status)}</TableCell>
                    <TableCell>{notifyLabel(rule.notifyMode)}</TableCell>
                    <TableCell className="max-w-[320px] truncate font-mono text-xs">{rule.titleTemplate}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{dateLabel(rule.updatedAt ?? rule.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={ruleSaving} title="编辑规则" onClick={() => openEditRule(rule)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" disabled={ruleSaving} title="删除规则" onClick={() => handleDeleteRule(rule)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">#</TableHead>
                <TableHead>标题</TableHead>
                <TableHead className="w-24">状态</TableHead>
                <TableHead className="w-24">通知</TableHead>
                <TableHead className="w-40">时间</TableHead>
                <TableHead className="w-24">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">暂无公告</TableCell></TableRow>
              ) : (
                list.map((announcement, idx) => {
                  const createdAt = announcement.created_at ?? announcement.createdAt;
                  return (
                    <TableRow key={announcement.id ?? idx}>
                      <TableCell>{idx + 1}</TableCell>
                      <TableCell className="font-medium">{announcement.title}</TableCell>
                      <TableCell>{statusBadge(announcement.status ?? "active")}</TableCell>
                      <TableCell>{notifyLabel(announcement.notify_mode)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{dateLabel(createdAt)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={update.isPending} title="编辑公告" onClick={() => openEdit(announcement)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" disabled={del.isPending} title="删除公告" onClick={() => { if (!confirm("确定删除？")) return; del.mutate({ connectionId, id: announcement.id }); }}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={ruleOpen} onOpenChange={setRuleOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>{ruleForm.id ? "编辑公告规则" : "新建公告规则"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <div className="space-y-2">
                <Label>规则名称</Label>
                <Input value={ruleForm.name} onChange={(e) => setRuleForm((prev) => ({ ...prev, name: e.target.value }))} />
              </div>
              <div className="flex items-end">
                <div className="flex h-9 items-center gap-3 rounded-md border border-border/70 px-3">
                  <Label htmlFor="announcement-rule-enabled">启用</Label>
                  <Switch id="announcement-rule-enabled" checked={ruleForm.enabled} onCheckedChange={(checked) => setRuleForm((prev) => ({ ...prev, enabled: checked }))} />
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>发布状态</Label>
                <Select value={ruleForm.status} onValueChange={(value) => setRuleForm((prev) => ({ ...prev, status: value as AnnouncementStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">已发布</SelectItem>
                    <SelectItem value="draft">草稿</SelectItem>
                    <SelectItem value="archived">已归档</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>通知方式</Label>
                <Select value={ruleForm.notifyMode} onValueChange={(value) => setRuleForm((prev) => ({ ...prev, notifyMode: value as NotifyMode }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="silent">静默</SelectItem>
                    <SelectItem value="popup">弹窗</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>标题模板</Label>
              <Input value={ruleForm.titleTemplate} onChange={(e) => setRuleForm((prev) => ({ ...prev, titleTemplate: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>内容模板</Label>
              <Textarea value={ruleForm.contentTemplate} onChange={(e) => setRuleForm((prev) => ({ ...prev, contentTemplate: e.target.value }))} rows={6} />
            </div>

            <div className="space-y-2">
              <Label>可用变量</Label>
              <div className="flex flex-wrap gap-1">
                {templateVariables.map((item) => (
                  <Badge key={item} variant="outline" className="font-mono">{`{{${item}}}`}</Badge>
                ))}
              </div>
            </div>

            <div className="space-y-2 rounded-md border border-border/70 p-3">
              <div className="flex items-center justify-between gap-2">
                <Label>预览</Label>
                {preview.isFetching ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
              </div>
              <div className="space-y-2 text-sm">
                <p className="font-medium">{preview.data?.title || "-"}</p>
                <pre className="whitespace-pre-wrap rounded-md bg-secondary/60 p-3 font-sans text-sm text-secondary-foreground">{preview.data?.content || "-"}</pre>
              </div>
            </div>

            {ruleError ? <p className="text-sm text-destructive">{ruleError}</p> : null}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRuleOpen(false)} disabled={ruleSaving}>取消</Button>
            <Button onClick={handleRuleSubmit} disabled={ruleSaving}>
              {ruleSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {ruleForm.id ? "保存" : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editData.id ? "编辑公告" : "新建公告"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>标题</Label>
              <Input value={editData.title} onChange={(e) => setEditData((prev) => ({ ...prev, title: e.target.value }))} required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>状态</Label>
                <Select value={editData.status} onValueChange={(value) => setEditData((prev) => ({ ...prev, status: value as AnnouncementStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">已发布</SelectItem>
                    <SelectItem value="draft">草稿</SelectItem>
                    <SelectItem value="archived">已归档</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>通知方式</Label>
                <Select value={editData.notify_mode} onValueChange={(value) => setEditData((prev) => ({ ...prev, notify_mode: value as NotifyMode }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="silent">静默</SelectItem>
                    <SelectItem value="popup">弹窗</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>内容</Label>
              <Textarea value={editData.content} onChange={(e) => setEditData((prev) => ({ ...prev, content: e.target.value }))} rows={4} required />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>取消</Button>
            <Button onClick={handleSubmit} disabled={create.isPending || update.isPending}>
              {create.isPending || update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editData.id ? "保存" : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
