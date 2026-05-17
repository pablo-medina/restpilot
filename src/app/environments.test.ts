import { describe, expect, it } from "vitest";
import type { Variable } from "../types";
import { effectiveVariables } from "../variables";

const globalVars: Variable[] = [
  { id: "g1", name: "base_url", value: "https://global.test", enabled: true },
  { id: "g2", name: "token", value: "global-token", enabled: true }
];

const envVars: Variable[] = [
  { id: "e1", name: "base_url", value: "https://env.test", enabled: true },
  { id: "e2", name: "api_key", value: "env-key", enabled: true }
];

describe("effectiveVariables", () => {
  it("merges global and environment variables with environment winning", () => {
    const merged = effectiveVariables(globalVars, envVars);
    expect(merged.find((item) => item.name === "base_url")?.value).toBe("https://env.test");
    expect(merged.find((item) => item.name === "token")?.value).toBe("global-token");
    expect(merged.find((item) => item.name === "api_key")?.value).toBe("env-key");
  });

  it("ignores blank names", () => {
    const merged = effectiveVariables(
      [{ id: "x", name: "  ", value: "skip", enabled: true }],
      [{ id: "y", name: "ok", value: "yes", enabled: true }]
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe("ok");
  });
});
