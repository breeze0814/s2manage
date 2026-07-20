import { z } from "zod";
import type { TargetAccountTestResult } from "./types.ts";

const MAX_MESSAGE_LENGTH = 160;
const testResultSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  latency_ms: z.number().finite().nonnegative().optional(),
  model: z.string().trim().min(1).optional(),
}).passthrough();

export function parseTargetAccountTestResponse(raw: string, latencyMs: number): TargetAccountTestResult {
  const text = raw.trim();
  if (!text) return failedResult("测试接口未返回内容", latencyMs);
  if (text.startsWith("{")) return parseJsonResult(text, latencyMs);
  return parseSseResult(text, latencyMs);
}

function parseJsonResult(raw: string, latencyMs: number) {
  const parsed = unwrapEnvelope(JSON.parse(raw));
  const result = testResultSchema.safeParse(parsed);
  if (!result.success) throw new Error(`目标站账号测试响应无效: ${result.error.issues[0]?.message ?? "格式错误"}`);
  return {
    success: result.data.success,
    message: result.data.message?.trim() || defaultMessage(result.data.success),
    latencyMs: result.data.latency_ms ?? latencyMs,
    ...(result.data.model ? { model: result.data.model } : {}),
  };
}

function unwrapEnvelope(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !("code" in value)) return value;
  const envelope = value as { code?: unknown; message?: unknown; data?: unknown };
  if (envelope.code !== 0) throw new Error(typeof envelope.message === "string" ? envelope.message : "目标站账号测试失败");
  return envelope.data;
}

function parseSseResult(raw: string, latencyMs: number): TargetAccountTestResult {
  const events = parseSseEvents(raw);
  const model = stringField(events.find((event) => event.type === "test_start"), "model");
  const responseText = events.filter(isContentEvent).map((event) => stringField(event, "text") ?? "").join("");
  const error = [...events].reverse().find(isErrorEvent);
  if (error) return withModel(failedResult(errorMessage(error, responseText), latencyMs), model);
  const completed = [...events].reverse().find((event) => event.type === "test_complete");
  if (completed?.success === true) return withModel(successResult(responseText, latencyMs), model);
  return withModel(failedResult(events.length ? "测试流未返回完成状态" : "测试接口未返回有效事件", latencyMs), model);
}

function parseSseEvents(raw: string) {
  const events: Record<string, unknown>[] = [];
  let dataLines: string[] = [];
  const flush = () => {
    const data = dataLines.join("\n").trim();
    dataLines = [];
    if (!data || data === "[DONE]") return;
    events.push(parseEventData(data));
  };
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) { flush(); continue; }
    const match = /^data:\s?(.*)$/.exec(line);
    if (match) dataLines.push(match[1] ?? "");
  }
  flush();
  return events;
}

function parseEventData(data: string): Record<string, unknown> {
  try {
    const value = JSON.parse(data) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : { type: "content", text: String(value) };
  } catch {
    return { type: "content", text: data };
  }
}

function isContentEvent(event: Record<string, unknown>) { return event.type === "content" || event.type === "status"; }
function isErrorEvent(event: Record<string, unknown>) { return event.type === "error" || (event.success === false && typeof event.error === "string"); }
function stringField(value: Record<string, unknown> | undefined, field: string) { const result = value?.[field]; return typeof result === "string" ? result : undefined; }
function errorMessage(event: Record<string, unknown>, response: string) { return stringField(event, "error") || compactMessage(response) || "账号测试失败"; }
function successResult(response: string, latencyMs: number) { const detail = compactMessage(response); return { success: true, message: detail ? `通道测试通过：${detail}` : "通道测试通过", latencyMs }; }
function failedResult(message: string, latencyMs: number) { return { success: false, message, latencyMs }; }
function withModel(result: TargetAccountTestResult, model?: string) { return model ? { ...result, model } : result; }
function defaultMessage(success: boolean) { return success ? "通道测试通过" : "通道测试失败"; }
function compactMessage(value: string) { const text = value.replace(/\s+/g, " ").trim(); return text.length > MAX_MESSAGE_LENGTH ? `${text.slice(0, MAX_MESSAGE_LENGTH)}...` : text; }
