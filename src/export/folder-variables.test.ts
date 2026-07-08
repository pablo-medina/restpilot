import { describe, expect, it, beforeEach } from "vitest";
import { state } from "../app/state";
import type { SavedRequest } from "../types";
import {
  applyHtmlExportVariableSelection,
  collectVariableNamesFromRequest,
  defaultHtmlExportSelection,
  getUsedVariablesInFolder
} from "./folder-variables";

const request = (id: string, parentId: string): SavedRequest => ({
  id,
  kind: "request",
  parentId,
  title: "Example",
  method: "GET",
  url: "https://api.example.com/${base}",
  queryParams: [{ id: "p1", key: "q", value: "${term}", enabled: true }],
  headers: [],
  bodyMode: "none",
  rawType: "json",
  body: "",
  form: [],
  streamResponse: false,
  auth: { type: "bearer", bearerToken: "${token}" },
  lastResponse: null,
  lastError: null
});

describe("folder-variables", () => {
  beforeEach(() => {
    state.variables = [
      { id: "g1", name: "base", value: "https://api.example.com", enabled: true },
      { id: "g2", name: "unused", value: "x", enabled: true },
      { id: "g3", name: "token", value: "secret-value", enabled: true, secret: true }
    ];
    state.environments = [
      {
        id: "env1",
        name: "Dev",
        variables: [{ id: "e1", name: "term", value: "hello", enabled: true }]
      }
    ];
    state.activeEnvironmentId = "env1";
  });

  it("collects variable names from a request including auth", () => {
    const names = collectVariableNamesFromRequest(request("r1", "/"));
    expect(names).toEqual(new Set(["base", "term", "token"]));
  });

  it("returns only used effective variables from the active environment", () => {
    const used = getUsedVariablesInFolder([request("r1", "/")]);
    expect(used.map((variable) => variable.name).sort()).toEqual(["base", "term", "token"]);
    expect(used.find((variable) => variable.name === "term")?.value).toBe("hello");
    expect(used.some((variable) => variable.name === "unused")).toBe(false);
  });

  it("applies export selection without revealing secret values by default", () => {
    const used = getUsedVariablesInFolder([request("r1", "/")]);
    const exported = applyHtmlExportVariableSelection(used, defaultHtmlExportSelection(used));
    expect(exported).toEqual([
      { name: "base", value: "https://api.example.com" },
      { name: "term", value: "hello" }
    ]);
  });

  it("can include secret values when explicitly selected", () => {
    const used = getUsedVariablesInFolder([request("r1", "/")]);
    const exported = applyHtmlExportVariableSelection(used, [{ name: "token", include: true }]);
    expect(exported).toEqual([{ name: "token", value: "secret-value" }]);
  });
});
