import { z } from "zod";

const MAX_CAMPAIGN_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 2_000;
const MAX_PRIZE_NAME_LENGTH = 80;
const MAX_PRIZE_ID_LENGTH = 100;
const MAX_PRIZE_QUANTITY = 100;
const MAX_PRIZE_COUNT = 10;
const MAX_PROBABILITY = 100;
const MIN_PROBABILITY = 0.01;

const prizeSchema = z.object({
  id: z.string().trim().max(MAX_PRIZE_ID_LENGTH).optional(),
  name: z.string().trim().min(1, "奖品名称不能为空").max(MAX_PRIZE_NAME_LENGTH),
  type: z.enum(["balance", "subscription"]),
  value: z.coerce.number().finite().positive("奖励额度必须大于 0"),
  quantity: z.coerce.number().int().min(1).max(MAX_PRIZE_QUANTITY),
  probability: z.number().finite().min(MIN_PROBABILITY).max(MAX_PROBABILITY).nullable(),
});
const campaignFields = z.object({
  name: z.string().trim().min(1, "活动名称不能为空").max(MAX_CAMPAIGN_NAME_LENGTH),
  description: z.string().trim().max(MAX_DESCRIPTION_LENGTH),
  drawMode: z.enum(["instant", "scheduled"]),
  registrationStart: optionalDate(),
  registrationEnd: optionalDate(),
  drawAt: optionalDate(),
  publicWinners: z.boolean(),
  prizes: z.array(prizeSchema).min(1, "至少设置一个奖品").max(MAX_PRIZE_COUNT),
});
export type CampaignInput = z.infer<typeof campaignFields>;
const campaignSchema: z.ZodType<CampaignInput> = campaignFields.superRefine(validateCampaign);

export function parseCampaignInput(value: unknown) {
  return campaignSchema.parse(value);
}

export function campaignInputError(value: unknown) {
  const result = campaignSchema.safeParse(value);
  return result.success ? null : result.error.issues[0]?.message ?? "抽奖活动配置无效";
}

function validateCampaign(value: CampaignInput, context: z.RefinementCtx) {
  const start = dateValue(value.registrationStart);
  const end = dateValue(value.registrationEnd);
  const draw = dateValue(value.drawAt);
  if (start !== null && end !== null && start >= end) addIssue(context, "活动结束时间必须晚于开始时间", "registrationEnd");
  if (value.drawMode === "scheduled" && draw === null) addIssue(context, "定时开奖必须设置开奖时间", "drawAt");
  if (value.drawMode === "instant" && draw !== null) addIssue(context, "即时开奖不使用开奖时间", "drawAt");
  if (end !== null && draw !== null && draw < end) addIssue(context, "开奖时间不能早于报名结束时间", "drawAt");
  validateProbabilities(value, context);
  validatePrizeIds(value, context);
}

function validateProbabilities(value: CampaignInput, context: z.RefinementCtx) {
  if (value.drawMode === "scheduled") {
    if (value.prizes.some((prize) => prize.probability !== null)) {
      addIssue(context, "定时开奖不使用奖品中奖率", "prizes");
    }
    return;
  }
  if (value.prizes.some((prize) => prize.probability === null)) {
    addIssue(context, "即时开奖必须为每个奖品设置中奖率", "prizes");
    return;
  }
  const total = value.prizes.reduce((sum, prize) => sum + (prize.probability ?? 0), 0);
  if (total > MAX_PROBABILITY) addIssue(context, "奖品中奖率合计不能超过 100%", "prizes");
}

function validatePrizeIds(value: CampaignInput, context: z.RefinementCtx) {
  const ids = value.prizes.flatMap((prize) => prize.id ? [prize.id] : []);
  if (new Set(ids).size !== ids.length) addIssue(context, "奖品标识不能重复", "prizes");
}

function addIssue(context: z.RefinementCtx, message: string, path: "registrationEnd" | "drawAt" | "prizes") {
  context.addIssue({ code: "custom", message, path: [path] });
}

function optionalDate() { return z.string().datetime({ offset: true }).nullable(); }
function dateValue(value: string | null) { return value ? new Date(value).getTime() : null; }
