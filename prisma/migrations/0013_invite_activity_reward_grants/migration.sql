CREATE TABLE "invite_activity_reward_grants" (
  "id" SERIAL NOT NULL,
  "connection_id" INTEGER NOT NULL,
  "period_start_date" TEXT NOT NULL,
  "period_end_date" TEXT NOT NULL,
  "inviter_id" INTEGER NOT NULL,
  "inviter_email" TEXT NOT NULL,
  "inviter_username" TEXT,
  "active_invitee_count" INTEGER NOT NULL DEFAULT 0,
  "inactive_invitee_count" INTEGER NOT NULL DEFAULT 0,
  "total_invitee_count" INTEGER NOT NULL DEFAULT 0,
  "reward_amount" DOUBLE PRECISION NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "redeem_code_id" INTEGER,
  "redeem_code" TEXT,
  "error" TEXT,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "issued_at" TIMESTAMPTZ(3),
  "last_attempt_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "invite_activity_reward_grants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invite_activity_reward_grants_connection_id_period_start_date_inviter_id_key"
  ON "invite_activity_reward_grants"("connection_id", "period_start_date", "inviter_id");

CREATE INDEX "invite_activity_reward_grants_connection_id_period_start_date_status_idx"
  ON "invite_activity_reward_grants"("connection_id", "period_start_date", "status");

CREATE INDEX "invite_activity_reward_grants_connection_id_inviter_id_idx"
  ON "invite_activity_reward_grants"("connection_id", "inviter_id");

ALTER TABLE "invite_activity_reward_grants"
  ADD CONSTRAINT "invite_activity_reward_grants_connection_id_fkey"
  FOREIGN KEY ("connection_id") REFERENCES "connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
