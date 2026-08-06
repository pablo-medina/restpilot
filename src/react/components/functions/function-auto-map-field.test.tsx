/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { state } from "../../../app/state";
import { defaultConfig, type AppFunction } from "../../../types";
import { FunctionAutoMapField } from "./FunctionAutoMapField";

vi.mock("../../../app/persistence", () => ({ scheduleSave: vi.fn() }));

function makeFunction(overrides: Partial<AppFunction> = {}): AppFunction {
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
    ...overrides
  } as AppFunction;
}

/** Re-renders on refresh() the way the function workspace does. */
function renderField(func: AppFunction) {
  const refresh = vi.fn();
  const view = render(<FunctionAutoMapField func={func} refresh={refresh} />);
  return { refresh, rerender: () => view.rerender(<FunctionAutoMapField func={func} refresh={refresh} />) };
}

describe("FunctionAutoMapField", () => {
  beforeEach(() => {
    Object.assign(state, defaultConfig(), {
      variables: [{ id: "g1", name: "access_token", value: "abc", enabled: true }],
      environments: [],
      activeEnvironmentId: null
    });
  });

  afterEach(cleanup);

  it("hides the fields until the function opts in", async () => {
    const user = userEvent.setup();
    const func = makeFunction();
    const { refresh, rerender } = renderField(func);

    expect(document.querySelector(".function-auto-map-fields")?.className).toContain("is-hidden");

    await user.click(screen.getByRole("checkbox"));
    expect(func.autoMapEnabled).toBe(true);
    expect(refresh).toHaveBeenCalled();

    rerender();
    expect(document.querySelector(".function-auto-map-fields")?.className).not.toContain("is-hidden");
  });

  it("writes the name and scope onto that function only", async () => {
    const user = userEvent.setup();
    const func = makeFunction({ autoMapEnabled: true, autoMapVariable: "" });
    const { rerender } = renderField(func);

    const nameInput = screen.getByRole("combobox", { name: "Variable name" });
    await user.type(nameInput, "access_token");
    rerender();
    expect(func.autoMapVariable).toBe("access_token");
    expect((nameInput as HTMLInputElement).value).toBe("access_token");

    await user.selectOptions(screen.getByRole("combobox", { name: "Scope" }), "environment");
    expect(func.autoMapScope).toBe("environment");
  });

  it("warns while the variable name is still empty", () => {
    renderField(makeFunction({ autoMapEnabled: true, autoMapVariable: "" }));
    expect(document.querySelector(".function-auto-map-warning")?.textContent).toContain("Enter a variable name");
  });
});
