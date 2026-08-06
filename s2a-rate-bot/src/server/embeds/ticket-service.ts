import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { EmbedConfigService } from "./config-service.ts";
import { ticketSettings } from "./config-service.ts";
import type { NewTicket, TicketStore } from "./ticket-store.ts";
import { ticketCreateSchema, ticketReplySchema, validateUploads, type RawTicketUpload } from "./ticket-validation.ts";
import { EmbedError, type EmbedIdentity, type TicketStatus } from "./types.ts";

const statusSchema = z.enum(["open", "pending", "replied", "closed"]);

export type TicketService = ReturnType<typeof createTicketService>;

export function createTicketService(input: {
  readonly store: TicketStore;
  readonly configs: EmbedConfigService;
  readonly now?: () => Date;
  readonly id?: () => string;
}) {
  const dependencies = { ...input, now: input.now ?? (() => new Date()), id: input.id ?? randomUUID };
  return {
    listAdmin: async (status?: string) => input.store.list(status ? statusSchema.parse(status) : undefined),
    getAdmin: async (id: string) => required(await input.store.get(id)),
    replyAdmin: (id: string, raw: unknown) => replyAdmin(dependencies, id, raw),
    updateStatus: (id: string, raw: unknown) => updateStatus(dependencies, id, raw),
    listUser: async (identity: EmbedIdentity) => input.store.listForUser(identity),
    getUser: async (id: string, identity: EmbedIdentity) => required(await input.store.getForUser(id, identity)),
    createUser: (identity: EmbedIdentity, raw: unknown, files: readonly RawTicketUpload[]) => createUser(dependencies, identity, raw, files),
    replyUser: (id: string, identity: EmbedIdentity, raw: unknown) => replyUser(dependencies, id, identity, raw),
    attachmentUser: (id: string, identity: EmbedIdentity) => attachmentUser(input.store, id, identity),
    attachmentAdmin: async (id: string) => required(await input.store.attachment(id)),
  };
}

async function createUser(input: TicketDependencies, identity: EmbedIdentity, raw: unknown, files: readonly RawTicketUpload[]) {
  const values = ticketCreateSchema.parse(raw);
  const settings = ticketSettings(await input.configs.get("tickets"));
  if (!settings.categoryOptions.includes(values.category)) throw new EmbedError("问题分类不在可选范围内");
  if (!settings.priorityOptions.includes(values.priority)) throw new EmbedError("优先级不在可选范围内");
  const attachments = validateUploads(files, settings.maxImagesPerTicket);
  const ticketId = input.id();
  const record = {
    ...values, id: ticketId, messageId: input.id(), identity, timestamp: input.now().toISOString(),
    attachments: attachments.map((file) => ({ ...file, id: input.id() })),
  } satisfies NewTicket;
  return input.store.create(record);
}

async function replyUser(input: TicketDependencies, id: string, identity: EmbedIdentity, raw: unknown) {
  const ticket = required(await input.store.getForUser(id, identity));
  if (ticket.status === "closed") throw new EmbedError("已关闭的工单不能继续回复", 409);
  const { body } = ticketReplySchema.parse(raw);
  return input.store.addMessage({
    id: input.id(), ticketId: id, authorType: "customer",
    authorName: identity.sub2apiEmail || ticket.manualEmail, body,
    status: "pending", timestamp: input.now().toISOString(),
  });
}

async function replyAdmin(input: TicketDependencies, id: string, raw: unknown) {
  const ticket = required(await input.store.get(id));
  if (ticket.status === "closed") throw new EmbedError("已关闭的工单不能继续回复", 409);
  const { body } = ticketReplySchema.parse(raw);
  return input.store.addMessage({
    id: input.id(), ticketId: id, authorType: "admin", authorName: "管理员",
    body, status: "replied", timestamp: input.now().toISOString(),
  });
}

async function updateStatus(input: TicketDependencies, id: string, raw: unknown) {
  const status = z.object({ status: statusSchema }).parse(raw).status;
  return required(await input.store.updateStatus(id, status, input.now().toISOString()));
}

async function attachmentUser(store: TicketStore, id: string, identity: EmbedIdentity) {
  const attachment = required(await store.attachment(id));
  if (!await store.getForUser(attachment.ticketId, identity)) throw new EmbedError("附件不存在", 404);
  return attachment;
}

function required<T>(value: T | null): T {
  if (!value) throw new EmbedError("工单或附件不存在", 404);
  return value;
}

type TicketDependencies = Parameters<typeof createTicketService>[0] & { readonly now: () => Date; readonly id: () => string };
