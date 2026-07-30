export const EMBED_KINDS = ["tickets", "leaderboard", "lottery"] as const;
export type EmbedKind = typeof EMBED_KINDS[number];

export type EmbedConfig = {
  readonly kind: EmbedKind;
  readonly embedToken: string;
  readonly config: Record<string, unknown>;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type EmbedIdentity = {
  readonly kind: EmbedKind;
  readonly embedToken: string;
  readonly srcHost: string;
  readonly srcUrl: string;
  readonly sub2apiUserId: string;
  readonly sub2apiEmail: string;
  readonly sub2apiRole: string;
};

export type EmbedSessionRequest = {
  readonly kind: EmbedKind;
  readonly embedToken: string;
  readonly sub2apiToken: string;
  readonly userId?: string;
  readonly srcHost: string;
  readonly srcUrl?: string;
};

export type Ticket = {
  readonly id: string;
  readonly srcHost: string;
  readonly srcUrl: string;
  readonly sub2apiUserId: string;
  readonly sub2apiEmail: string;
  readonly sub2apiRole: string;
  readonly manualEmail: string;
  readonly title: string;
  readonly status: "open" | "pending" | "closed";
  readonly category: string;
  readonly priority: string;
  readonly lastMessageAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type TicketMessage = {
  readonly id: string;
  readonly ticketId: string;
  readonly authorType: "customer" | "admin";
  readonly authorName: string;
  readonly body: string;
  readonly createdAt: string;
};

export type TicketDetail = Ticket & { readonly messages: readonly TicketMessage[] };

export type LeaderboardRow = {
  readonly rank: number;
  readonly userId: string;
  readonly email: string;
  readonly requests: number;
  readonly totalTokens: number;
  readonly actualCost: number;
};

export type Leaderboard = {
  readonly startDate: string;
  readonly endDate: string;
  readonly timezone: "Asia/Shanghai";
  readonly rows: readonly LeaderboardRow[];
  readonly currentUserId: string | null;
};

export type LotteryPrize = {
  readonly id: string;
  readonly name: string;
  readonly quantity: number;
  readonly weight: number;
};

export type LotteryCampaign = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly drawMode: "instant" | "scheduled";
  readonly status: "scheduled" | "open" | "drawn" | "cancelled";
  readonly registrationStart: string | null;
  readonly registrationEnd: string | null;
  readonly drawAt: string | null;
  readonly publicWinners: boolean;
  readonly prizes: readonly LotteryPrize[];
  readonly entryCount: number;
  readonly winnerCount: number;
  readonly currentEntry: LotteryEntry | null;
  readonly winners: readonly LotteryEntry[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly drawnAt: string | null;
};

export type LotteryEntry = {
  readonly id: string;
  readonly campaignId: string;
  readonly sub2apiUserId: string;
  readonly maskedEmail: string;
  readonly status: "entered" | "won" | "not_won" | "withdrawn";
  readonly prizeId: string | null;
  readonly prizeName: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export class EmbedError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
