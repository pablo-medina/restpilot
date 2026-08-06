/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { state } from "../../app/state";
import { defaultConfig } from "../../types";
import { VariableNameInput } from "./VariableNameInput";

/** Mirrors how Settings feeds the edited value back into the input. */
function ControlledInput({ onValueChange }: { onValueChange: (value: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <VariableNameInput
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onValueChange(next);
      }}
    />
  );
}

describe("VariableNameInput", () => {
  beforeEach(() => {
    Object.assign(state, {
      ...defaultConfig(),
      variables: [
        { id: "var-1", name: "access_token", value: "abc", enabled: true },
        { id: "var-2", name: "base_url", value: "https://example.com", enabled: true }
      ],
      environments: [{ id: "env-1", name: "Staging", variables: [{ id: "var-3", name: "tenant", value: "acme", enabled: true }] }],
      activeEnvironmentId: "env-1"
    });
  });

  afterEach(cleanup);

  it("suggests globals and active-environment names on focus", async () => {
    const user = userEvent.setup();
    render(<VariableNameInput value="" onValueChange={vi.fn()} />);

    await user.click(screen.getByRole("combobox"));

    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "access_token",
      "base_url",
      "tenant"
    ]);
  });

  it("filters as the user types and reports the picked name", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<ControlledInput onValueChange={onValueChange} />);

    await user.type(screen.getByRole("combobox"), "ten");
    expect(onValueChange).toHaveBeenLastCalledWith("ten");
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["tenant"]);

    await user.click(screen.getByRole("option", { name: "tenant" }));
    expect(onValueChange).toHaveBeenLastCalledWith("tenant");
  });

  it("keeps free-typed names that match nothing", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<ControlledInput onValueChange={onValueChange} />);

    await user.type(screen.getByRole("combobox"), "brand_new");
    expect(onValueChange).toHaveBeenLastCalledWith("brand_new");
    expect(screen.queryByRole("option")).toBeNull();
  });
});
