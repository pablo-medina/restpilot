import { describe, expect, it, beforeEach } from "vitest";
import { COLLECTION_ROOT_PARENT_ID } from "../app/collection-parent";
import { state } from "../app/state";
import type { Folder, SavedRequest } from "../types";
import { buildFolderExportSnapshot, folderExportDefaultName } from "./folder-snapshot";

const request = (id: string, title: string, parentId: string): SavedRequest => ({
  id,
  kind: "request",
  parentId,
  title,
  method: "GET",
  url: "https://example.com/${base}",
  queryParams: [],
  headers: [],
  bodyMode: "none",
  rawType: "json",
  body: "",
  form: [],
  streamResponse: false,
  auth: { type: "none" },
  lastResponse: null,
  lastError: null
});

const folder = (id: string, title: string, parentId: string): Folder => ({
  id,
  kind: "folder",
  parentId,
  title,
  expanded: true
});

describe("folder-snapshot", () => {
  beforeEach(() => {
    state.items = [
      folder("f1", "API", "/"),
      folder("f2", "Users", "f1"),
      request("r1", "List users", "f2"),
      request("r2", "Other", "/")
    ];
    state.variables = [{ id: "v1", name: "base", value: "https://api.example.com", enabled: true }];
    state.environments = [];
    state.activeEnvironmentId = null;
  });

  it("builds a rerooted subtree snapshot for a folder", () => {
    const snapshot = buildFolderExportSnapshot("f1");
    expect(snapshot).not.toBeNull();
    expect(snapshot?.folderName).toBe("API");
    expect(snapshot?.items).toHaveLength(3);
    expect(snapshot?.items.find((item) => item.id === "f1")?.parentId).toBe(COLLECTION_ROOT_PARENT_ID);
    expect(snapshot?.items.some((item) => item.id === "r2")).toBe(false);
    expect(snapshot?.variables).toHaveLength(1);
  });

  it("sanitizes default export names", () => {
    expect(folderExportDefaultName(folder("x", "My Folder/API", "/"))).toBe("My-FolderAPI");
  });
});
