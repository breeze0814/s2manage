import type { PoolClient } from "pg";
import { execute, postgresTransaction, row, rows, type PostgresContext } from "../infrastructure/postgres-context.ts";
import type { EmbedIdentity, Ticket, TicketAttachmentData, TicketDetail, TicketMessage, TicketStatus } from "./types.ts";
import type { AddMessage, NewTicket, TicketStore, TicketUpload } from "./ticket-store.ts";

type TicketRow = Record<string, string> & { readonly status: TicketStatus };
type MessageRow = { readonly id: string; readonly ticket_id: string; readonly author_type: "customer" | "admin";
  readonly author_name: string; readonly body: string; readonly created_at: string };
type AttachmentRow = { readonly id: string; readonly ticket_id: string; readonly message_id: string;
  readonly original_name: string; readonly content_type: string; readonly size_bytes: number;
  readonly data: Buffer; readonly created_at: string };

export function createPostgresTicketStore(context: PostgresContext): TicketStore {
  return {
    list: (status) => listTickets(context, status),
    listForUser: (identity) => listForUser(context, identity),
    get: (id) => readDetail(context, id),
    getForUser: (id, identity) => readDetailForUser(context, id, identity),
    create: (input) => createTicket(context, input),
    addMessage: (input) => addMessage(context, input),
    updateStatus: (id, status, timestamp) => updateStatus(context, id, status, timestamp),
    attachment: (id) => readAttachment(context, id),
    close: async () => undefined,
  };
}

async function listTickets(context: PostgresContext, status?: TicketStatus) {
  const sql = `SELECT * FROM embed_tickets ${status ? "WHERE status=$1" : ""}
    ORDER BY last_message_at DESC,id DESC`;
  return (await rows<TicketRow>(context, sql, status ? [status] : [])).map(mapTicket);
}

async function listForUser(context: PostgresContext, identity: EmbedIdentity) {
  const values = await rows<TicketRow>(context, `SELECT * FROM embed_tickets
    WHERE src_host=$1 AND sub2api_user_id=$2 ORDER BY last_message_at DESC,id DESC`,
  [identity.srcHost, identity.sub2apiUserId]);
  return values.map(mapTicket);
}

async function readDetailForUser(context: PostgresContext, id: string, identity: EmbedIdentity) {
  const ticket = await row<TicketRow>(context, `SELECT * FROM embed_tickets
    WHERE id=$1 AND src_host=$2 AND sub2api_user_id=$3`, [id, identity.srcHost, identity.sub2apiUserId]);
  return ticket ? detailFromRow(context, ticket) : null;
}

async function readDetail(context: PostgresContext, id: string) {
  const ticket = await row<TicketRow>(context, "SELECT * FROM embed_tickets WHERE id=$1", [id]);
  return ticket ? detailFromRow(context, ticket) : null;
}

async function detailFromRow(context: PostgresContext, ticket: TicketRow): Promise<TicketDetail> {
  const [messages, attachments] = await Promise.all([
    rows<MessageRow>(context, `SELECT * FROM embed_ticket_messages
      WHERE ticket_id=$1 ORDER BY created_at,id`, [ticket.id]),
    rows<AttachmentRow>(context, `SELECT * FROM embed_ticket_attachments
      WHERE ticket_id=$1 ORDER BY created_at,id`, [ticket.id]),
  ]);
  const grouped = groupAttachments(attachments);
  return { ...mapTicket(ticket), messages: messages.map((message) => mapMessage(message, grouped.get(message.id) ?? [])) };
}

async function createTicket(context: PostgresContext, input: NewTicket) {
  await postgresTransaction(context, async (client) => {
    await insertTicket(client, input);
    await insertMessage(client, { id: input.messageId, ticketId: input.id, authorType: "customer",
      authorName: input.identity.sub2apiEmail || input.manualEmail, body: input.body,
      status: "open", timestamp: input.timestamp });
    await Promise.all(input.attachments.map((attachment) => insertAttachment(client, input, attachment)));
  });
  return requiredDetail(context, input.id);
}

async function insertTicket(client: PoolClient, input: NewTicket) {
  await client.query(`INSERT INTO embed_tickets
    (id,src_host,src_url,sub2api_user_id,sub2api_email,sub2api_role,manual_email,title,status,
      category,priority,last_message_at,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'open',$9,$10,$11,$11,$11)`, [input.id, input.identity.srcHost,
    input.identity.srcUrl, input.identity.sub2apiUserId, input.identity.sub2apiEmail,
    input.identity.sub2apiRole, input.manualEmail, input.title, input.category, input.priority, input.timestamp]);
}

async function addMessage(context: PostgresContext, input: AddMessage) {
  await postgresTransaction(context, async (client) => {
    await insertMessage(client, input);
    const result = await client.query(`UPDATE embed_tickets SET status=$2,last_message_at=$3,updated_at=$3
      WHERE id=$1`, [input.ticketId, input.status, input.timestamp]);
    if (result.rowCount !== 1) throw new Error("工单不存在");
  });
  return requiredDetail(context, input.ticketId);
}

async function insertMessage(client: PoolClient, input: AddMessage) {
  await client.query(`INSERT INTO embed_ticket_messages
    (id,ticket_id,author_type,author_name,body,created_at) VALUES ($1,$2,$3,$4,$5,$6)`,
  [input.id, input.ticketId, input.authorType, input.authorName, input.body, input.timestamp]);
}

async function insertAttachment(client: PoolClient, input: NewTicket, attachment: TicketUpload) {
  await client.query(`INSERT INTO embed_ticket_attachments
    (id,ticket_id,message_id,original_name,content_type,size_bytes,data,created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [attachment.id, input.id, input.messageId,
    attachment.originalName, attachment.contentType, attachment.data.byteLength, Buffer.from(attachment.data), input.timestamp]);
}

async function updateStatus(context: PostgresContext, id: string, status: TicketStatus, timestamp: string) {
  const result = await execute(context, "UPDATE embed_tickets SET status=$2,updated_at=$3 WHERE id=$1", [id, status, timestamp]);
  return result.rowCount === 1 ? requiredDetail(context, id) : null;
}

async function readAttachment(context: PostgresContext, id: string): Promise<TicketAttachmentData | null> {
  const value = await row<AttachmentRow>(context, "SELECT * FROM embed_ticket_attachments WHERE id=$1", [id]);
  return value ? { ...mapAttachment(value), ticketId: value.ticket_id, data: new Uint8Array(value.data) } : null;
}

async function requiredDetail(context: PostgresContext, id: string) {
  const detail = await readDetail(context, id);
  if (!detail) throw new Error("工单不存在");
  return detail;
}

function groupAttachments(values: readonly AttachmentRow[]) {
  const output = new Map<string, ReturnType<typeof mapAttachment>[]>();
  for (const value of values) output.set(value.message_id, [...(output.get(value.message_id) ?? []), mapAttachment(value)]);
  return output;
}

function mapTicket(value: TicketRow): Ticket {
  return { id: value.id, srcHost: value.src_host, srcUrl: value.src_url, sub2apiUserId: value.sub2api_user_id,
    sub2apiEmail: value.sub2api_email, sub2apiRole: value.sub2api_role, manualEmail: value.manual_email,
    title: value.title, status: value.status, category: value.category, priority: value.priority,
    lastMessageAt: value.last_message_at, createdAt: value.created_at, updatedAt: value.updated_at };
}

function mapMessage(value: MessageRow, attachments: TicketMessage["attachments"]): TicketMessage {
  return { id: value.id, ticketId: value.ticket_id, authorType: value.author_type, authorName: value.author_name,
    body: value.body, createdAt: value.created_at, attachments };
}

function mapAttachment(value: AttachmentRow) {
  return { id: value.id, originalName: value.original_name, contentType: value.content_type,
    sizeBytes: Number(value.size_bytes), createdAt: value.created_at };
}
