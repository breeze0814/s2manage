import type { LotteryEligibilityCondition } from "../../core/lottery-eligibility.ts";
import type { LotteryParticipationMode } from "../../core/lottery-participation.ts";

export type { LotteryEligibilityCondition } from "../../core/lottery-eligibility.ts";
export type { LotteryParticipationMode } from "../../core/lottery-participation.ts";

export const EMBED_KINDS = ["tickets", "leaderboard", "lottery", "compensation"] as const;
export type EmbedKind = typeof EMBED_KINDS[number];

export type EmbedConfig = {
  readonly kind: EmbedKind;
  readonly embedToken: string;
  readonly config: Record<string, unknown>;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type TicketTemplate = "default" | "minimal" | "support";
export type TicketStatus = "open" | "pending" | "replied" | "closed";

export type TicketEmbedSettings = {
  readonly sourceOrigin: string;
  readonly template: TicketTemplate;
  readonly maxImagesPerTicket: number;
  readonly categoryOptions: readonly string[];
  readonly priorityOptions: readonly string[];
};

export type BasicEmbedSettings = { readonly sourceOrigin: string };

export type EmbedIdentity = {
  readonly kind: EmbedKind;
  readonly embedToken: string;
  readonly srcHost: string;
  readonly srcUrl: string;
  readonly sub2apiUserId: string;
  readonly sub2apiEmail: string;
  readonly sub2apiRole: string;
  readonly sub2apiBalance: number | null;
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
  readonly status: TicketStatus;
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
  readonly attachments: readonly TicketAttachment[];
};

export type TicketDetail = Ticket & { readonly messages: readonly TicketMessage[] };

export type TicketAttachment = {
  readonly id: string;
  readonly originalName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly createdAt: string;
};

export type TicketAttachmentData = TicketAttachment & {
  readonly ticketId: string;
  readonly data: Uint8Array;
};

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
  readonly type: "balance" | "subscription";
  readonly value: number;
  readonly quantity: number;
  readonly probability: number | null;
};

export type LotteryPrizeInventory = {
  readonly prizeId: string;
  readonly awarded: number;
  readonly remaining: number;
};

export type LotteryCampaign = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly drawMode: "instant" | "scheduled";
  readonly participationMode: LotteryParticipationMode;
  readonly status: "scheduled" | "open" | "drawing" | "drawn" | "exhausted" | "cancelled";
  readonly registrationStart: string | null;
  readonly registrationEnd: string | null;
  readonly drawAt: string | null;
  readonly visibleToUsers: boolean;
  readonly eligibilityConditions: readonly LotteryEligibilityCondition[];
  readonly publicWinners: boolean;
  readonly prizes: readonly LotteryPrize[];
  readonly prizeInventory: readonly LotteryPrizeInventory[];
  readonly entryCount: number;
  readonly winnerCount: number;
  readonly currentEntry: LotteryEntry | null;
  readonly myEntries: readonly LotteryEntry[];
  readonly winners: readonly LotteryEntry[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly drawnAt: string | null;
  readonly lastError: string | null;
};

export type LotteryEntry = {
  readonly id: string;
  readonly campaignId: string;
  readonly participationKey: string;
  readonly sub2apiUserId: string;
  readonly maskedEmail: string;
  readonly status: "entered" | "won" | "not_won" | "withdrawn";
  readonly prizeId: string | null;
  readonly prizeName: string | null;
  readonly prizeType: LotteryPrize["type"] | null;
  readonly prizeValue: number | null;
  readonly redemptionCode: string | null;
  readonly rewardCodeId: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export class EmbedError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
