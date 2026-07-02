/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COLLECTION_ROOT_PARENT_ID } from "../../app/collection-parent";
import { state } from "../../app/state";
import { bumpRenderGeneration } from "../render-bridge";
import { defaultConfig } from "../../types";
import { TitleBar } from "./TitleBar";
import { TabBar } from "./TabBar";

vi.mock("../../components/dialogs", () => ({
  messageDialog: vi.fn(async () => "confirm" as const),
  initDialogs: vi.fn(),
  hasOpenDialogs: vi.fn(() => false)
}));

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: vi.fn(() => false)
}));

describe("title bar chrome actions", () => {
  const refresh = vi.fn(() => {
    bumpRenderGeneration();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.ResizeObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
    } as typeof ResizeObserver;
    Object.assign(state, {
      ...defaultConfig(),
      tabs: {},
      activePanel: "request",
      sidebarVisible: true,
      openTabs: ["req-1"],
      activeTabId: "req-1",
      openRequestPopover: null,
      items: [
        {
          id: "req-1",
          kind: "request",
          parentId: COLLECTION_ROOT_PARENT_ID,
          title: "Test Request",
          method: "GET",
          url: "https://example.com",
          expanded: false
        }
      ]
    });
    state.tabs["req-1"] = {
      requestId: "req-1",
      response: null,
      error: null,
      loading: false,
      streaming: false,
      requestRunId: null,
      selectedResponseTab: "body",
      selectedRequestTab: "params"
    };
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '<div id="app"></div>';
  });

  it("sidebar toggle hides and shows the sidebar", async () => {
    const user = userEvent.setup();
    render(<TitleBar refresh={refresh} />);

    await user.click(screen.getByRole("button", { name: /hide sidebar/i }));
    expect(state.sidebarVisible).toBe(false);

    await user.click(screen.getByRole("button", { name: /show sidebar/i }));
    expect(state.sidebarVisible).toBe(true);
  });

  it("settings button opens the registered settings dialog", async () => {
    const user = userEvent.setup();
    const openSettings = vi.fn();
    const { registerSettingsDialogOpener } = await import("../lib/settings-dialog");
    registerSettingsDialogOpener(openSettings);
    render(<TitleBar refresh={refresh} />);

    await user.click(screen.getByRole("button", { name: /settings/i }));
    expect(openSettings).toHaveBeenCalledTimes(1);
  });

  it("variables toolbar button toggles the request variables popover", async () => {
    const user = userEvent.setup();
    render(
      <header className="title-bar title-bar--tabs">
        <TabBar refresh={refresh} embedded />
      </header>
    );

    await user.click(screen.getByRole("button", { name: /global variables/i }));
    expect(state.openRequestPopover).toBe("variables");

    await user.click(screen.getByRole("button", { name: /global variables/i }));
    expect(state.openRequestPopover).toBeNull();
  });
});
