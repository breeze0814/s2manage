CREATE TABLE IF NOT EXISTS "qq_bot_user_bindings" (
  "id" SERIAL PRIMARY KEY,
  "connection_id" INTEGER NOT NULL,
  "qq_user_id" TEXT NOT NULL,
  "sub2_user_id" INTEGER NOT NULL,
  "sub2_email" TEXT NOT NULL,
  "sub2_snapshot" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "qq_bot_user_bindings_connection_id_fkey"
    FOREIGN KEY ("connection_id") REFERENCES "connections" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "qq_bot_user_bindings_connection_id_qq_user_id_key"
  ON "qq_bot_user_bindings"("connection_id", "qq_user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "qq_bot_user_bindings_connection_id_sub2_user_id_key"
  ON "qq_bot_user_bindings"("connection_id", "sub2_user_id");
CREATE INDEX IF NOT EXISTS "qq_bot_user_bindings_connection_id_qq_user_id_idx"
  ON "qq_bot_user_bindings"("connection_id", "qq_user_id");
CREATE INDEX IF NOT EXISTS "qq_bot_user_bindings_connection_id_sub2_user_id_idx"
  ON "qq_bot_user_bindings"("connection_id", "sub2_user_id");
