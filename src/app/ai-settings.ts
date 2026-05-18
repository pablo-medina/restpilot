import { defaultSettings, type AiSettings, type AiToolPolicy } from "../types";

export const DEFAULT_AI_BASE_URL = "http://127.0.0.1:1234/v1";
export const MAX_AI_INSTRUCTIONS_CHARS = 4000;

const TOOL_POLICIES: AiToolPolicy[] = ["confirm_all", "read_only_auto", "auto_all"];

export function normalizeAiInstructions(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length <= MAX_AI_INSTRUCTIONS_CHARS) return trimmed;
  return trimmed.slice(0, MAX_AI_INSTRUCTIONS_CHARS);
}

export function normalizeAiBaseUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return DEFAULT_AI_BASE_URL;
  return trimmed.replace(/\/+$/, "");
}

export function normalizeAiToolPolicy(value: unknown): AiToolPolicy {
  if (typeof value === "string" && TOOL_POLICIES.includes(value as AiToolPolicy)) {
    return value as AiToolPolicy;
  }
  return defaultSettings().ai.toolPolicy;
}

export function normalizeAiSettings(raw: unknown): AiSettings {
  const defaults = defaultSettings().ai;
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  return {
    enabled: source.enabled === true,
    baseUrl: normalizeAiBaseUrl(typeof source.baseUrl === "string" ? source.baseUrl : defaults.baseUrl),
    apiKey: typeof source.apiKey === "string" ? source.apiKey : defaults.apiKey,
    model: typeof source.model === "string" ? source.model.trim() : defaults.model,
    toolPolicy: normalizeAiToolPolicy(source.toolPolicy),
    instructions: normalizeAiInstructions(source.instructions)
  };
}

export function trimAiSettingsForSave(ai: AiSettings): AiSettings {
  return {
    ...ai,
    baseUrl: normalizeAiBaseUrl(ai.baseUrl),
    apiKey: ai.apiKey.trim(),
    model: ai.model.trim(),
    instructions: normalizeAiInstructions(ai.instructions)
  };
}
