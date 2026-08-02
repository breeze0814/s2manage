import type { ConnectionContext } from "./context.ts";
import { ConnectionConflictError } from "./errors.ts";
import { beginStage, completeStage } from "./lifecycle.ts";
import { normalize } from "./model.ts";
import type {
  ConnectionGroupType, ExistingSourceCredential, ExistingTargetAccount, RealConnection,
} from "./types.ts";
import type { ParsedCreate } from "./validation.ts";

export async function resolveExistingResources(
  context: ConnectionContext,
  parsed: ParsedCreate,
) {
  const [sources, targets] = await Promise.all([
    context.remote.listSourceCredentials(parsed.sourceSiteId),
    context.remote.listTargetAccounts(parsed.targetGroupIds),
  ]);
  const source = sources.find((item) => item.id === parsed.sourceCredentialId);
  const target = targets.find((item) => item.id === parsed.targetAccountId);
  validateExistingResources({ source, target, parsed });
  return { source: source!, target: target! };
}

export async function validateStoredResources(
  context: ConnectionContext,
  connection: RealConnection,
) {
  beginStage(context, stageEvent(connection.id, "source", "校验现有采集站凭据"));
  const sources = await context.remote.listSourceCredentials(connection.sourceSiteId);
  const source = sources.find((item) => item.id === connection.sourceCredentialId);
  if (!source || source.groupId !== connection.sourceGroupId) {
    throw new Error("绑定的采集站凭据不存在或分组不匹配");
  }
  completeStage(context, stageEvent(connection.id, "source", "现有采集站凭据校验完成"));
  beginStage(context, stageEvent(connection.id, "target", "校验现有目标账号"));
  const targets = await context.remote.listTargetAccounts(connection.targetGroupIds);
  const target = targets.find((item) => item.id === connection.targetAccountId);
  validateTarget({ target, groupType: connection.groupType, targetGroupIds: connection.targetGroupIds });
  completeStage(context, stageEvent(connection.id, "target", "现有目标账号校验完成"));
}

export function validateExistingRetry(connection: RealConnection, parsed: ParsedCreate) {
  if (connection.sourceCredentialId !== parsed.sourceCredentialId
    || connection.targetAccountId !== parsed.targetAccountId) {
    throw new ConnectionConflictError(`幂等操作的现有资源选择已变化: ${connection.id}`);
  }
}

function validateExistingResources(input: Readonly<{
  source: ExistingSourceCredential | undefined;
  target: ExistingTargetAccount | undefined;
  parsed: ParsedCreate;
}>) {
  if (!input.source) throw new Error(`采集站凭据不存在: ${input.parsed.sourceCredentialId}`);
  if (input.source.groupId !== input.parsed.sourceGroupId) throw new Error("采集站凭据不属于所选采集分组");
  validateTarget({
    target: input.target,
    groupType: input.parsed.groupType,
    targetGroupIds: input.parsed.targetGroupIds,
  });
}

function validateTarget(input: Readonly<{
  target: ExistingTargetAccount | undefined;
  groupType: ConnectionGroupType;
  targetGroupIds: readonly number[];
}>) {
  if (!input.target) throw new Error("目标账号不存在");
  if (normalize(input.target.platform) !== input.groupType) throw new Error("目标账号平台与连接类型不匹配");
  const memberships = new Set(input.target.groupIds);
  if (input.targetGroupIds.some((id) => !memberships.has(id))) {
    throw new Error("目标账号未加入全部所选目标分组");
  }
}

function stageEvent(
  connectionId: string,
  stage: RealConnection["lifecycleStage"],
  message: string,
) {
  return { connectionId, action: "provision" as const, stage, message };
}
