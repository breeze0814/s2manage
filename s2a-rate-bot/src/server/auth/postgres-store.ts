import { execute, row, type PostgresContext } from "../infrastructure/postgres-context.ts";
import type { AdminUserRecord, AuthStore } from "./store.ts";

type AdminRow = { email: string; password_hash: string };

export function createPostgresAuthStore(context: PostgresContext): AuthStore {
  return {
    getAdmin: async () => {
      const value = await row<AdminRow>(context, "SELECT email,password_hash FROM admin_users WHERE id=1");
      return value ? { email: value.email, passwordHash: value.password_hash } : null;
    },
    createAdmin: async (admin: AdminUserRecord) => {
      const timestamp = new Date().toISOString();
      await execute(context, `INSERT INTO admin_users (id,email,password_hash,created_at,updated_at)
        VALUES (1,$1,$2,$3,$3)`, [admin.email, admin.passwordHash, timestamp]);
    },
    close: async () => undefined,
  };
}
