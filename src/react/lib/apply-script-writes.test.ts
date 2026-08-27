import { beforeEach, describe, expect, it, vi } from "vitest";
import { state } from "../../app/state";
import type { Variable } from "../../types";

const answer = vi.fn<() => Promise<string>>();

vi.mock("../../components/dialogs", () => ({
  applicationDialog: () => answer()
}));
vi.mock("../../app/persistence", () => ({ scheduleSave: () => {} }));

const { applyScriptWrites } = await import("./run-script");

function variable(name: string): Variable {
  return { id: name, name, value: "x", enabled: true };
}

function names(): string[] {
  return state.variables.map((item) => item.name);
}

describe("applyScriptWrites", () => {
  beforeEach(() => {
    answer.mockReset();
    state.variables = [variable("a"), variable("b"), variable("c"), variable("d")];
    state.environments = [];
    state.activeEnvironmentId = null;
  });

  it("writes what the script set", async () => {
    const result = await applyScriptWrites([{ name: "token", value: "abc" }]);
    expect(result).toEqual({ applied: ["token"], cancelled: false });
    expect(state.variables.find((item) => item.name === "token")?.value).toBe("abc");
  });

  it("clears a variable the script set to nothing, without asking", async () => {
    const result = await applyScriptWrites([{ name: "a", value: null }]);
    expect(result.cancelled).toBe(false);
    expect(names()).toEqual(["b", "c", "d"]);
    expect(answer).not.toHaveBeenCalled();
  });

  it("does not ask for a couple of deliberate deletions", async () => {
    await applyScriptWrites([
      { name: "a", value: null },
      { name: "b", value: null }
    ]);
    expect(answer).not.toHaveBeenCalled();
    expect(names()).toEqual(["c", "d"]);
  });

  it("asks before a run clears several at once, and applies on yes", async () => {
    answer.mockResolvedValue("yes");
    const result = await applyScriptWrites([
      { name: "a", value: null },
      { name: "b", value: null },
      { name: "c", value: null }
    ]);
    expect(answer).toHaveBeenCalledOnce();
    expect(result).toEqual({ applied: ["a", "b", "c"], cancelled: false });
    expect(names()).toEqual(["d"]);
  });

  it("leaves the environment exactly as it was on no — including the other writes", async () => {
    answer.mockResolvedValue("no");
    const result = await applyScriptWrites([
      { name: "token", value: "abc" },
      { name: "a", value: null },
      { name: "b", value: null },
      { name: "c", value: null }
    ]);
    expect(result).toEqual({ applied: [], cancelled: true });
    expect(names()).toEqual(["a", "b", "c", "d"]);
  });

  it("counts only variables that are actually there", async () => {
    // A script clearing names that do not exist has destroyed nothing to confirm.
    await applyScriptWrites([
      { name: "nope1", value: null },
      { name: "nope2", value: null },
      { name: "nope3", value: null }
    ]);
    expect(answer).not.toHaveBeenCalled();
    expect(names()).toEqual(["a", "b", "c", "d"]);
  });

  it("writes into the active environment when there is one", async () => {
    state.environments = [{ id: "e1", name: "Prod", variables: [variable("token")] }];
    state.activeEnvironmentId = "e1";
    await applyScriptWrites([{ name: "token", value: "fresh" }]);
    expect(state.environments[0].variables[0].value).toBe("fresh");
    expect(names()).toEqual(["a", "b", "c", "d"]);
  });
});
