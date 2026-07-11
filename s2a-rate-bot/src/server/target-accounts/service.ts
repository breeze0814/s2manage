import { z } from "zod";
import type { TargetAccountStore } from "./store.ts";
import type { TargetAccountClient } from "./types.ts";

const accountIdSchema = z.number().int().positive();

export type TargetAccountService = {
  readonly list: () => Promise<ReturnType<TargetAccountStore["list"]>>;
  readonly refresh: () => Promise<ReturnType<TargetAccountStore["list"]>>;
  readonly setSchedulable: (accountId: number, schedulable: boolean) => Promise<Awaited<ReturnType<TargetAccountClient["setSchedulable"]>>>;
};

export function createTargetAccountService(input: { readonly client: TargetAccountClient; readonly store: TargetAccountStore }): TargetAccountService {
  return {
    list: async () => input.store.list(),
    refresh: async () => refreshAccounts(input),
    setSchedulable: (accountId, schedulable) => setSchedulable(input, accountId, schedulable),
  };
}

async function refreshAccounts(input: AccountDependencies) {
  input.store.replaceAll(await input.client.listAccounts());
  return input.store.list();
}

async function setSchedulable(input: AccountDependencies, accountId: number, schedulable: boolean) {
  const account = await input.client.setSchedulable(accountIdSchema.parse(accountId), z.boolean().parse(schedulable));
  input.store.save(account);
  return account;
}

type AccountDependencies = Parameters<typeof createTargetAccountService>[0];
