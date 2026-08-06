import { describe, expect, it } from "vitest";
import { applyAutoMappedVariable, stringifyFunctionResult } from "./function-auto-map";
import type { Variable } from "../types";

function variable(name: string, value: string, enabled = true): Variable {
  return { id: `id-${name}`, name, value, enabled };
}

describe("stringifyFunctionResult", () => {
  it("keeps primitives as plain text", () => {
    expect(stringifyFunctionResult("abc")).toBe("abc");
    expect(stringifyFunctionResult(42)).toBe("42");
    expect(stringifyFunctionResult(false)).toBe("false");
  });

  it("serializes objects and treats nullish results as empty", () => {
    expect(stringifyFunctionResult({ token: "x" })).toBe('{"token":"x"}');
    expect(stringifyFunctionResult(null)).toBe("");
    expect(stringifyFunctionResult(undefined)).toBe("");
  });
});

describe("applyAutoMappedVariable", () => {
  const newId = () => "generated";

  it("creates the variable when the name is unknown", () => {
    const list: Variable[] = [variable("base_url", "https://example.com")];
    expect(applyAutoMappedVariable(list, "token", "abc", newId)).toEqual({ created: true });
    expect(list[1]).toEqual({ id: "generated", name: "token", value: "abc", enabled: true });
  });

  it("overwrites an existing variable and re-enables it", () => {
    const list: Variable[] = [variable("token", "old", false)];
    expect(applyAutoMappedVariable(list, "token", "new", newId)).toEqual({ created: false });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: "id-token", value: "new", enabled: true });
  });

  it("matches names ignoring surrounding whitespace", () => {
    const list: Variable[] = [variable(" token ", "old")];
    expect(applyAutoMappedVariable(list, "token", "new", newId)).toEqual({ created: false });
    expect(list[0]?.value).toBe("new");
  });
});
