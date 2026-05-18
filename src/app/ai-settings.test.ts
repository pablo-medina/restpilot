import { describe, expect, it } from "vitest";
import {
  MAX_AI_INSTRUCTIONS_CHARS,
  normalizeAiInstructions,
  normalizeAiSettings,
  normalizeAiBaseUrl,
  normalizeAiToolPolicy
} from "./ai-settings";
import { normalizeConfig } from "./config-normalize";
import { defaultConfig } from "../types";

describe("normalizeAiSettings", () => {
  it("applies defaults for missing ai block", () => {
    const ai = normalizeAiSettings(undefined);
    expect(ai.enabled).toBe(false);
    expect(ai.toolPolicy).toBe("confirm_all");
    expect(ai.baseUrl).toBe("http://127.0.0.1:1234/v1");
  });

  it("trims trailing slash from base url", () => {
    expect(normalizeAiBaseUrl("http://example.com/v1/")).toBe("http://example.com/v1");
  });

  it("clamps unknown tool policy", () => {
    expect(normalizeAiToolPolicy("invalid")).toBe("confirm_all");
    expect(normalizeAiToolPolicy("auto_all")).toBe("auto_all");
  });

  it("normalizes custom instructions", () => {
    expect(normalizeAiInstructions("  hello  ")).toBe("hello");
    expect(normalizeAiInstructions("")).toBe("");
    expect(normalizeAiInstructions("x".repeat(MAX_AI_INSTRUCTIONS_CHARS + 50)).length).toBe(
      MAX_AI_INSTRUCTIONS_CHARS
    );
  });
});

describe("normalizeConfig ai", () => {
  it("merges ai settings from stored config", () => {
    const config = normalizeConfig({
      ...defaultConfig(),
      settings: {
        ...defaultConfig().settings,
        ai: {
          enabled: true,
          model: "test-model",
          toolPolicy: "read_only_auto"
        }
      }
    } as any);
    expect(config.settings.ai.enabled).toBe(true);
    expect(config.settings.ai.model).toBe("test-model");
    expect(config.settings.ai.toolPolicy).toBe("read_only_auto");
  });
});
