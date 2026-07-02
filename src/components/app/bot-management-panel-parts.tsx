"use client";

import type { ReactNode } from "react";
import { Bot, ListChecks, Radio, Save, Send, SlidersHorizontal } from "lucide-react";
import { PanelActions, PanelHeader } from "@/components/app/panel-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export type QqBotDraft = {
  enabled: boolean;
  wsUrl: string;
  token: string;
  targetGroupId: string;
  rateChangePushEnabled: boolean;
  sourceChangePrivatePushEnabled: boolean;
  sourceChangePrivatePushQq: string;
  mentionKeywordEnabled: boolean;
  keywordRules: string;
  botUserId: string;
  botNickname: string;
  botLoginUpdatedAt: string | null;
};

export type QqBotWsLog = {
  time: string;
  type: string;
  message: string;
};

export type QqBotGroup = {
  groupId: string;
  groupName: string;
  memberCount: number | null;
  maxMemberCount: number | null;
};

type SetDraftField = <K extends keyof QqBotDraft>(key: K, value: QqBotDraft[K]) => void;

function FeatureSwitch({
  id,
  title,
  description,
  checked,
  onChange,
}: {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex min-h-20 items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2.5 transition-colors hover:bg-muted/30">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm">
          {title}
        </Label>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function qqGroupLabel(group: QqBotGroup) {
  const members = group.memberCount === null ? "" : `，${group.memberCount}${group.maxMemberCount === null ? "" : `/${group.maxMemberCount}`} 人`;
  return `${group.groupName}（${group.groupId}${members}）`;
}

export function BotHeader({
  actionDisabled,
  connectionLabel,
  enabled,
  isLoading,
  onSave,
  onTestWs,
  saving,
  testingWs,
}: {
  actionDisabled: boolean;
  connectionLabel: string;
  enabled: boolean;
  isLoading: boolean;
  onSave: () => void;
  onTestWs: () => void;
  saving: boolean;
  testingWs: boolean;
}) {
  return (
    <PanelHeader
      title={(
        <span className="flex min-w-0 items-center gap-2">
          <Bot className="size-4 text-primary" />
          QQBot 管理
        </span>
      )}
      description={`${connectionLabel}，集中管理接入配置、群指令、消息发送和 WS 日志。`}
      meta={(
        <Badge variant={enabled ? "success" : "secondary"}>{enabled ? "已启用" : "未启用"}</Badge>
      )}
      actions={(
        <PanelActions>
          <Button variant="outline" size="sm" onClick={onTestWs} disabled={actionDisabled}>
            <Radio className="size-4" />
            {testingWs ? "测试中..." : "测试 WS"}
          </Button>
          <Button size="sm" onClick={onSave} disabled={isLoading || saving}>
            <Save className="size-4" />
            {saving ? "保存中..." : "保存配置"}
          </Button>
        </PanelActions>
      )}
    />
  );
}

export function BasicConfigCard({
  draft,
  groups,
  groupsFetching,
  groupsLoading,
  setField,
}: {
  draft: QqBotDraft;
  groups: QqBotGroup[];
  groupsFetching: boolean;
  groupsLoading: boolean;
  setField: SetDraftField;
}) {
  return (
    <Card>
      <CardHeader className="px-3 py-2.5">
        <CardTitle className="flex items-center gap-2 text-sm">
          <SlidersHorizontal className="size-4 text-primary" />
          基本配置
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 px-3 pb-3 lg:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_minmax(200px,0.8fr)_minmax(280px,1.1fr)]">
        <div className="space-y-1.5">
          <Label htmlFor="qqbot-ws-url" className="text-xs">NapCat WebSocket 地址</Label>
          <Input id="qqbot-ws-url" value={draft.wsUrl} placeholder="ws://localhost:3001" onChange={(event) => setField("wsUrl", event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="qqbot-token" className="text-xs">NapCat Token</Label>
          <PasswordInput id="qqbot-token" value={draft.token} placeholder="可选" autoComplete="new-password" onChange={(event) => setField("token", event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="qqbot-target-group-id" className="text-xs">目标 QQ 群号</Label>
          <Select value={draft.targetGroupId} onValueChange={(value) => setField("targetGroupId", value)}>
            <SelectTrigger id="qqbot-target-group-id">
              <SelectValue placeholder={groupsLoading ? "加载群组..." : "选择 QQ 群"} />
            </SelectTrigger>
            <SelectContent>
              {groups.map((group) => (
                <SelectItem key={group.groupId} value={group.groupId}>
                  {qqGroupLabel(group)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            群组列表：已加载 {groups.length} 个群{groupsFetching ? "，正在刷新" : ""}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function FeatureCommandCard({
  activitySlot,
  commandGuide,
  draft,
  setField,
}: {
  activitySlot: ReactNode;
  commandGuide: string;
  draft: QqBotDraft;
  setField: SetDraftField;
}) {
  return (
    <Card>
      <CardHeader className="px-3 py-2.5">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ListChecks className="size-4 text-primary" />
          功能与指令
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-3 pb-3">
        <div className="grid gap-2 lg:grid-cols-2">
          {activitySlot}
          <FeatureSwitch id="qqbot-enabled" title="启用 QQBot" description="控制当前连接是否开启 QQBot 能力。" checked={draft.enabled} onChange={(checked) => setField("enabled", checked)} />
          <FeatureSwitch id="qqbot-rate-change-push" title="分组倍率变动推送" description="目标分组倍率变化后向目标 QQ 群发送说明。" checked={draft.rateChangePushEnabled} onChange={(checked) => setField("rateChangePushEnabled", checked)} />
          <FeatureSwitch id="qqbot-source-change-private-push" title="源站信息变动推送" description="采集源站信息发生变化后私聊发送源站变动明细。" checked={draft.sourceChangePrivatePushEnabled} onChange={(checked) => setField("sourceChangePrivatePushEnabled", checked)} />
          <div className="space-y-1.5 rounded-md border border-border/70 px-2.5 py-2">
            <Label htmlFor="qqbot-source-change-private-qq" className="text-sm">
              源站变动通知 QQ
            </Label>
            <Input
              id="qqbot-source-change-private-qq"
              value={draft.sourceChangePrivatePushQq}
              placeholder="填写接收私聊通知的 QQ 号"
              onChange={(event) => setField("sourceChangePrivatePushQq", event.target.value)}
            />
          </div>
          <FeatureSwitch id="qqbot-mention-keyword" title="@ 关键字触发" description="仅目标 QQ 群内以 @Bot 开头的指令会触发。" checked={draft.mentionKeywordEnabled} onChange={(checked) => setField("mentionKeywordEnabled", checked)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="qqbot-command-guide" className="text-xs">支持的 @Bot 指令</Label>
          <pre id="qqbot-command-guide" className="whitespace-pre-wrap rounded-md border border-border/70 bg-muted/30 px-3 py-2 font-mono text-xs leading-5 text-muted-foreground">
            {commandGuide}
          </pre>
        </div>
      </CardContent>
    </Card>
  );
}

export function ManualMessageCard({
  canSend,
  message,
  onMessageChange,
  onSend,
  sending,
  targetGroupId,
}: {
  canSend: boolean;
  message: string;
  onMessageChange: (value: string) => void;
  onSend: () => void;
  sending: boolean;
  targetGroupId: string;
}) {
  return (
    <Card>
      <CardHeader className="px-3 py-2.5">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Send className="size-4 text-primary" />
          消息发送
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 px-3 pb-3">
        <div className="flex flex-col gap-1 lg:flex-row lg:items-center lg:justify-between">
          <Label htmlFor="qqbot-manual-message" className="text-xs">目标群消息</Label>
          <span className="text-xs text-muted-foreground">发送到：{targetGroupId ? `QQ 群 ${targetGroupId}` : "请选择群组"}</span>
        </div>
        <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
          <Textarea id="qqbot-manual-message" className="min-h-24" value={message} placeholder="输入要发送到当前 QQ 群的消息" onChange={(event) => onMessageChange(event.target.value)} />
          <Button className="lg:self-end" size="sm" onClick={onSend} disabled={!canSend}>
            <Send className="size-4" />
            {sending ? "发送中..." : "发送消息"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
