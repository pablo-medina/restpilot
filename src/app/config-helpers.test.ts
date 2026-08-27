import { describe, expect, it } from "vitest";
import { defaultConfig, type AppConfig, type Helper } from "../types";
import { normalizeConfig } from "./config-normalize";

function stored(helpers: unknown): AppConfig {
  return { ...defaultConfig(), helpers } as AppConfig;
}

function helper(overrides: Partial<Helper> = {}): Helper {
  return {
    id: "h1",
    name: "cuil",
    params: ["dni"],
    code: "function cuil(dni) { return dni; }",
    ...overrides
  };
}

describe("normalizeConfig — script library", () => {
  it("carries a stored function through unchanged", () => {
    const [restored] = normalizeConfig(stored([helper()])).helpers;
    expect(restored).toEqual(helper());
  });

  it("keeps the remembered arguments and the description", () => {
    const [restored] = normalizeConfig(
      stored([helper({ description: "Calcula el CUIL", sampleArgs: ["12345678"] })])
    ).helpers;
    expect(restored.description).toBe("Calcula el CUIL");
    expect(restored.sampleArgs).toEqual(["12345678"]);
  });

  it("keeps an entry whose cached name is missing, because the code is the truth", () => {
    const [restored] = normalizeConfig(stored([helper({ name: "" })])).helpers;
    expect(restored.code).toContain("function cuil(dni)");
  });

  it("drops an entry with no code at all", () => {
    expect(normalizeConfig(stored([helper({ code: "   " })])).helpers).toEqual([]);
  });

  it("survives a config that predates the library", () => {
    const { helpers, ...withoutHelpers } = defaultConfig();
    void helpers;
    expect(normalizeConfig(withoutHelpers as AppConfig).helpers).toEqual([]);
  });

  it("does not read the removed Functions section, which becomes extractors instead", () => {
    // The legacy branch only runs for a config written before `extractors` existed.
    const { extractors, helpers, ...base } = defaultConfig();
    void extractors;
    void helpers;
    const legacy = {
      ...base,
      functions: [{ id: "f1", name: "old", extractorCode: "return response.body;" }]
    } as unknown as AppConfig;
    const config = normalizeConfig(legacy);
    expect(config.helpers).toEqual([]);
    expect(config.extractors).toHaveLength(1);
  });
});
