import { createJsonHttpClient } from "../../adapters/http-client.ts";
import type { SettingsService } from "../settings/service.ts";
import { createSub2TargetAccountClient } from "../target-accounts/client.ts";
import type { TargetAccountStore } from "../target-accounts/store.ts";
import { HealthPolicyConflictError } from "../connection-health/errors.ts";
import type { ConnectionHealthGateway } from "./types.ts";

export function createRuntimeConnectionHealthGateway(
  input: Readonly<{
    settings: Pick<SettingsService, "get">;
    snapshots: Pick<TargetAccountStore, "get" | "replaceAll" | "updateSchedulable">;
  }>,
): ConnectionHealthGateway {
  return {
    probe: async (accountId) => (await targetClient(input.settings)).testChannel(accountId),
    readSchedulable: async (accountId) => readSchedulable(input, accountId),
    assertSchedulableControl: (accountId) => assertSchedulableControl(input.snapshots, accountId),
    setSchedulable: async (accountId, schedulable) => {
      await (await targetClient(input.settings)).setSchedulable(accountId, schedulable);
      input.snapshots.updateSchedulable(accountId, schedulable);
    },
  };
}

async function readSchedulable(input: RuntimeHealthGatewayInput, accountId: number) {
  const accounts = await (await targetClient(input.settings)).listAccounts();
  input.snapshots.replaceAll(accounts);
  const account = accounts.find((item) => item.id === accountId);
  if (!account) throw new Error(`目标账号不存在: ${accountId}`);
  return account.schedulable;
}

function assertSchedulableControl(
  snapshots: Pick<TargetAccountStore, "get">,
  accountId: number,
) {
  const account = snapshots.get(accountId);
  if (!account) throw new Error(`目标账号本地快照不存在: ${accountId}`);
  if (account.binding?.autoManageSchedulable) {
    throw new HealthPolicyConflictError(`目标账号 ${accountId} 已启用账号测试自动调度，不能由连接健康治理接管`);
  }
}

async function targetClient(settingsService: Pick<SettingsService, "get">) {
  const settings = await settingsService.get();
  if (!settings.target) throw new Error("请先配置目标站");
  const http = createJsonHttpClient({
    timeoutMs: settings.worker.timeoutSeconds * 1_000,
    proxyUrl: settings.proxy.enabled ? settings.proxy.proxyUrl : null,
  });
  return createSub2TargetAccountClient({
    baseUrl: settings.target.baseUrl,
    adminApiKey: settings.target.adminApiKey,
    http,
  });
}

type RuntimeHealthGatewayInput = Parameters<typeof createRuntimeConnectionHealthGateway>[0];
