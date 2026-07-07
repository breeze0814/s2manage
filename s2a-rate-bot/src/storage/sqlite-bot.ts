import type { DatabaseSync } from "node:sqlite";
import type { BotUserBinding, InviteRewardGrant, InviteRewardGrantInput } from "../bot/storage.ts";
import { execute, int, nullableNumber, number, one, text, type SqliteRow } from "./sqlite-utils.ts";

export function findBindingByQqUserId(database: DatabaseSync, qqUserId: string) {
  return bindingRow(one(database, "SELECT * FROM qq_bot_user_bindings WHERE qq_user_id = :qqUserId", { qqUserId }));
}

export function findBindingBySub2UserId(database: DatabaseSync, sub2UserId: number) {
  return bindingRow(one(database, "SELECT * FROM qq_bot_user_bindings WHERE sub2_user_id = :sub2UserId", { sub2UserId }));
}

export function upsertUserBinding(database: DatabaseSync, binding: Omit<BotUserBinding, "id">) {
  const updatedAt = new Date().toISOString();
  execute(database, `
    INSERT INTO qq_bot_user_bindings (qq_user_id, sub2_user_id, sub2_email, sub2_snapshot_json, updated_at)
    VALUES (:qqUserId, :sub2UserId, :sub2Email, :sub2SnapshotJson, :updatedAt)
    ON CONFLICT(qq_user_id) DO UPDATE SET sub2_user_id = excluded.sub2_user_id,
      sub2_email = excluded.sub2_email,
      sub2_snapshot_json = excluded.sub2_snapshot_json,
      updated_at = excluded.updated_at
  `, { ...binding, updatedAt });
  const row = findBindingByQqUserId(database, binding.qqUserId);
  if (!row) throw new Error("Failed to persist QQ bot user binding");
  return row;
}

export function deleteUserBinding(database: DatabaseSync, qqUserId: string) {
  const existing = findBindingByQqUserId(database, qqUserId);
  if (!existing) return null;
  execute(database, "DELETE FROM qq_bot_user_bindings WHERE qq_user_id = :qqUserId", { qqUserId });
  return existing;
}

export function findInviteRewardGrant(database: DatabaseSync, periodStartDate: string, inviterId: number) {
  return grantRow(one(database, `
    SELECT * FROM invite_reward_grants
    WHERE period_start_date = :periodStartDate AND inviter_id = :inviterId
  `, { periodStartDate, inviterId }));
}

export function upsertInviteRewardGrant(database: DatabaseSync, grant: InviteRewardGrantInput) {
  const updatedAt = new Date().toISOString();
  execute(database, `
    INSERT INTO invite_reward_grants (
      period_start_date, period_end_date, inviter_id, inviter_email, inviter_username,
      active_invitee_count, inactive_invitee_count, total_invitee_count, reward_amount,
      status, redeem_code_id, redeem_code, error, attempt_count, updated_at
    )
    VALUES (
      :periodStartDate, :periodEndDate, :inviterId, :inviterEmail, :inviterUsername,
      :activeInviteeCount, :inactiveInviteeCount, :totalInviteeCount, :rewardAmount,
      'pending', NULL, NULL, NULL, 0, :updatedAt
    )
    ON CONFLICT(period_start_date, inviter_id) DO UPDATE SET period_end_date = excluded.period_end_date,
      inviter_email = excluded.inviter_email,
      inviter_username = excluded.inviter_username,
      active_invitee_count = excluded.active_invitee_count,
      inactive_invitee_count = excluded.inactive_invitee_count,
      total_invitee_count = excluded.total_invitee_count,
      reward_amount = excluded.reward_amount,
      updated_at = excluded.updated_at
  `, { ...grant, updatedAt });
  const row = findInviteRewardGrant(database, grant.periodStartDate, grant.inviterId);
  if (!row) throw new Error("Failed to persist invite reward grant");
  return row;
}

export function markInviteRewardIssued(
  database: DatabaseSync,
  id: number,
  redeemCode: { readonly id: number | null; readonly code: string },
) {
  execute(database, `
    UPDATE invite_reward_grants
    SET status = 'issued',
      redeem_code_id = :redeemCodeId,
      redeem_code = :redeemCode,
      error = NULL,
      attempt_count = attempt_count + 1,
      updated_at = :updatedAt
    WHERE id = :id
  `, { id, redeemCodeId: redeemCode.id, redeemCode: redeemCode.code, updatedAt: new Date().toISOString() });
  return grantById(database, id);
}

export function markInviteRewardFailed(database: DatabaseSync, id: number, error: string) {
  execute(database, `
    UPDATE invite_reward_grants
    SET status = 'failed',
      error = :error,
      attempt_count = attempt_count + 1,
      updated_at = :updatedAt
    WHERE id = :id
  `, { id, error, updatedAt: new Date().toISOString() });
  return grantById(database, id);
}

function grantById(database: DatabaseSync, id: number) {
  const row = grantRow(one(database, "SELECT * FROM invite_reward_grants WHERE id = :id", { id }));
  if (!row) throw new Error(`Invite reward grant ${id} was not found`);
  return row;
}

function bindingRow(row: SqliteRow | null): BotUserBinding | null {
  if (!row) return null;
  return {
    id: int(row.id),
    qqUserId: text(row.qq_user_id),
    sub2UserId: int(row.sub2_user_id),
    sub2Email: text(row.sub2_email),
    sub2SnapshotJson: text(row.sub2_snapshot_json),
  };
}

function grantRow(row: SqliteRow | null): InviteRewardGrant | null {
  if (!row) return null;
  return {
    id: int(row.id),
    periodStartDate: text(row.period_start_date),
    periodEndDate: text(row.period_end_date),
    inviterId: int(row.inviter_id),
    inviterEmail: text(row.inviter_email),
    inviterUsername: text(row.inviter_username),
    activeInviteeCount: int(row.active_invitee_count),
    inactiveInviteeCount: int(row.inactive_invitee_count),
    totalInviteeCount: int(row.total_invitee_count),
    rewardAmount: number(row.reward_amount),
    status: text(row.status) as InviteRewardGrant["status"],
    redeemCodeId: nullableInt(row.redeem_code_id),
    redeemCode: nullableText(row.redeem_code),
    error: nullableText(row.error),
    attemptCount: int(row.attempt_count),
  };
}

function nullableInt(value: unknown) {
  const numeric = nullableNumber(value);
  return numeric === null ? null : Math.trunc(numeric);
}

function nullableText(value: unknown) {
  const valueText = text(value);
  return valueText ? valueText : null;
}
