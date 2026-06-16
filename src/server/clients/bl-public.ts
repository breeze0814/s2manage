import { blCollectionChanges, blCollectionHealth, blCollectionRates, publicBlCollectionSites } from "@/server/bl-collection/data";
import { normalizeRateMultiplier } from "@/server/rates";

export type BlChange = {
  created_at: string;
  site_id: number;
  site_name: string;
  site_type: string;
  recharge_ratio: number;
  group_id: string;
  group_name: string | null;
  platform: string | null;
  old_value: string | null;
  new_value: string | null;
  actual_old_value: number | null;
  actual_new_value: number | null;
};

export type BlRate = {
  site_id: number;
  site_name: string;
  group_id: string;
  name: string;
  platform: string | null;
  recharge_ratio?: number | null;
  rate_multiplier: number | null;
  user_rate?: number | null;
  effective_rate: number | null;
  actual_rate_multiplier: number | null;
  actual_user_rate?: number | null;
  actual_effective_rate?: number | null;
};

function finiteNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeRateByRechargeRatio(value: unknown, rechargeRatio: unknown) {
  const numeric = finiteNumber(value);
  if (numeric === null) return null;
  const ratio = finiteNumber(rechargeRatio);
  return ratio && ratio > 0 ? numeric / ratio : numeric;
}

export function resolveBlRateMultiplier(rate: Pick<BlRate, "actual_rate_multiplier" | "rate_multiplier" | "recharge_ratio"> | null | undefined) {
  const actual = finiteNumber(rate?.actual_rate_multiplier);
  if (actual !== null) return normalizeRateMultiplier(actual);
  const normalized = normalizeRateByRechargeRatio(rate?.rate_multiplier, rate?.recharge_ratio);
  return normalized === null ? null : normalizeRateMultiplier(normalized);
}

export function resolveBlEffectiveRate(rate: Pick<BlRate, "actual_effective_rate" | "effective_rate" | "recharge_ratio"> | null | undefined) {
  const actual = finiteNumber(rate?.actual_effective_rate);
  if (actual !== null) return normalizeRateMultiplier(actual);
  const normalized = normalizeRateByRechargeRatio(rate?.effective_rate, rate?.recharge_ratio);
  return normalized === null ? null : normalizeRateMultiplier(normalized);
}

export function resolveBlChangeNewValue(change: Pick<BlChange, "actual_new_value" | "new_value" | "recharge_ratio"> | null | undefined) {
  const actual = finiteNumber(change?.actual_new_value);
  if (actual !== null) return normalizeRateMultiplier(actual);
  const normalized = normalizeRateByRechargeRatio(change?.new_value, change?.recharge_ratio);
  return normalized === null ? null : normalizeRateMultiplier(normalized);
}

const RATES_CACHE_TTL_MS = 5_000;
const ratesCache = new Map<string, { expiresAt: number; promise: Promise<BlRate[]> }>();

export class BlPublicClient {
  constructor(private readonly connectionId?: number) {}

  async fetchSites() {
    const sites = await publicBlCollectionSites(this.connectionId);
    return sites.map((site) => ({
      id: site.id,
      name: site.name,
      base_url: site.baseUrl,
      site_type: site.siteType,
      enabled: site.enabled,
      recharge_ratio: site.rechargeRatio,
      last_status: site.lastStatus,
      last_success_at: site.lastSuccessAt?.toISOString() ?? null,
    }));
  }

  async fetchChanges(siteId?: number, limit = 100) {
    const rows = await blCollectionChanges({ connectionId: this.connectionId, siteId, limit });
    return rows.map<BlChange>((row) => ({
      created_at: row.created_at.toISOString(),
      site_id: row.site_id,
      site_name: row.site_name,
      site_type: row.site_type,
      recharge_ratio: row.recharge_ratio,
      group_id: row.group_id,
      group_name: row.group_name,
      platform: row.platform,
      old_value: row.old_value,
      new_value: row.new_value,
      actual_old_value: row.actual_old_value,
      actual_new_value: row.actual_new_value,
    }));
  }

  async fetchRates(siteId?: number, options?: { bypassCache?: boolean }) {
    const cacheKey = `${this.connectionId ?? "all"}:${siteId ?? "all"}`;
    const now = Date.now();
    const cached = ratesCache.get(cacheKey);
    if (!options?.bypassCache && cached && cached.expiresAt > now) {
      return cached.promise;
    }

    const promise = this.fetchRatesUncached(siteId);
    ratesCache.set(cacheKey, { expiresAt: now + RATES_CACHE_TTL_MS, promise });

    try {
      return await promise;
    } catch (error) {
      ratesCache.delete(cacheKey);
      throw error;
    }
  }

  private async fetchRatesUncached(siteId?: number) {
    const rows = await blCollectionRates({ connectionId: this.connectionId, siteId });
    return rows.map<BlRate>((row) => ({
      site_id: row.site_id,
      site_name: row.site_name,
      group_id: row.group_id,
      name: row.name,
      platform: row.platform,
      recharge_ratio: row.recharge_ratio,
      rate_multiplier: row.rate_multiplier,
      user_rate: row.user_rate,
      effective_rate: row.effective_rate,
      actual_rate_multiplier: row.actual_rate_multiplier,
      actual_user_rate: row.actual_user_rate,
      actual_effective_rate: row.actual_effective_rate,
    }));
  }

  async healthCheck() {
    return blCollectionHealth(this.connectionId);
  }
}
