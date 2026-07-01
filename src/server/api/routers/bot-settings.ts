import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
  getQqBotGroups,
  getQqBotSettings,
  getQqBotWsLogs,
  saveQqBotSettings,
  sendQqBotManualMessage,
  sendQqBotTestAnalysis,
  startQqBotWsListener,
  stopQqBotWsListener,
  testQqBotWsConnection,
} from "@/server/bot-settings";
import {
  loadQqBotAffiliateActivity,
  setQqBotAffiliateActivityEnabled,
} from "@/server/qqbot-affiliate-activity";

const qqBotSettingsInput = z.object({
  connectionId: z.number().int().positive(),
  enabled: z.boolean(),
  wsUrl: z.string().trim().min(1).max(500),
  token: z.string().max(1000),
  targetGroupId: z.string().trim().max(100),
  rateChangePushEnabled: z.boolean(),
  sourceChangePrivatePushEnabled: z.boolean(),
  sourceChangePrivatePushQq: z.string().trim().max(100),
  mentionKeywordEnabled: z.boolean(),
  liveRateTestEnabled: z.boolean(),
  keywordRules: z.string().max(5000),
  testMessageTemplate: z.string().max(5000),
  botUserId: z.string().trim().max(100).optional(),
  botNickname: z.string().max(500).optional(),
  botLoginUpdatedAt: z.string().nullable().optional(),
});

export const botSettingsRouter = createTRPCRouter({
  get: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive() }))
    .query(({ input }) => getQqBotSettings(input.connectionId)),
  save: protectedProcedure
    .input(qqBotSettingsInput)
    .mutation(({ input }) =>
      saveQqBotSettings(input.connectionId, {
        enabled: input.enabled,
        wsUrl: input.wsUrl,
        token: input.token,
        targetGroupId: input.targetGroupId,
        rateChangePushEnabled: input.rateChangePushEnabled,
        sourceChangePrivatePushEnabled: input.sourceChangePrivatePushEnabled,
        sourceChangePrivatePushQq: input.sourceChangePrivatePushQq,
        mentionKeywordEnabled: input.mentionKeywordEnabled,
        liveRateTestEnabled: input.liveRateTestEnabled,
        keywordRules: input.keywordRules,
        testMessageTemplate: input.testMessageTemplate,
        botUserId: input.botUserId ?? "",
        botNickname: input.botNickname ?? "",
        botLoginUpdatedAt: input.botLoginUpdatedAt ?? null,
      }),
    ),
  sendTestAnalysis: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive() }))
    .mutation(({ input }) => sendQqBotTestAnalysis(input.connectionId)),
  sendManualMessage: protectedProcedure
    .input(z.object({
      connectionId: z.number().int().positive(),
      targetType: z.enum(["group", "private"]),
      targetId: z.string().trim().min(1).max(100),
      message: z.string().trim().min(1).max(5000),
    }))
    .mutation(({ input }) =>
      sendQqBotManualMessage(input.connectionId, {
        targetType: input.targetType,
        targetId: input.targetId,
        message: input.message,
      }),
    ),
  testWsConnection: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive() }))
    .mutation(({ input }) => testQqBotWsConnection(input.connectionId)),
  startWsListener: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive() }))
    .mutation(({ input }) => startQqBotWsListener(input.connectionId)),
  stopWsListener: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive() }))
    .mutation(({ input }) => stopQqBotWsListener(input.connectionId)),
  wsLogs: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive() }))
    .query(({ input }) => getQqBotWsLogs(input.connectionId)),
  groups: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive() }))
    .query(({ input }) => getQqBotGroups(input.connectionId)),
  inviteActivity: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive(), qqUserId: z.string().trim().min(1).optional(), currentDate: z.date().optional() }))
    .query(({ input }) => loadQqBotAffiliateActivity({
      connectionId: input.connectionId,
      qqUserId: input.qqUserId,
      currentDate: input.currentDate,
    })),
  setInviteActivityEnabled: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive(), enabled: z.boolean() }))
    .mutation(({ input }) => setQqBotAffiliateActivityEnabled({
      connectionId: input.connectionId,
      enabled: input.enabled,
    })),
});
