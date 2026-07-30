import type { NextRequest } from "next/server";
import { readJsonBody } from "../http/request-body.ts";
import { EmbedError } from "./types.ts";
import type { RawTicketUpload } from "./ticket-validation.ts";

const MAX_MULTIPART_BYTES = 13 * 1024 * 1024;

export async function ticketCreateRequest(request: NextRequest) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) {
    return { values: await readJsonBody(request), files: [] as RawTicketUpload[] };
  }
  assertContentLength(request);
  const form = await request.formData();
  const values = {
    manualEmail: textField(form, "manualEmail"),
    title: textField(form, "title"),
    body: textField(form, "body"),
    category: textField(form, "category"),
    priority: textField(form, "priority"),
  };
  return { values, files: await imageFiles(form) };
}

async function imageFiles(form: FormData) {
  const output: RawTicketUpload[] = [];
  for (const value of form.getAll("images")) {
    if (!(value instanceof File)) throw new EmbedError("图片字段格式无效");
    output.push({ originalName: value.name, declaredType: value.type, data: new Uint8Array(await value.arrayBuffer()) });
  }
  return output;
}

function assertContentLength(request: NextRequest) {
  const value = Number(request.headers.get("content-length"));
  if (Number.isFinite(value) && value > MAX_MULTIPART_BYTES) throw new EmbedError("工单附件请求不能超过 13 MB", 413);
}

function textField(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}
