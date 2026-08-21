/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { state } from "../../app/state";
import { defaultConfig } from "../../types";
import { VariableInput } from "./VariableInput";

/** Mirrors how a header/param row feeds the edited value back into the input. */
function ControlledInput() {
  const [value, setValue] = useState("");
  return <VariableInput aria-label="value" value={value} onValueChange={setValue} />;
}

function input() {
  return screen.getByLabelText("value") as HTMLInputElement;
}

/** `userEvent.type` reads `{` as the start of a special-key sequence and `{{` as one literal
 * brace, so every brace in the text we actually want typed has to be doubled. */
function literal(text: string) {
  return text.replace(/\{/g, "{{");
}

describe("VariableInput", () => {
  beforeEach(() => {
    Object.assign(state, {
      ...defaultConfig(),
      variables: [
        { id: "var-1", name: "access_token", value: "abc", enabled: true },
        { id: "var-2", name: "base_url", value: "https://example.com", enabled: true }
      ]
    });
  });

  afterEach(cleanup);

  it("opens on `{{` and lists every active variable", async () => {
    const user = userEvent.setup();
    render(<ControlledInput />);

    await user.type(input(), literal("{{"));

    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "{{access_token}}",
      "{{base_url}}"
    ]);
  });

  it("does not open on a single brace", async () => {
    const user = userEvent.setup();
    render(<ControlledInput />);

    await user.type(input(), literal("{"));

    expect(screen.queryByRole("option")).toBeNull();
  });

  it("does not open on a bare `$`, which is no longer the trigger", async () => {
    const user = userEvent.setup();
    render(<ControlledInput />);

    await user.type(input(), "$");

    expect(screen.queryByRole("option")).toBeNull();
  });

  it("filters by what follows the braces and completes the template", async () => {
    const user = userEvent.setup();
    render(<ControlledInput />);

    await user.type(input(), literal("Bearer {{acc"));
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["{{access_token}}"]);

    await user.click(screen.getByRole("option", { name: "{{access_token}}" }));
    expect(input().value).toBe("Bearer {{access_token}}");
  });

  it("stays closed once the template is closed", async () => {
    const user = userEvent.setup();
    render(<ControlledInput />);

    await user.type(input(), literal("{{base_url}}"));

    expect(screen.queryByRole("option")).toBeNull();
  });

  it("completes a second template after a closed one", async () => {
    const user = userEvent.setup();
    render(<ControlledInput />);

    await user.type(input(), literal("{{base_url}}/{{acc"));

    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["{{access_token}}"]);
  });
});
