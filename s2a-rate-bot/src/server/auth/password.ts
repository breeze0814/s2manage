import { compare, hash } from "bcryptjs";

const PASSWORD_COST = 12;

export type PasswordService = {
  readonly hash: (password: string) => Promise<string>;
  readonly verify: (password: string, passwordHash: string) => Promise<boolean>;
};

export function createBcryptPasswordService(): PasswordService {
  return {
    hash: (password) => hash(password, PASSWORD_COST),
    verify: (password, passwordHash) => compare(password, passwordHash),
  };
}
