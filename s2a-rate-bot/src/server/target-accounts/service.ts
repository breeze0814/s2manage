import { z } from "zod";
import type { TargetAccountClient } from "./types.ts";

const accountIdSchema = z.number().int().positive();

export type TargetAccountService = {
  readonly list: () => Promise<Awaited<ReturnType<TargetAccountClient["listAccounts"]>>>;
  readonly setSchedulable: (accountId: number, schedulable: boolean) => Promise<Awaited<ReturnType<TargetAccountClient["setSchedulable"]>>>;
};

export function createTargetAccountService(client: TargetAccountClient): TargetAccountService {
  return {
    list: () => client.listAccounts(),
    setSchedulable: (accountId, schedulable) => client.setSchedulable(accountIdSchema.parse(accountId), z.boolean().parse(schedulable)),
  };
}
