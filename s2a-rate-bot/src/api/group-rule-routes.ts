import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { evaluateRateRule } from "../core/rate-rule.ts";
import { sourceRateKey, type SourceRateSnapshot } from "../adapters/source-rates.ts";
import { Sub2ApiAdminTarget, type Sub2ApiGroup } from "../adapters/sub2api-admin.ts";
import type { AppStorage, SourceSiteConfig, TargetGroupSnapshot } from "../storage/app-config.ts";
import { parseGroupRule } from "./group-rule-schema.ts";
import { BadRequestError, readJsonBody, sendJson } from "./http.ts";

const targetConfigSchema = z.object({
  baseUrl: z.string().trim().optional(),
  adminApiKey: z.string().trim().optional(),
});

export async function handleApplyGroupRule(input: {
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
  readonly storage: AppStorage | null;
}) {
  const body = await readJsonBody(input.request);
  const storage = requireStorage(input.storage);
  const config = await storage.getAppConfig();
  const targetInput = targetConfigSchema.parse(body);
  const target = {
    baseUrl: targetInput.baseUrl || config.target?.baseUrl,
    adminApiKey: targetInput.adminApiKey || config.target?.adminApiKey,
  };
  if (!target.baseUrl || !target.adminApiKey) throw new BadRequestError("目标站点配置不完整");
  const rule = parseGroupRule(body);
  const nextRate = evaluateRateRule({
    rule,
    sourceRates: selectedSourceRates(config.sources, rule.sourceGroupIds),
    currentRate: rule.currentRate,
  });
  const client = new Sub2ApiAdminTarget(target.baseUrl, target.adminApiKey);
  const group = await client.updateGroupRateMultiplier(rule.targetGroupId, nextRate);
  await storage.saveTargetGroup(targetGroupSnapshot(group));
  const savedRule = await storage.saveGroupRule({ ...rule, currentRate: group.rate_multiplier ?? nextRate });
  sendJson(input.response, 200, { group, rule: savedRule, nextRate });
}

function selectedSourceRates(sources: readonly SourceSiteConfig[], ids: readonly string[]) {
  const byId = sourceRateMap(sources);
  const values = ids.map((id) => byId.get(id)?.effectiveRate ?? null);
  const missingIds = ids.filter((id, index) => values[index] === null);
  if (missingIds.length > 0) throw new Error(`采集源分组不存在: ${missingIds.join(", ")}`);
  return values;
}

function sourceRateMap(sources: readonly SourceSiteConfig[]) {
  const rates = new Map<string, SourceRateSnapshot>();
  for (const source of sources) {
    for (const rate of source.rates) {
      rates.set(sourceRateKey(rate), rate);
      rates.set(rate.groupId, rate);
    }
  }
  return rates;
}

function targetGroupSnapshot(group: Sub2ApiGroup): TargetGroupSnapshot {
  return {
    id: group.id,
    name: group.name,
    status: group.status ?? "active",
    rate_multiplier: group.rate_multiplier ?? null,
  };
}

function requireStorage(storage: AppStorage | null) {
  if (!storage) throw new Error("DATABASE_URL is required for group rule application");
  return storage;
}
