import { z } from "zod";
import { EmbedError } from "./types.ts";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export const ticketCreateSchema = z.object({
  manualEmail: z.string().trim().email("联系邮箱无效").max(200),
  title: z.string().trim().min(1, "工单标题不能为空").max(120),
  body: z.string().trim().min(1, "工单内容不能为空").max(10_000),
  category: z.string().trim().min(1, "请选择问题分类").max(30),
  priority: z.string().trim().min(1, "请选择优先级").max(30),
});

export const ticketReplySchema = z.object({
  body: z.string().trim().min(1, "回复内容不能为空").max(10_000),
});

export type RawTicketUpload = {
  readonly originalName: string;
  readonly declaredType: string;
  readonly data: Uint8Array;
};

export function validateUploads(files: readonly RawTicketUpload[], maximum: number) {
  if (files.length > maximum) throw new EmbedError(`每张工单最多上传 ${maximum} 张图片`);
  return files.map((file) => validateUpload(file));
}

function validateUpload(file: RawTicketUpload) {
  if (file.data.byteLength === 0) throw new EmbedError("上传的图片不能为空");
  if (file.data.byteLength > MAX_IMAGE_BYTES) throw new EmbedError("单张图片不能超过 2 MB");
  const contentType = detectImageType(file.data);
  if (!contentType || (file.declaredType && file.declaredType !== contentType)) {
    throw new EmbedError("仅支持真实的 PNG、JPEG、GIF 或 WebP 图片");
  }
  return { originalName: safeName(file.originalName), contentType, data: file.data };
}

function detectImageType(data: Uint8Array) {
  if (startsWith(data, [0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (startsWith(data, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(data, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (startsWith(data, [0x52, 0x49, 0x46, 0x46]) && ascii(data, 8, 4) === "WEBP") return "image/webp";
  return null;
}

function startsWith(data: Uint8Array, signature: readonly number[]) {
  return signature.every((value, index) => data[index] === value);
}

function ascii(data: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...data.slice(start, start + length));
}

function safeName(value: string) {
  const name = value.replace(/[\\/\u0000-\u001f]/g, "_").trim();
  return (name || "image").slice(0, 120);
}
