import { describe, expect, it } from "vitest";
import { defaultConfig, LEGACY_CONFIG_VERSION, type AppConfig, type SavedRequest } from "../types";
import { normalizeConfig } from "./config-normalize";
import {
  migrateExtractors,
  needsExtractorMigration,
  type LegacyExtractorSource
} from "./migrate-extractors";

function request(id: string, extractor?: unknown): SavedRequest {
  return {
    id,
    kind: "request",
    parentId: "/",
    title: "Get user",
    method: "GET",
    url: "https://example.test",
    queryParams: [],
    headers: [],
    bodyMode: "none",
    rawType: "json",
    body: "",
    form: [],
    streamResponse: false,
    auth: { type: "none" },
    lastResponse: null,
    lastError: null,
    ...(extractor ? { extractor } : {})
  } as SavedRequest;
}

function legacy(extra: Record<string, unknown>): AppConfig {
  return { ...defaultConfig(), configVersion: LEGACY_CONFIG_VERSION, ...extra } as AppConfig;
}

/**
 * Mirrors the real call: a normalized target that no longer carries the legacy keys, plus the
 * raw stored object to read them from.
 */
function migrate(extra: Record<string, unknown>): AppConfig {
  const source = legacy(extra);
  const { extractors, functions, ...target } = source as AppConfig & {
    extractors?: unknown;
    functions?: unknown;
  };
  void extractors;
  void functions;
  return migrateExtractors(target as AppConfig, source as LegacyExtractorSource);
}

describe("needsExtractorMigration", () => {
  it("runs for anything written before the change", () => {
    expect(needsExtractorMigration(undefined)).toBe(true);
    expect(needsExtractorMigration(2)).toBe(true);
    expect(needsExtractorMigration(3)).toBe(false);
  });
});

describe("migrateExtractors", () => {
  it("wraps an extractor body into a function that takes the response", () => {
    const config = migrate({
      extractors: [{ id: "x1", name: "Token", code: "  return response.body.token;" }]
    });
    const [helper] = config.helpers;
    expect(helper.name).toBe("token");
    expect(helper.params).toEqual(["response"]);
    expect(helper.code).toContain("function token(response) {");
    expect(helper.code).toContain("return response.body.token;");
    expect(helper.code).toContain("@param {object} response");
  });

  it("carries the description across", () => {
    const config = migrate({
      extractors: [{ id: "x1", name: "Token", code: "return 1;", description: "Saca el token" }]
    });
    expect(config.helpers[0].description).toBe("Saca el token");
  });

  it("points the requests that used it at the new function", () => {
    const config = migrate({
      extractors: [{ id: "x1", name: "Token", code: "return response.body.token;" }],
      items: [request("r1", { extractorId: "x1", variable: "APP_TOKEN" })]
    });
    expect((config.items[0] as SavedRequest).functionCall).toEqual({
      helperId: config.helpers[0].id,
      variable: "APP_TOKEN"
    });
  });

  it("keeps a request whose extractor had no target variable", () => {
    const config = migrate({
      extractors: [{ id: "x1", name: "Token", code: "return 1;" }],
      items: [request("r1", { extractorId: "x1" })]
    });
    expect((config.items[0] as SavedRequest).functionCall).toEqual({
      helperId: config.helpers[0].id,
      variable: undefined
    });
  });

  it("leaves a request pointing at an extractor that is not there with no function", () => {
    const config = migrate({
      extractors: [{ id: "x1", name: "Token", code: "return 1;" }],
      items: [request("r1", { extractorId: "gone" })]
    });
    expect((config.items[0] as SavedRequest).functionCall).toBeUndefined();
  });

  it("gives every extractor a usable, unique name", () => {
    const config = migrate({
      extractors: [
        { id: "a", name: "Get token", code: "return 1;" },
        // Folds to the same identifier as the one above, so the counter settles it.
        { id: "b", name: "get TOKEN", code: "return 2;" },
        // Nothing usable in the name at all.
        { id: "c", name: "¿?", code: "return 3;" }
      ]
    });
    expect(config.helpers.map((helper) => helper.name)).toEqual([
      "getToken",
      "getToken2",
      "newFunction"
    ]);
  });

  it("does not collide with a function that is already in the library", () => {
    const config = migrate({
      helpers: [{ id: "h1", name: "token", params: [], code: "function token() { return 1; }" }],
      extractors: [{ id: "x1", name: "Token", code: "return 2;" }]
    });
    expect(config.helpers.map((helper) => helper.name)).toEqual(["token", "token2"]);
  });

  it("skips an extractor with no code to carry over", () => {
    const config = migrate({ extractors: [{ id: "x1", name: "Empty", code: "   " }] });
    expect(config.helpers).toEqual([]);
  });

  it("picks up the pre-extractor `functions` key, so old configs make one hop", () => {
    const config = migrate({
      functions: [{ id: "f1", name: "Old one", extractorCode: "return response.body;" }]
    });
    expect(config.helpers).toHaveLength(1);
    expect(config.helpers[0].name).toBe("oldOne");
  });

  it("changes nothing when there is nothing left to migrate", () => {
    const config = legacy({ extractors: [], items: [request("r1")] });
    expect(migrateExtractors(config, config as LegacyExtractorSource)).toBe(config);
  });

  it("is idempotent: its own output has nothing left to read", () => {
    const once = migrate({
      extractors: [{ id: "x1", name: "Token", code: "return 1;" }],
      items: [request("r1", { extractorId: "x1", variable: "T" })]
    });
    // The output carries no legacy keys, so a second pass finds nothing and hands it straight
    // back — which is what the collection-import path relies on.
    expect(migrateExtractors(once, once as LegacyExtractorSource)).toBe(once);
  });
});

describe("normalizeConfig — the upgrade runs on load", () => {
  it("upgrades a stored config and rewires the request", () => {
    const config = normalizeConfig(
      legacy({
        extractors: [{ id: "x1", name: "Token", code: "return response.body.token;" }],
        items: [request("r1", { extractorId: "x1", variable: "APP_TOKEN" })]
      })
    );
    expect(config.helpers).toHaveLength(1);
    expect((config.items[0] as SavedRequest).functionCall?.variable).toBe("APP_TOKEN");
  });

  it("drops the stale `extractor` key from the request it rewired", () => {
    const config = normalizeConfig(
      legacy({
        extractors: [{ id: "x1", name: "Token", code: "return 1;" }],
        items: [request("r1", { extractorId: "x1" })]
      })
    );
    expect("extractor" in config.items[0]).toBe(false);
  });

  it("leaves an already-current config alone", () => {
    const config = normalizeConfig({ ...defaultConfig(), items: [request("r1")] });
    expect(config.helpers).toEqual([]);
    expect((config.items[0] as SavedRequest).functionCall).toBeUndefined();
  });
});
