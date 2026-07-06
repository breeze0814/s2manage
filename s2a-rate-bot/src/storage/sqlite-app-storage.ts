import { DatabaseSync } from "node:sqlite";
import { initializeSqliteSchema } from "./sqlite-schema.ts";
import { readAppConfig, readSource } from "./sqlite-read.ts";
import {
  saveBot,
  saveGroupRule,
  saveProxy,
  saveSourceOverview,
  saveTarget,
  saveTargetAccount,
  saveTargetAccounts,
  saveTargetGroup,
  saveTargetGroups,
  saveWorker,
} from "./sqlite-write.ts";
import type {
  AppStorage,
  BotSettings,
  GroupRuleSettings,
  ProxySettings,
  SourceOverviewInput,
  TargetAccountSnapshot,
  TargetGroupSnapshot,
  TargetSettings,
  WorkerSettings,
} from "./app-config.ts";
import { ensureDatabaseDirectory, sqlitePath } from "./sqlite-utils.ts";

export function createSqliteAppStorage(databaseUrl: string): AppStorage {
  const databasePath = sqlitePath(databaseUrl);
  ensureDatabaseDirectory(databasePath);
  return new SqliteAppStorage(new DatabaseSync(databasePath, { timeout: 5_000 }));
}

class SqliteAppStorage implements AppStorage {
  constructor(private readonly database: DatabaseSync) {
    initializeSqliteSchema(database);
  }

  async getAppConfig() {
    return readAppConfig(this.database);
  }

  async saveTargetSettings(settings: TargetSettings) {
    saveTarget(this.database, settings);
    return settings;
  }

  async saveBotSettings(settings: BotSettings) {
    saveBot(this.database, settings);
    return settings;
  }

  async saveProxySettings(settings: ProxySettings) {
    saveProxy(this.database, settings);
    return settings;
  }

  async saveWorkerSettings(settings: WorkerSettings) {
    saveWorker(this.database, settings);
    return settings;
  }

  async saveTargetGroups(groups: readonly TargetGroupSnapshot[]) {
    saveTargetGroups(this.database, groups);
  }

  async saveTargetGroup(group: TargetGroupSnapshot) {
    saveTargetGroup(this.database, group);
  }

  async saveTargetAccounts(accounts: readonly TargetAccountSnapshot[]) {
    saveTargetAccounts(this.database, accounts);
  }

  async saveTargetAccount(account: TargetAccountSnapshot) {
    saveTargetAccount(this.database, account);
  }

  async saveGroupRule(rule: GroupRuleSettings) {
    saveGroupRule(this.database, rule);
    return rule;
  }

  async saveSourceOverview(input: SourceOverviewInput) {
    saveSourceOverview(this.database, input);
    return readSource(this.database, input.site.id);
  }

  close() {
    this.database.close();
  }
}
