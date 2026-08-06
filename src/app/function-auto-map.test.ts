import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultConfig, type AppFunction } from "../types";
import { autoMapFunctionResult, functionAutoMapEnabled } from "./function-auto-map";
import { state } from "./state";

vi.mock("./persistence", () => ({ scheduleSave: vi.fn() }));
vi.mock("../react/render-bridge", () => ({ bumpRenderGeneration: vi.fn() }));

function makeFunction(autoMap: Partial<AppFunction>): AppFunction {
  return {
    id: "func-1",
    name: "Login",
    code: "",
    functionType: "http",
    method: "POST",
    url: "https://example.com/login",
    queryParams: [],
    headers: [],
    bodyMode: "none",
    rawType: "json",
    body: "",
    form: [],
    auth: { type: "none" },
    extractorCode: "",
    ...autoMap
  } as AppFunction;
}

function resetState() {
  Object.assign(state, defaultConfig(), {
    variables: [{ id: "g1", name: "token", value: "old", enabled: false }],
    environments: [{ id: "env-1", name: "Staging", variables: [] }],
    activeEnvironmentId: null
  });
}

describe("autoMapFunctionResult", () => {
  beforeEach(resetState);

  it("does nothing while the function has it off or the name is blank", () => {
    const off = makeFunction({});
    expect(functionAutoMapEnabled(off)).toBe(false);
    expect(autoMapFunctionResult(off, "value")).toBeNull();

    const blank = makeFunction({ autoMapEnabled: true, autoMapVariable: "   " });
    expect(functionAutoMapEnabled(blank)).toBe(false);
    expect(autoMapFunctionResult(blank, "value")).toBeNull();
  });

  it("overwrites an existing global variable without asking", () => {
    const func = makeFunction({ autoMapEnabled: true, autoMapVariable: "token" });

    expect(autoMapFunctionResult(func, { id: 7 })).toEqual({
      name: "token",
      scope: "global",
      envName: undefined,
      created: false
    });
    expect(state.variables[0]).toMatchObject({ value: '{"id":7}', enabled: true });
  });

  it("creates the variable in the active environment when that scope is selected", () => {
    state.activeEnvironmentId = "env-1";
    const func = makeFunction({ autoMapEnabled: true, autoMapVariable: "token", autoMapScope: "environment" });

    expect(autoMapFunctionResult(func, "abc")).toMatchObject({
      scope: "environment",
      envName: "Staging",
      created: true
    });
    expect(state.environments[0].variables[0]).toMatchObject({ name: "token", value: "abc" });
    // The same-named global is left untouched.
    expect(state.variables[0].value).toBe("old");
  });

  it("falls back to globals when environment scope has no active environment", () => {
    const func = makeFunction({ autoMapEnabled: true, autoMapVariable: "fresh", autoMapScope: "environment" });

    expect(autoMapFunctionResult(func, "abc")).toMatchObject({ scope: "global", created: true });
    expect(state.variables.at(-1)).toMatchObject({ name: "fresh", value: "abc" });
  });

  it("keeps each function on its own variable", () => {
    const login = makeFunction({ autoMapEnabled: true, autoMapVariable: "token" });
    const tenant = makeFunction({ id: "func-2", autoMapEnabled: true, autoMapVariable: "tenant_id" });

    autoMapFunctionResult(login, "abc");
    autoMapFunctionResult(tenant, 42);

    expect(state.variables.map((variable) => [variable.name, variable.value])).toEqual([
      ["token", "abc"],
      ["tenant_id", "42"]
    ]);
  });
});
