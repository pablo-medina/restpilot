/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COLLECTION_ROOT_PARENT_ID } from "../../app/collection-parent";
import { state } from "../../app/state";
import { defaultConfig } from "../../types";
import { RequestBreadcrumb } from "./RequestBreadcrumb";
import type { SavedRequest } from "../../types";

vi.mock("../../app/persistence", () => ({ scheduleSave: vi.fn() }));

function request(): SavedRequest {
  return state.items.find((item): item is SavedRequest => item.kind === "request")!;
}

describe("request breadcrumb", () => {
  const refresh = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(state, {
      ...defaultConfig(),
      tabs: {},
      activePanel: "request",
      sidebarVisible: false,
      selectedTreeId: null,
      items: [
        { id: "f1", kind: "folder", parentId: COLLECTION_ROOT_PARENT_ID, title: "Prueba", expanded: false },
        { id: "f2", kind: "folder", parentId: "f1", title: "OpenRouter", expanded: false },
        {
          id: "req-1",
          kind: "request",
          parentId: "f2",
          title: "Get completions",
          method: "GET",
          url: "https://example.com",
          queryParams: [],
          headers: [],
          bodyMode: "none",
          rawType: "text",
          body: "",
          form: [],
          auth: { type: "none" },
          streamResponse: false,
          lastResponse: null,
          lastError: null
        }
      ]
    });
  });

  afterEach(() => cleanup());

  it("shows the collection root, every ancestor folder and the request", () => {
    render(<RequestBreadcrumb request={request()} refresh={refresh} />);
    const crumbs = screen.getAllByRole("button").map((button) => button.textContent);
    expect(crumbs).toEqual(["Collection", "Prueba", "OpenRouter", "Get completions"]);
  });

  it("reveals a folder crumb in the tree: sidebar open, ancestors expanded, row selected", async () => {
    render(<RequestBreadcrumb request={request()} refresh={refresh} />);
    await userEvent.click(screen.getByRole("button", { name: /OpenRouter/ }));

    expect(state.sidebarVisible).toBe(true);
    expect(state.selectedTreeId).toBe("f2");
    expect(state.items.filter((item) => item.kind === "folder").every((item) => item.expanded)).toBe(true);
    expect(refresh).toHaveBeenCalled();
  });

  it("folds the middle of a deep path behind one ellipsis crumb", () => {
    const deep = ["a", "b", "c", "d", "e", "f"];
    state.items = [
      ...deep.map((id, index) => ({
        id,
        kind: "folder" as const,
        parentId: index === 0 ? COLLECTION_ROOT_PARENT_ID : deep[index - 1],
        title: id.toUpperCase(),
        expanded: true
      })),
      { ...request(), parentId: "f" }
    ];

    render(<RequestBreadcrumb request={request()} refresh={refresh} />);
    const crumbs = screen.getAllByRole("button").map((button) => button.textContent);
    expect(crumbs).toEqual(["Collection", "A", "E", "F", "Get completions"]);
    expect(screen.getByTitle("B / C / D")).toBeTruthy();
  });
});
