export type BotUserBinding = {
  readonly id: number;
  readonly qqUserId: string;
  readonly sub2UserId: number;
  readonly sub2Email: string;
  readonly sub2SnapshotJson: string;
};

export type InviteRewardGrantInput = {
  readonly periodStartDate: string;
  readonly periodEndDate: string;
  readonly inviterId: number;
  readonly inviterEmail: string;
  readonly inviterUsername: string;
  readonly activeInviteeCount: number;
  readonly inactiveInviteeCount: number;
  readonly totalInviteeCount: number;
  readonly rewardAmount: number;
};

export type InviteRewardGrant = InviteRewardGrantInput & {
  readonly id: number;
  readonly status: "pending" | "issued" | "failed";
  readonly redeemCodeId: number | null;
  readonly redeemCode: string | null;
  readonly error: string | null;
  readonly attemptCount: number;
};

export type BotStorage = {
  readonly findBindingByQqUserId: (qqUserId: string) => Promise<BotUserBinding | null>;
  readonly findBindingBySub2UserId: (sub2UserId: number) => Promise<BotUserBinding | null>;
  readonly upsertUserBinding: (binding: Omit<BotUserBinding, "id">) => Promise<BotUserBinding>;
  readonly deleteUserBinding: (qqUserId: string) => Promise<BotUserBinding | null>;
  readonly findInviteRewardGrant: (periodStartDate: string, inviterId: number) => Promise<InviteRewardGrant | null>;
  readonly upsertInviteRewardGrant: (grant: InviteRewardGrantInput) => Promise<InviteRewardGrant>;
  readonly markInviteRewardIssued: (
    id: number,
    redeemCode: { readonly id: number | null; readonly code: string },
  ) => Promise<InviteRewardGrant>;
  readonly markInviteRewardFailed: (id: number, error: string) => Promise<InviteRewardGrant>;
};
