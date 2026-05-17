import { describe, expect, it, beforeEach, vi } from "vitest";
import type { SavedRequest, TreeItem } from "../types";

vi.mock("./render", () => ({ render: vi.fn() }));
vi.mock("./persistence", () => ({ scheduleSave: vi.fn() }));

import { moveDroppedItem, moveItemTo } from "./collection-store";
import { state } from "./state";

function folder(id: string, parentId: string | null, title: string): TreeItem {
  return { id, kind: "folder", parentId, title, expanded: true };
}

function request(id: string, parentId: string | null, title: string): SavedRequest {
  return {
    id,
    kind: "request",
    parentId,
    title,
    method: "GET",
    url: "https://example.com",
    headers: [],
    queryParams: [],
    form: [],
    bodyMode: "none",
    rawType: "json",
    body: "",
    streamResponse: false,
    auth: { type: "none" },
    lastResponse: null,
    lastError: null
  };
}

describe("collection-store reorder", () => {
  beforeEach(() => {
    state.items = [
      folder("f1", null, "Folder 1"),
      request("r1", "f1", "Request 1"),
      request("r2", "f1", "Request 2"),
      folder("f2", null, "Folder 2"),
      request("r3", null, "Request 3")
    ];
  });

  it("reorders siblings before a target", () => {
    moveDroppedItem("r2", state.items.find((i) => i.id === "r1")!, "before");
    expect(state.items.filter((i) => i.parentId === "f1").map((i) => i.id)).toEqual(["r2", "r1"]);
  });

  it("reorders siblings after a target", () => {
    moveDroppedItem("r1", state.items.find((i) => i.id === "r2")!, "after");
    expect(state.items.filter((i) => i.parentId === "f1").map((i) => i.id)).toEqual(["r2", "r1"]);
  });

  it("moves a request into a folder", () => {
    moveDroppedItem("r3", state.items.find((i) => i.id === "f2")!, "inside");
    expect(state.items.find((i) => i.id === "r3")?.parentId).toBe("f2");
  });

  it("moves an item to the collection root at the end", () => {
    moveItemTo("r1", null, 2);
    expect(state.items.filter((i) => i.parentId === null).map((i) => i.id)).toEqual(["f1", "f2", "r1", "r3"]);
  });
});
