import { z } from "zod";
import type { PasswordService } from "./password.ts";
import type { SessionService } from "./session.ts";
import type { AuthStore } from "./store.ts";

const PASSWORD_MIN_LENGTH = 6;
const PASSWORD_MAX_LENGTH = 128;

export const authCredentialsSchema = z.object({
  email: z.string().trim().email("请输入有效邮箱").transform((value) => value.toLowerCase()),
  password: z.string().min(PASSWORD_MIN_LENGTH, "密码至少 6 位").max(PASSWORD_MAX_LENGTH, "密码过长"),
});

export type AuthCredentials = z.infer<typeof authCredentialsSchema>;
export type AuthStatus = {
  readonly initialized: boolean;
  readonly authenticated: boolean;
  readonly email: string | null;
};

export type AuthService = {
  readonly status: (token: string | null | undefined) => Promise<AuthStatus>;
  readonly setup: (credentials: AuthCredentials) => Promise<string>;
  readonly login: (credentials: AuthCredentials) => Promise<string>;
};

export function createAuthService(input: {
  readonly store: AuthStore;
  readonly passwords: PasswordService;
  readonly sessions: SessionService;
}): AuthService {
  return {
    status: (token) => authStatus(input, token),
    setup: (credentials) => setupAdmin(input, credentials),
    login: (credentials) => loginAdmin(input, credentials),
  };
}

async function authStatus(
  input: AuthDependencies,
  token: string | null | undefined,
): Promise<AuthStatus> {
  const admin = input.store.getAdmin();
  if (!admin) return { initialized: false, authenticated: false, email: null };
  const identity = await input.sessions.verify(token);
  const authenticated = identity?.email === admin.email;
  return { initialized: true, authenticated, email: authenticated ? admin.email : null };
}

async function setupAdmin(input: AuthDependencies, raw: AuthCredentials) {
  if (input.store.getAdmin()) throw new Error("管理员账号已初始化");
  const credentials = authCredentialsSchema.parse(raw);
  const passwordHash = await input.passwords.hash(credentials.password);
  input.store.createAdmin({ email: credentials.email, passwordHash });
  return input.sessions.sign({ email: credentials.email });
}

async function loginAdmin(input: AuthDependencies, raw: AuthCredentials) {
  const credentials = authCredentialsSchema.parse(raw);
  const admin = input.store.getAdmin();
  const valid = admin && admin.email === credentials.email
    ? await input.passwords.verify(credentials.password, admin.passwordHash)
    : false;
  if (!valid || !admin) throw new Error("邮箱或密码错误");
  return input.sessions.sign({ email: admin.email });
}

type AuthDependencies = {
  readonly store: AuthStore;
  readonly passwords: PasswordService;
  readonly sessions: SessionService;
};
