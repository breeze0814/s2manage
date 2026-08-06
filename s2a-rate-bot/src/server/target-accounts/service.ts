import { z } from "zod";
import type { SourceRateSnapshot } from "../../adapters/source-rates.ts";
import { mapConcurrent } from "../concurrency.ts";
import type { TargetAccountStore } from "./store.ts";
import type { TargetScheduleOwnership } from "./schedule-ownership.ts";
import type { TargetAccountBinding, TargetAccountClient, TargetAccountTestExecution, TargetAccountTestState, TargetAccountView } from "./types.ts";

const accountIdSchema = z.number().int().positive();
const bindingSchema = z.object({
  sourceSiteId: z.number().int().positive(),
  sourceGroupId: z.string().trim().min(1),
  autoManageSchedulable: z.boolean().default(false),
}).nullable();
const schedulableSchema = z.boolean();

export type TargetAccountService = {
  readonly list: () => Promise<Awaited<ReturnType<TargetAccountStore["list"]>>>;
  readonly refresh: () => Promise<Awaited<ReturnType<TargetAccountStore["list"]>>>;
  readonly saveBinding: (accountId: number, binding: unknown) => Promise<Awaited<ReturnType<TargetAccountStore["get"]>>>;
  readonly setSchedulable: (accountId: number, schedulable: unknown) => Promise<Awaited<ReturnType<TargetAccountStore["get"]>>>;
  readonly testChannel: (accountId: number) => Promise<TargetAccountTestExecution>;
  readonly testAllChannels: () => Promise<Awaited<ReturnType<typeof testAllChannels>>>;
};

export function createTargetAccountService(input: AccountDependencies): TargetAccountService {
  return {
    list: async () => input.store.list(),
    refresh: async () => refreshAccounts(input),
    saveBinding: (accountId, binding) => saveBinding(input, accountId, binding),
    setSchedulable: (accountId, schedulable) => setSchedulable(input, accountId, schedulable),
    testChannel: (accountId) => testChannel(input, accountId),
    testAllChannels: () => testAllChannels(input),
  };
}

async function refreshAccounts(input: AccountDependencies) {
  await input.store.replaceAll(await input.client.listAccounts());
  return input.store.list();
}

async function saveBinding(input: AccountDependencies, rawAccountId: number, rawBinding: unknown) {
  const accountId = accountIdSchema.parse(rawAccountId);
  const binding = bindingSchema.parse(rawBinding);
  await requireAccount(input.store, accountId);
  if (binding && !bindingExists(binding, await input.sourceRates())) {
    throw new Error(`采集分组不存在: ${binding.sourceSiteId}:${binding.sourceGroupId}`);
  }
  if (binding?.autoManageSchedulable) {
    await input.scheduleOwnership.runWritable({
      accountId,
      task: async () => input.store.saveBinding(accountId, binding),
    });
  } else {
    await input.store.saveBinding(accountId, binding);
  }
  return requireAccount(input.store, accountId);
}

async function setSchedulable(input: AccountDependencies, rawAccountId: number, rawSchedulable: unknown) {
  const accountId = accountIdSchema.parse(rawAccountId);
  const schedulable = schedulableSchema.parse(rawSchedulable);
  await requireAccount(input.store, accountId);
  await applySchedulable(input, accountId, schedulable);
  return requireAccount(input.store, accountId);
}

async function testChannel(input: AccountDependencies, rawAccountId: number) {
  const account = await requireAccount(input.store, accountIdSchema.parse(rawAccountId));
  return executeChannelTest(input, account);
}

async function testAllChannels(input: AccountDependencies) {
  const accounts = await input.store.list();
  const executions = await mapConcurrent({
    items: accounts,
    concurrency: await input.testConcurrency(),
    task: (account) => executeChannelTest(input, account),
  });
  return { accounts: await input.store.list(), summary: testSummary(executions) };
}

async function executeChannelTest(input: AccountDependencies, account: TargetAccountView): Promise<TargetAccountTestExecution> {
  const startedAt = Date.now();
  let state: TargetAccountTestState;
  try {
    const result = await input.client.testChannel(account.id);
    state = {
      status: result.success ? "available" : "unavailable",
      message: result.message, latencyMs: Math.round(result.latencyMs),
      ...(result.model ? { model: result.model } : {}), testedAt: new Date().toISOString(),
    };
  } catch (error) {
    state = { status: "error", message: errorMessage(error), latencyMs: Date.now() - startedAt, testedAt: new Date().toISOString() };
  }
  await input.store.recordTest(account.id, state);
  if (account.binding?.autoManageSchedulable) await applySchedulable(input, account.id, state.status === "available");
  return { account: await requireAccount(input.store, account.id), test: state };
}

async function applySchedulable(input: AccountDependencies, accountId: number, schedulable: boolean) {
  await input.scheduleOwnership.runWritable({
    accountId,
    task: async () => {
      await input.client.setSchedulable(accountId, schedulable);
      await input.store.updateSchedulable(accountId, schedulable);
    },
  });
}

function testSummary(executions: readonly TargetAccountTestExecution[]) {
  return {
    total: executions.length,
    available: executions.filter((item) => item.test.status === "available").length,
    unavailable: executions.filter((item) => item.test.status === "unavailable").length,
    errors: executions.filter((item) => item.test.status === "error").length,
  };
}

async function requireAccount(store: TargetAccountStore, accountId: number) {
  const account = await store.get(accountId);
  if (!account) throw new Error(`目标账号不存在: ${accountId}`);
  return account;
}

function bindingExists(binding: TargetAccountBinding, rates: readonly SourceRateSnapshot[]) {
  return rates.some((rate) => rate.sourceSiteId === binding.sourceSiteId && rate.groupId === binding.sourceGroupId);
}

function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error); }

type AccountDependencies = {
  readonly client: TargetAccountClient;
  readonly store: TargetAccountStore;
  readonly sourceRates: () => Promise<readonly SourceRateSnapshot[]>;
  readonly testConcurrency: () => Promise<number>;
  readonly scheduleOwnership: Pick<TargetScheduleOwnership, "runWritable">;
};
