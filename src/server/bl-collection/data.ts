import { Prisma } from "@prisma/client";
import { db } from "@/server/db";

export type BlCollectionRateFilters = {
  connectionId?: number;
  siteId?: number;
  siteType?: "sub2api" | "new_api";
  platform?: string;
  q?: string;
  minRate?: number;
  maxRate?: number;
};

export type BlCollectionChangeFilters = {
  connectionId?: number;
  siteId?: number;
  siteType?: "sub2api" | "new_api";
  platform?: string;
  q?: string;
  limit?: number;
  offset?: number;
};

export async function blCollectionRates(filters: BlCollectionRateFilters = {}) {
  const where: Prisma.Sql[] = [Prisma.sql`1=1`];
  if (filters.connectionId) where.push(Prisma.sql`gr.connection_id = ${filters.connectionId}`);
  if (filters.siteId) where.push(Prisma.sql`gr.site_id = ${filters.siteId}`);
  if (filters.siteType) where.push(Prisma.sql`s.site_type = ${filters.siteType}`);
  if (filters.platform) where.push(Prisma.sql`gr.platform = ${filters.platform}`);
  if (filters.q) {
    const q = `%${filters.q}%`;
    where.push(Prisma.sql`(gr.name LIKE ${q} OR gr.group_id LIKE ${q} OR s.name LIKE ${q})`);
  }
  if (filters.minRate !== undefined) where.push(Prisma.sql`(gr.effective_rate / s.recharge_ratio) >= ${filters.minRate}`);
  if (filters.maxRate !== undefined) where.push(Prisma.sql`(gr.effective_rate / s.recharge_ratio) <= ${filters.maxRate}`);

  return db.$queryRaw<
    Array<{
      id: number;
      connection_id: number;
      site_id: number;
      run_id: number;
      group_id: string;
      name: string;
      platform: string | null;
      subscription_type: string | null;
      is_exclusive: boolean;
      rate_multiplier: number | null;
      user_rate: number | null;
      effective_rate: number | null;
      collected_at: Date;
      site_name: string;
      base_url: string;
      site_type: string;
      recharge_ratio: number;
      last_status: string | null;
      last_success_at: Date | null;
      actual_rate_multiplier: number | null;
      actual_user_rate: number | null;
      actual_effective_rate: number | null;
    }>
  >`
    SELECT gr.id, gr.connection_id, gr.site_id, gr.run_id, gr.group_id, gr.name, gr.platform,
           gr.subscription_type, gr.is_exclusive, gr.rate_multiplier, gr.user_rate, gr.effective_rate,
           gr.collected_at, s.name as site_name, s.base_url, s.site_type, s.recharge_ratio,
           s.last_status, s.last_success_at,
           CASE WHEN gr.rate_multiplier IS NULL THEN NULL ELSE gr.rate_multiplier / s.recharge_ratio END as actual_rate_multiplier,
           CASE WHEN gr.user_rate IS NULL THEN NULL ELSE gr.user_rate / s.recharge_ratio END as actual_user_rate,
           CASE WHEN gr.effective_rate IS NULL THEN NULL ELSE gr.effective_rate / s.recharge_ratio END as actual_effective_rate
    FROM bl_collected_group_rates gr
    JOIN bl_collection_sites s ON s.id = gr.site_id
    WHERE gr.run_id = (
      SELECT MAX(r.id)
      FROM bl_collection_runs r
      WHERE r.connection_id = gr.connection_id
        AND r.site_id = gr.site_id
        AND r.status = 'success'
    )
      AND ${Prisma.join(where, " AND ")}
    ORDER BY s.site_type, s.name, gr.platform, gr.name
  `;
}

export async function blCollectionChanges(filters: BlCollectionChangeFilters = {}) {
  const where: Prisma.Sql[] = [Prisma.sql`c.entity_type = 'group'`, Prisma.sql`c.field = 'rateMultiplier'`];
  if (filters.connectionId) where.push(Prisma.sql`c.connection_id = ${filters.connectionId}`);
  if (filters.siteId) where.push(Prisma.sql`c.site_id = ${filters.siteId}`);
  if (filters.siteType) where.push(Prisma.sql`s.site_type = ${filters.siteType}`);
  if (filters.platform) where.push(Prisma.sql`gr.platform = ${filters.platform}`);
  if (filters.q) {
    const q = `%${filters.q}%`;
    where.push(Prisma.sql`(gr.name LIKE ${q} OR c.entity_key LIKE ${q} OR s.name LIKE ${q})`);
  }
  const limit = Math.min(200, Math.max(1, filters.limit ?? 50));
  const offset = Math.max(0, filters.offset ?? 0);

  return db.$queryRaw<
    Array<{
      id: number;
      created_at: Date;
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
    }>
  >`
    SELECT c.id, c.created_at, c.site_id, s.name as site_name, s.site_type, s.recharge_ratio,
           c.entity_key as group_id, gr.name as group_name, gr.platform,
           c.old_value, c.new_value,
           CASE WHEN c.old_value IS NULL OR c.old_value = '' THEN NULL ELSE CAST(c.old_value AS REAL) / s.recharge_ratio END as actual_old_value,
           CASE WHEN c.new_value IS NULL OR c.new_value = '' THEN NULL ELSE CAST(c.new_value AS REAL) / s.recharge_ratio END as actual_new_value
    FROM bl_collected_changes c
    JOIN bl_collection_sites s ON s.id = c.site_id
    LEFT JOIN bl_collected_group_rates gr ON gr.site_id = c.site_id AND gr.run_id = c.run_id AND gr.group_id = c.entity_key
    WHERE ${Prisma.join(where, " AND ")}
    ORDER BY c.created_at DESC, c.id DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}

export async function blCollectionChangesCount(filters: BlCollectionChangeFilters = {}) {
  const where: Prisma.Sql[] = [Prisma.sql`c.entity_type = 'group'`, Prisma.sql`c.field = 'rateMultiplier'`];
  if (filters.connectionId) where.push(Prisma.sql`c.connection_id = ${filters.connectionId}`);
  if (filters.siteId) where.push(Prisma.sql`c.site_id = ${filters.siteId}`);
  if (filters.siteType) where.push(Prisma.sql`s.site_type = ${filters.siteType}`);
  if (filters.platform) where.push(Prisma.sql`gr.platform = ${filters.platform}`);
  if (filters.q) {
    const q = `%${filters.q}%`;
    where.push(Prisma.sql`(gr.name LIKE ${q} OR c.entity_key LIKE ${q} OR s.name LIKE ${q})`);
  }

  const rows = await db.$queryRaw<Array<{ total: bigint | number }>>`
    SELECT COUNT(DISTINCT c.id) as total
    FROM bl_collected_changes c
    JOIN bl_collection_sites s ON s.id = c.site_id
    LEFT JOIN bl_collected_group_rates gr ON gr.site_id = c.site_id AND gr.run_id = c.run_id AND gr.group_id = c.entity_key
    WHERE ${Prisma.join(where, " AND ")}
  `;
  return Number(rows[0]?.total ?? 0);
}

export async function blCollectionPlatforms(connectionId?: number) {
  return db.$queryRaw<Array<{ platform: string }>>`
    SELECT DISTINCT platform FROM (
      SELECT platform FROM bl_collected_group_rates
      WHERE platform != '' AND platform IS NOT NULL
      ${connectionId ? Prisma.sql`AND connection_id = ${connectionId}` : Prisma.empty}
      UNION
      SELECT platform FROM bl_collected_model_prices
      WHERE platform != '' AND platform IS NOT NULL
      ${connectionId ? Prisma.sql`AND connection_id = ${connectionId}` : Prisma.empty}
    ) p ORDER BY platform
  `.then((rows) => rows.map((row) => row.platform));
}

export async function blCollectionHealth(connectionId?: number) {
  const where = connectionId ? { connectionId } : undefined;
  const [total, online] = await Promise.all([
    db.blCollectionSite.count({ where }),
    db.blCollectionSite.count({ where: { ...where, lastStatus: "online" } }),
  ]);
  return { total_sites: total, online, offline: total - online };
}

export async function publicBlCollectionSites(connectionId?: number) {
  return db.blCollectionSite.findMany({
    where: connectionId ? { connectionId } : undefined,
    orderBy: [{ connectionId: "asc" }, { id: "asc" }],
    select: {
      id: true,
      connectionId: true,
      name: true,
      baseUrl: true,
      siteType: true,
      enabled: true,
      intervalMin: true,
      rechargeRatio: true,
      lastRunAt: true,
      lastStatus: true,
      lastError: true,
      consecutiveFailures: true,
      lastSuccessAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}
