/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { state } from "../../../app/state";
import { promptForParameters } from "../../lib/parameter-prompt";
import { defaultConfig, type SavedRequest } from "../../../types";
import { ParameterPromptDialog } from "./ParameterPromptDialog";

let counter = 0;

function request(body: string, overrides: Partial<SavedRequest> = {}): SavedRequest {
  return {
    id: `r${++counter}`,
    kind: "request",
    parentId: "/",
    title: "Login",
    method: "POST",
    url: "https://api.test/auth",
    queryParams: [],
    headers: [],
    bodyMode: "raw",
    rawType: "json",
    body,
    form: [],
    streamResponse: false,
    auth: { type: "none" },
    lastResponse: null,
    lastError: null,
    ...overrides
  };
}

describe("ParameterPromptDialog", () => {
  beforeEach(() => {
    Object.assign(state, {
      ...defaultConfig(),
      variables: [{ id: "v1", name: "username", value: "alice", enabled: true }]
    });
  });

  afterEach(cleanup);

  it("stays out of the way until something asks for answers", () => {
    render(<ParameterPromptDialog />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("infers the parameter from the request text with nothing declared", async () => {
    const user = userEvent.setup();
    render(<ParameterPromptDialog />);

    const pending = promptForParameters(request("{{?modelName}}"));
    await waitFor(() => screen.getByRole("dialog"));
    expect(screen.getByText("modelName")).toBeTruthy();

    await user.keyboard("gpt-5");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await expect(pending).resolves.toEqual({ modelName: "gpt-5" });
  });

  it("shows a single input for one parameter and a grid for several", async () => {
    render(<ParameterPromptDialog />);

    promptForParameters(request("{{?one}}"));
    await waitFor(() => screen.getByRole("dialog"));
    expect(screen.queryByRole("grid")).toBeNull();
    cleanup();

    render(<ParameterPromptDialog />);
    promptForParameters(request("{{?one}} {{?two}}"));
    await waitFor(() => screen.getByRole("grid"));
    expect(screen.getAllByRole("rowheader").map((cell) => cell.textContent)).toEqual(["one", "two"]);
  });

  it("seeds a value from a variable of the same name", async () => {
    render(<ParameterPromptDialog />);
    promptForParameters(request("{{?username}}"));
    await waitFor(() => screen.getByRole("dialog"));

    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("alice");
  });

  it("sends an empty value without complaining", async () => {
    const user = userEvent.setup();
    render(<ParameterPromptDialog />);

    const pending = promptForParameters(request("{{?note}}"));
    await waitFor(() => screen.getByRole("dialog"));

    await user.click(screen.getByRole("button", { name: "Send" }));
    await expect(pending).resolves.toEqual({ note: "" });
  });

  it("steps between grid rows with the arrow keys", async () => {
    const user = userEvent.setup();
    render(<ParameterPromptDialog />);

    promptForParameters(request("{{?one}} {{?two}}"));
    await waitFor(() => screen.getByRole("grid"));

    expect(document.activeElement).toBe(screen.getByLabelText("one"));
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(screen.getByLabelText("two"));
    await user.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(screen.getByLabelText("one"));
  });

  it("commits with Enter down the grid and submits past the last row", async () => {
    const user = userEvent.setup();
    render(<ParameterPromptDialog />);

    const pending = promptForParameters(request("{{?one}} {{?two}}"));
    await waitFor(() => screen.getByRole("grid"));

    await user.keyboard("a{Enter}b{Enter}");
    await expect(pending).resolves.toEqual({ one: "a", two: "b" });
  });

  // Null means abort; anything else means go.
  it("resolves to null when cancelled", async () => {
    const user = userEvent.setup();
    render(<ParameterPromptDialog />);

    const pending = promptForParameters(request("{{?one}}"));
    await waitFor(() => screen.getByRole("dialog"));

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await expect(pending).resolves.toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("resolves to null on Escape", async () => {
    const user = userEvent.setup();
    render(<ParameterPromptDialog />);

    const pending = promptForParameters(request("{{?one}}"));
    await waitFor(() => screen.getByRole("dialog"));

    await user.keyboard("{Escape}");
    await expect(pending).resolves.toBeNull();
  });

  it("pre-fills the last answer on the next run of the same request", async () => {
    const user = userEvent.setup();
    render(<ParameterPromptDialog />);

    const target = request("{{?modelName}}");
    const first = promptForParameters(target);
    await waitFor(() => screen.getByRole("dialog"));
    await user.keyboard("gpt-5");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await expect(first).resolves.toEqual({ modelName: "gpt-5" });

    promptForParameters(target);
    await waitFor(() => screen.getByRole("dialog"));
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("gpt-5");
  });
});
