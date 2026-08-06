import { z } from "zod";
import type { EmbedConfigStore } from "./config-store.ts";
import type { BasicEmbedSettings, EmbedConfig, EmbedKind, TicketEmbedSettings } from "./types.ts";

const DEFAULT_CATEGORIES = ["通用问题", "余额/计费", "接口调用", "生图问题", "账号/登录"] as const;
const DEFAULT_PRIORITIES = ["低", "普通", "高", "紧急"] as const;
const OPTION_LIMIT = 20;

const ticketSettingsSchema = z.object({
  sourceOrigin: z.string().url(),
  template: z.enum(["default", "minimal", "support"]),
  maxImagesPerTicket: z.number().int().min(0).max(6),
  categoryOptions: optionSchema(),
  priorityOptions: optionSchema(),
});
const basicSettingsSchema = z.object({ sourceOrigin: z.string().url() });
const ticketPatchSchema = ticketSettingsSchema.omit({ sourceOrigin: true }).partial();

export type EmbedConfigService = ReturnType<typeof createEmbedConfigService>;

export function createEmbedConfigService(input: {
  readonly store: EmbedConfigStore;
  readonly sourceOrigin: () => Promise<string>;
}) {
  return {
    get: (kind: EmbedKind) => ensureCurrentConfig(input, kind),
    getByToken: async (token: string) => input.store.getByToken(token.trim()),
    updateTickets: async (raw: unknown) => updateTicketConfig(input, raw),
    rotate: async (kind: EmbedKind) => {
      await ensureCurrentConfig(input, kind);
      return input.store.rotate(kind);
    },
  };
}

export function ticketSettings(config: EmbedConfig): TicketEmbedSettings {
  if (config.kind !== "tickets") throw new Error("嵌入配置不是工单配置");
  return ticketSettingsSchema.parse(config.config);
}

export function basicSettings(config: EmbedConfig): BasicEmbedSettings {
  return basicSettingsSchema.parse(config.config);
}

async function ensureCurrentConfig(input: ConfigDependencies, kind: EmbedKind) {
  const sourceOrigin = await input.sourceOrigin();
  const current = await input.store.ensure(kind, defaultConfig(kind, sourceOrigin));
  if (current.config.sourceOrigin === sourceOrigin) return current;
  return input.store.update(kind, { ...current.config, sourceOrigin });
}

async function updateTicketConfig(input: ConfigDependencies, raw: unknown) {
  const current = await ensureCurrentConfig(input, "tickets");
  const settings = ticketSettings(current);
  const patch = ticketPatchSchema.parse(raw);
  return input.store.update("tickets", ticketSettingsSchema.parse({ ...settings, ...patch }));
}

function defaultConfig(kind: EmbedKind, sourceOrigin: string) {
  if (kind !== "tickets") return { sourceOrigin };
  return {
    sourceOrigin,
    template: "default",
    maxImagesPerTicket: 3,
    categoryOptions: [...DEFAULT_CATEGORIES],
    priorityOptions: [...DEFAULT_PRIORITIES],
  };
}

function optionSchema() {
  return z.array(z.string().trim().min(1).max(30)).min(1).max(OPTION_LIMIT)
    .transform((items) => [...new Set(items)]);
}

type ConfigDependencies = Parameters<typeof createEmbedConfigService>[0];
