import { DatabaseSync } from "node:sqlite";
import { initializeSqliteSchema } from "../../storage/sqlite-schema.ts";
import { ensureDatabaseDirectory, sqlitePath, transaction } from "../../storage/sqlite-utils.ts";
import type {
  EmbedIdentity,
  Ticket,
  TicketAttachmentData,
  TicketDetail,
  TicketMessage,
  TicketStatus,
} from "./types.ts";

export type TicketUpload = {
  readonly id: string;
  readonly originalName: string;
  readonly contentType: string;
  readonly data: Uint8Array;
};

export type NewTicket = {
  readonly id: string;
  readonly messageId: string;
  readonly identity: EmbedIdentity;
  readonly manualEmail: string;
  readonly title: string;
  readonly body: string;
  readonly category: string;
  readonly priority: string;
  readonly timestamp: string;
  readonly attachments: readonly TicketUpload[];
};

export type TicketStore = ReturnType<typeof createSqliteTicketStore>;

export function createSqliteTicketStore(databaseUrl: string) {
  const path = sqlitePath(databaseUrl);
  ensureDatabaseDirectory(path);
  const database = new DatabaseSync(path, { timeout: 5_000 });
  initializeSqliteSchema(database);
  return {
    list: (status?: TicketStatus) => listTickets(database, status),
    listForUser: (identity: EmbedIdentity) => listTicketsForUser(database, identity),
    get: (id: string) => readDetail(database, id),
    getForUser: (id: string, identity: EmbedIdentity) => readDetailForUser(database, id, identity),
    create: (input: NewTicket) => createTicket(database, input),
    addMessage: (input: AddMessage) => addMessage(database, input),
    updateStatus: (id: string, status: TicketStatus, timestamp: string) => updateStatus(database, id, status, timestamp),
    attachment: (id: string) => readAttachment(database, id),
    close: () => database.close(),
  };
}

function listTickets(database: DatabaseSync, status?: TicketStatus) {
  const sql = `SELECT * FROM embed_tickets ${status ? "WHERE status = ?" : ""} ORDER BY last_message_at DESC, id DESC`;
  const rows = (status ? database.prepare(sql).all(status) : database.prepare(sql).all()) as unknown as Row[];
  return rows.map(mapTicket);
}

function listTicketsForUser(database: DatabaseSync, identity: EmbedIdentity) {
  const rows = database.prepare(`SELECT * FROM embed_tickets
    WHERE src_host = ? AND sub2api_user_id = ? ORDER BY last_message_at DESC, id DESC`)
    .all(identity.srcHost, identity.sub2apiUserId) as unknown as Row[];
  return rows.map(mapTicket);
}

function readDetailForUser(database: DatabaseSync, id: string, identity: EmbedIdentity) {
  const ticket = database.prepare(`SELECT * FROM embed_tickets
    WHERE id = ? AND src_host = ? AND sub2api_user_id = ?`)
    .get(id, identity.srcHost, identity.sub2apiUserId) as Row | undefined;
  return ticket ? detailFromRow(database, ticket) : null;
}

function readDetail(database: DatabaseSync, id: string) {
  const row = database.prepare("SELECT * FROM embed_tickets WHERE id = ?").get(id) as Row | undefined;
  return row ? detailFromRow(database, row) : null;
}

function detailFromRow(database: DatabaseSync, row: Row): TicketDetail {
  const messages = database.prepare(`SELECT * FROM embed_ticket_messages
    WHERE ticket_id = ? ORDER BY created_at, id`).all(row.id) as MessageRow[];
  const attachments = attachmentMap(database, row.id);
  return { ...mapTicket(row), messages: messages.map((message) => mapMessage(message, attachments.get(message.id) ?? [])) };
}

function createTicket(database: DatabaseSync, input: NewTicket) {
  transaction(database, () => {
    insertTicket(database, input);
    insertMessage(database, {
      id: input.messageId, ticketId: input.id, authorType: "customer",
      authorName: input.identity.sub2apiEmail || input.manualEmail, body: input.body, timestamp: input.timestamp,
    });
    for (const attachment of input.attachments) insertAttachment(database, input, attachment);
  });
  return requiredDetail(database, input.id);
}

function insertTicket(database: DatabaseSync, input: NewTicket) {
  database.prepare(`INSERT INTO embed_tickets
    (id, src_host, src_url, sub2api_user_id, sub2api_email, sub2api_role, manual_email,
      title, status, category, priority, last_message_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?)`)
    .run(input.id, input.identity.srcHost, input.identity.srcUrl, input.identity.sub2apiUserId,
      input.identity.sub2apiEmail, input.identity.sub2apiRole, input.manualEmail, input.title,
      input.category, input.priority, input.timestamp, input.timestamp, input.timestamp);
}

function addMessage(database: DatabaseSync, input: AddMessage) {
  transaction(database, () => {
    insertMessage(database, input);
    const result = database.prepare(`UPDATE embed_tickets
      SET status = ?, last_message_at = ?, updated_at = ? WHERE id = ?`)
      .run(input.status, input.timestamp, input.timestamp, input.ticketId);
    if (result.changes !== 1) throw new Error("工单不存在");
  });
  return requiredDetail(database, input.ticketId);
}

function insertMessage(database: DatabaseSync, input: Omit<AddMessage, "status">) {
  database.prepare(`INSERT INTO embed_ticket_messages
    (id, ticket_id, author_type, author_name, body, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(input.id, input.ticketId, input.authorType, input.authorName, input.body, input.timestamp);
}

function insertAttachment(database: DatabaseSync, input: NewTicket, attachment: TicketUpload) {
  database.prepare(`INSERT INTO embed_ticket_attachments
    (id, ticket_id, message_id, original_name, content_type, size_bytes, data, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(attachment.id, input.id, input.messageId, attachment.originalName, attachment.contentType,
      attachment.data.byteLength, attachment.data, input.timestamp);
}

function updateStatus(database: DatabaseSync, id: string, status: TicketStatus, timestamp: string) {
  const result = database.prepare("UPDATE embed_tickets SET status = ?, updated_at = ? WHERE id = ?")
    .run(status, timestamp, id);
  if (result.changes !== 1) return null;
  return requiredDetail(database, id);
}

function readAttachment(database: DatabaseSync, id: string): TicketAttachmentData | null {
  const row = database.prepare("SELECT * FROM embed_ticket_attachments WHERE id = ?").get(id) as AttachmentRow | undefined;
  return row ? { ...mapAttachment(row), ticketId: row.ticket_id, data: new Uint8Array(row.data) } : null;
}

function attachmentMap(database: DatabaseSync, ticketId: string) {
  const rows = database.prepare(`SELECT * FROM embed_ticket_attachments
    WHERE ticket_id = ? ORDER BY created_at, id`).all(ticketId) as AttachmentRow[];
  const output = new Map<string, ReturnType<typeof mapAttachment>[]>();
  for (const row of rows) output.set(row.message_id, [...(output.get(row.message_id) ?? []), mapAttachment(row)]);
  return output;
}

function mapTicket(row: Row): Ticket {
  return {
    id: row.id, srcHost: row.src_host, srcUrl: row.src_url, sub2apiUserId: row.sub2api_user_id,
    sub2apiEmail: row.sub2api_email, sub2apiRole: row.sub2api_role, manualEmail: row.manual_email,
    title: row.title, status: row.status, category: row.category, priority: row.priority,
    lastMessageAt: row.last_message_at, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function mapMessage(row: MessageRow, attachments: TicketMessage["attachments"]): TicketMessage {
  return {
    id: row.id, ticketId: row.ticket_id, authorType: row.author_type, authorName: row.author_name,
    body: row.body, createdAt: row.created_at, attachments,
  };
}

function mapAttachment(row: AttachmentRow) {
  return { id: row.id, originalName: row.original_name, contentType: row.content_type, sizeBytes: row.size_bytes, createdAt: row.created_at };
}

function requiredDetail(database: DatabaseSync, id: string) {
  const detail = readDetail(database, id);
  if (!detail) throw new Error("工单不存在");
  return detail;
}

type AddMessage = {
  readonly id: string; readonly ticketId: string; readonly authorType: "customer" | "admin";
  readonly authorName: string; readonly body: string; readonly status: TicketStatus; readonly timestamp: string;
};
type Row = Record<string, string> & { readonly status: TicketStatus };
type MessageRow = { readonly id: string; readonly ticket_id: string; readonly author_type: "customer" | "admin"; readonly author_name: string; readonly body: string; readonly created_at: string };
type AttachmentRow = { readonly id: string; readonly ticket_id: string; readonly message_id: string; readonly original_name: string; readonly content_type: string; readonly size_bytes: number; readonly data: Uint8Array; readonly created_at: string };
