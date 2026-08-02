import type { ConnectionContext } from "./context.ts";
import { normalize } from "./model.ts";
import type {
  ConnectionGroupType, ConnectionSourceRate, ConnectionSourceSite,
  ConnectionTargetGroup, RealConnection,
} from "./types.ts";
import type { ParsedCreate } from "./validation.ts";

export type ResolvedConnectionContext = Readonly<{
  site: ConnectionSourceSite;
  rate: ConnectionSourceRate;
  groups: readonly ConnectionTargetGroup[];
  targetGroups: readonly ConnectionTargetGroup[];
}>;

export function resolveRequest(context: ConnectionContext, parsed: ParsedCreate) {
  return resolveContext(context, {
    sourceSiteId: parsed.sourceSiteId,
    sourceGroupId: parsed.sourceGroupId,
    targetGroupIds: parsed.targetGroupIds,
    groupType: parsed.groupType,
  });
}

export function resolveStored(context: ConnectionContext, connection: RealConnection) {
  return resolveContext(context, {
    sourceSiteId: connection.sourceSiteId,
    sourceGroupId: connection.sourceGroupId,
    targetGroupIds: connection.targetGroupIds,
    groupType: connection.groupType,
  });
}

export function mappedGroupIds(
  groups: readonly ConnectionTargetGroup[],
  siteId: number,
  groupId: string,
) {
  return groups.filter((group) => group.bindings.some((binding) => (
    binding.sourceSiteId === siteId && binding.sourceGroupId === groupId
  ))).map((group) => group.id);
}

async function resolveContext(
  context: ConnectionContext,
  input: ResolveInput,
): Promise<ResolvedConnectionContext> {
  const [sites, rates, groups] = await Promise.all([
    context.sources.sites(), context.sources.rates(), context.pricing.groups(),
  ]);
  const site = sites.find((item) => item.id === input.sourceSiteId);
  if (!site) throw new Error(`采集站不存在: ${input.sourceSiteId}`);
  if (!site.enabled) throw new Error(`采集站已停用: ${site.name}`);
  const rate = rates.find((item) => item.sourceSiteId === site.id
    && item.groupId === input.sourceGroupId && !item.deleted);
  if (!rate) throw new Error(`采集分组不存在: ${site.id}:${input.sourceGroupId}`);
  const targetGroups = selectTargetGroups(groups, input.targetGroupIds, input.groupType);
  return { site, rate, groups, targetGroups };
}

function selectTargetGroups(
  groups: readonly ConnectionTargetGroup[],
  ids: readonly number[],
  groupType: ConnectionGroupType,
) {
  const byId = new Map(groups.map((group) => [group.id, group]));
  return ids.map((id) => {
    const group = byId.get(id);
    if (!group) throw new Error(`目标分组不存在: ${id}`);
    if (group.platform && normalize(group.platform) !== groupType) {
      throw new Error(`目标分组平台不匹配: ${group.name}`);
    }
    return group;
  });
}

type ResolveInput = Readonly<{
  sourceSiteId: number;
  sourceGroupId: string;
  targetGroupIds: readonly number[];
  groupType: ConnectionGroupType;
}>;
