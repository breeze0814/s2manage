import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildQqBotSourceSiteChangePrivateMessage,
  buildQqBotTargetGroupRateChangeMessage,
  defaultQqBotSettings,
} from "../src/server/bot-settings";

const targetMessage = buildQqBotTargetGroupRateChangeMessage({
  changedGroupName: "余额",
  oldRate: 1,
  newRate: 1.1167,
  groups: [
    { id: 1, name: "余额", status: "active", rate_multiplier: 1.1167 },
    { id: 2, name: "关闭分组", status: "disabled", rate_multiplier: 9 },
    { id: 3, name: "VIP", status: "active", rate_multiplier: 0.9 },
  ],
  generatedAt: new Date("2026-07-01T04:30:00.000Z"),
});

assert.match(targetMessage, /^分组倍率已更新\n/);
assert.match(targetMessage, /变动分组：余额 1 -> 1.12/);
assert.match(targetMessage, /当前分组倍率：/);
assert.match(targetMessage, /- 余额：1.12/);
assert.match(targetMessage, /- VIP：0.9/);
assert.doesNotMatch(targetMessage, /关闭分组/);
assert.doesNotMatch(targetMessage, /来源/);
assert.doesNotMatch(targetMessage, /source/i);

const sourceMessage = buildQqBotSourceSiteChangePrivateMessage({
  siteName: "源站A",
  changes: [
    {
      entityType: "group",
      entityKey: "vip",
      field: "effectiveRate",
      oldValue: "1",
      newValue: "1.1167",
      changeType: "modified",
      groupName: "VIP",
    },
    {
      entityType: "model",
      entityKey: "openai|gpt-4o",
      field: "modelPrice",
      oldValue: "2",
      newValue: "2.5",
      changeType: "modified",
    },
  ],
  generatedAt: new Date("2026-07-01T04:30:00.000Z"),
});

assert.match(sourceMessage, /^源站信息变动\n/);
assert.match(sourceMessage, /源站：源站A/);
assert.match(sourceMessage, /VIP：effectiveRate 1 -> 1.1167/);
assert.match(sourceMessage, /openai\|gpt-4o：modelPrice 2 -> 2.5/);

assert.equal(defaultQqBotSettings.sourceChangePrivatePushEnabled, false);
assert.equal(defaultQqBotSettings.sourceChangePrivatePushQq, "");

const serviceSource = readFileSync("src/server/bot-settings.ts", "utf8");
const routerSource = readFileSync("src/server/api/routers/bot-settings.ts", "utf8");
const panelSource = readFileSync("src/components/app/bot-management-panel.tsx", "utf8");
const workerSource = readFileSync("src/worker/monitor.ts", "utf8");
const rateSyncSource = readFileSync("src/server/bl-rate-sync.ts", "utf8");

assert.match(routerSource, /sourceChangePrivatePushEnabled:\s*z\.boolean\(\)/);
assert.match(routerSource, /sourceChangePrivatePushQq:\s*z\.string\(\)\.trim\(\)\.max\(100\)/);
assert.match(panelSource, /sourceChangePrivatePushEnabled/);
assert.match(panelSource, /sourceChangePrivatePushQq/);
assert.match(panelSource, /源站信息变动推送/);
assert.match(workerSource, /sendQqBotSourceSiteChangePrivatePush/);
assert.match(workerSource, /notifySourceSiteChanges/);
assert.match(workerSource, /sendQqBotTargetGroupRateChangePush/);
assert.match(rateSyncSource, /sendQqBotTargetGroupRateChangePush/);
assert.match(serviceSource, /sendQqBotTargetGroupRateChangePush/);
assert.match(serviceSource, /sendQqBotSourceSiteChangePrivatePush/);
