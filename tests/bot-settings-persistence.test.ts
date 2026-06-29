import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const appRouterSource = readFileSync("src/server/api/routers/_app.ts", "utf8");
const panelSource = readFileSync("src/components/app/bot-management-panel.tsx", "utf8");

assert.match(appRouterSource, /botSettingsRouter/, "App router should import the bot settings router");
assert.match(appRouterSource, /botSettings:\s*botSettingsRouter/, "App router should register botSettings");

assert.ok(existsSync("src/server/bot-settings.ts"), "Bot settings service should exist");
assert.ok(existsSync("src/server/api/routers/bot-settings.ts"), "Bot settings tRPC router should exist");

const serviceSource = readFileSync("src/server/bot-settings.ts", "utf8");
const routerSource = readFileSync("src/server/api/routers/bot-settings.ts", "utf8");

assert.match(serviceSource, /qqbot_config:/, "Bot settings should be stored per connection in Setting rows");
assert.match(serviceSource, /getSecretSetting/, "Bot settings should read the stored token through secret settings");
assert.match(serviceSource, /setSecretSetting/, "Bot settings should store the token through secret settings");
assert.match(serviceSource, /botUserId/, "Bot settings should persist the current bot QQ number with the connection settings");
assert.match(serviceSource, /botLoginUpdatedAt/, "Bot settings should persist when the bot login info was refreshed");
assert.match(routerSource, /get:\s*protectedProcedure/, "Bot settings router should expose a protected get endpoint");
assert.match(routerSource, /save:\s*protectedProcedure/, "Bot settings router should expose a protected save endpoint");
assert.match(routerSource, /inviteActivity:\s*protectedProcedure/, "Bot settings router should expose the invite activity endpoint");
assert.match(routerSource, /setInviteActivityEnabled:\s*protectedProcedure/, "Bot settings router should expose the invite activity toggle endpoint");
assert.match(routerSource, /connectionId:\s*z\.number\(\)\.int\(\)\.positive\(\)/, "Bot settings router should scope requests by connectionId");

assert.match(panelSource, /trpc\.botSettings\.get\.useQuery/, "Bot panel should load saved QQBot settings");
assert.match(panelSource, /trpc\.botSettings\.save\.useMutation/, "Bot panel should save QQBot settings");
assert.match(panelSource, /保存配置/, "Bot panel should keep a save action");
assert.doesNotMatch(panelSource, /<Button size="sm" disabled>\s*<Save/, "Save button should not be hard-disabled");
