import type { Pool } from "pg";
import { ensurePostgresLotterySchema } from "../../storage/postgres-lottery-schema.ts";
import type { LotteryStore } from "./lottery-store-contract.ts";
import {
  advancePostgresCampaigns, drawPostgresScheduled, enterPostgresScheduled, getPostgresEntry,
  listDuePostgresDraws, listPostgresEntries, recordPostgresCampaignError, settlePostgresInstant,
  withdrawPostgresEntry,
} from "./lottery-postgres-actions.ts";
import {
  cancelPostgresCampaign, createPostgresCampaign, getPostgresCampaign, listPostgresCampaigns,
  setPostgresCampaignVisibility, updatePostgresCampaign,
} from "./lottery-postgres-campaigns.ts";
import {
  claimPostgresRewardJobs, completePostgresRewardJob, failPostgresRewardJob,
} from "./lottery-postgres-rewards.ts";

export function createPostgresLotteryStore(pool: Pool): LotteryStore {
  const context = { pool, ready: ensurePostgresLotterySchema(pool) };
  return {
    listCampaigns: () => listPostgresCampaigns(context),
    getCampaign: (id) => getPostgresCampaign(context, id),
    createCampaign: (campaign) => createPostgresCampaign(context, campaign),
    updateCampaign: (campaign) => updatePostgresCampaign(context, campaign),
    setCampaignVisibility: (id, visible, at) => setPostgresCampaignVisibility(context, { id, visible, timestamp: at }),
    cancelCampaign: (id, at) => cancelPostgresCampaign(context, { id, timestamp: at }),
    listEntries: (campaignId) => listPostgresEntries(context, campaignId),
    getEntry: (campaignId, userId, participationKey) => getPostgresEntry(context, { campaignId, userId, participationKey }),
    enterScheduled: (entry) => enterPostgresScheduled(context, entry),
    settleInstant: (input) => settlePostgresInstant(context, input),
    withdraw: (input) => withdrawPostgresEntry(context, input),
    drawScheduled: (input) => drawPostgresScheduled(context, input),
    advanceDueCampaigns: (at) => advancePostgresCampaigns(context, at),
    listDueScheduledCampaignIds: (at) => listDuePostgresDraws(context, at),
    recordCampaignError: (campaignId, message, at) => recordPostgresCampaignError(context, { campaignId, message, timestamp: at }),
    claimRewardJobs: (input) => claimPostgresRewardJobs(context, input),
    completeRewardJob: (input) => completePostgresRewardJob(context, input),
    failRewardJob: (input) => failPostgresRewardJob(context, input),
    close: () => pool.end(),
  };
}
