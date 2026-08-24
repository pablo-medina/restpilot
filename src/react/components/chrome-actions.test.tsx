/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COLLECTION_ROOT_PARENT_ID } from "../../app/collection-parent";
import { state } from "../../app/state";
import { bumpRenderGeneration } from "../render-bridge";
import { defaultConfig } from "../../types";
import { CollectionSidebar } from "./CollectionSidebar";
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
      selectedRequestTab: "queryParams"
    };
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '<div id="app"></div>';
  });

  it("sidebar toggle hides and shows the sidebar, handing off between rail and title bar", async () => {
    const user = userEvent.setup();
    render(
      <>
        <CollectionSidebar refresh={refresh} />
        <TitleBar refresh={refresh} />
      </>
    );

    // Open: the sidebar rail owns the toggle and the title bar leaves its slot empty.
    expect(document.querySelector(".sidebar-rail [data-title-bar-sidebar]")).not.toBeNull();
    expect(document.querySelector(".title-bar-leading [data-title-bar-sidebar]")).toBeNull();

    await user.click(screen.getByRole("button", { name: /hide sidebar/i }));
    expect(state.sidebarVisible).toBe(false);

    // Hidden: the rail goes with the sidebar, so the toggle is back in the title bar.
    expect(document.querySelector(".title-bar-leading [data-title-bar-sidebar]")).not.toBeNull();

    await user.click(screen.getByRole("button", { name: /show sidebar/i }));
    expect(state.sidebarVisible).toBe(true);
  });

  it("rail menus open one at a time and close on outside click or Escape", async () => {
    const user = userEvent.setup();
    render(<CollectionSidebar refresh={refresh} />);

    const openMenus = () => document.querySelectorAll(".sidebar-action-popover");
    const newTrigger = screen.getByRole("button", { name: /new request at collection root/i });
    const moreTrigger = screen.getByRole("button", { name: /import collection/i });

    await user.click(newTrigger);
    expect(openMenus()).toHaveLength(1);
    expect(screen.getByRole("menuitem", { name: /new folder/i })).toBeTruthy();

    // The other trigger takes over rather than leaving both menus up.
    await user.click(moreTrigger);
    expect(openMenus()).toHaveLength(1);
    expect(screen.getByRole("menuitem", { name: /export collection/i })).toBeTruthy();

    // A click anywhere else dismisses it.
    await user.click(document.querySelector(".sidebar-context")!);
    expect(openMenus()).toHaveLength(0);

    await user.click(moreTrigger);
    expect(openMenus()).toHaveLength(1);
    await user.keyboard("{Escape}");
    expect(openMenus()).toHaveLength(0);
    expect(document.activeElement).toBe(moreTrigger);
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

  it("environment toolbar button toggles the environment & variables popover", async () => {
    const user = userEvent.setup();
    render(
      <header className="title-bar title-bar--tabs">
        <TabBar refresh={refresh} embedded />
      </header>
    );

    const envTrigger = screen.getByTitle(/active environment and variables/i);
    await user.click(envTrigger);
    expect(state.openRequestPopover).toBe("environment");

    await user.click(envTrigger);
    expect(state.openRequestPopover).toBeNull();
  });
});
