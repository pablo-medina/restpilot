/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COLLECTION_ROOT_PARENT_ID } from "../../app/collection-parent";
import { state } from "../../app/state";
import { bumpRenderGeneration } from "../render-bridge";
import { isAppActionTarget } from "../lib/app-action-targets";
import { defaultConfig } from "../../types";
import { CollectionTree } from "./CollectionTree";
import { GlobalsVariablesPanel } from "./variables/GlobalsVariablesPanel";

vi.mock("../../components/dialogs", () => ({
  messageDialog: vi.fn(async () => "confirm" as const),
  initDialogs: vi.fn()
}));

function installAppCaptureListeners(onPopoverOutsideClick: () => void) {
  document.addEventListener(
    "click",
    (event) => {
      if (isAppActionTarget(event.target)) return;
      const activePopover = document.querySelector(".app-popover");
      if (!activePopover) return;
      if ((event.target as HTMLElement).closest(".app-popover")) return;
      onPopoverOutsideClick();
    },
    true
  );
}

describe("row contextual actions", () => {
  const refresh = vi.fn(() => {
    bumpRenderGeneration();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(state, {
      ...defaultConfig(),
      tabs: {},
      activePanel: "request",
      selectedTreeId: null,
      editingTreeId: null,
      openTabs: [],
      activeTabId: "",
      collectionSearchQuery: "",
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
      ],
      variables: [
        { id: "var-1", name: "API_KEY", value: "secret", enabled: true, secret: true }
      ]
    });
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '<div id="app"></div>';
  });

  it("collection row F2 shortcut enters rename mode", async () => {
    const user = userEvent.setup();
    render(<CollectionTree refresh={refresh} />);

    const row = document.querySelector('[data-tree-id="req-1"]') as HTMLElement;
    row.focus();
    await user.keyboard("{F2}");

    expect(state.editingTreeId).toBe("req-1");
    expect(screen.getByRole("textbox", { name: /rename/i })).toBeTruthy();
  });

  it("collection row Delete shortcut removes item after confirm", async () => {
    const user = userEvent.setup();
    render(<CollectionTree refresh={refresh} />);

    const row = document.querySelector('[data-tree-id="req-1"]') as HTMLElement;
    row.focus();
    await user.keyboard("{Delete}");

    expect(state.items).toHaveLength(0);
  });

  it("variable secret toggle flips secret flag", async () => {
    const user = userEvent.setup();
    render(<GlobalsVariablesPanel refresh={refresh} />);

    await user.click(screen.getByRole("button", { name: /secret/i }));

    expect(state.variables[0].secret).toBe(false);
  });

  it("variable remove button deletes variable", async () => {
    const user = userEvent.setup();
    render(<GlobalsVariablesPanel refresh={refresh} />);

    await user.click(screen.getByRole("button", { name: /delete/i }));

    expect(state.variables).toHaveLength(0);
  });

  it("row actions still work when a popover is mounted and capture listeners are installed", async () => {
    const popoverOutside = vi.fn();
    installAppCaptureListeners(popoverOutside);
    document.body.insertAdjacentHTML(
      "beforeend",
      '<div class="app-popover" role="dialog"><div class="app-popover-body">open</div></div>'
    );

    const user = userEvent.setup();
    render(
      <div className="variables-workspace">
        <GlobalsVariablesPanel refresh={refresh} />
      </div>
    );

    await user.click(screen.getByRole("button", { name: /secret/i }));

    expect(state.variables[0].secret).toBe(false);
    expect(popoverOutside).not.toHaveBeenCalled();
  });
});
