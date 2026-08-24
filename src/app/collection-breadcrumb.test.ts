import { beforeEach, describe, expect, it } from "vitest";
import { state } from "./state";
import { collectionAncestorFolders } from "./collection-breadcrumb";
import { COLLECTION_ROOT_PARENT_ID } from "./collection-parent";

describe("collection breadcrumb", () => {
  beforeEach(() => {
    state.items = [
      { id: "f1", kind: "folder", parentId: "/", title: "Prueba", expanded: true },
      { id: "f2", kind: "folder", parentId: "f1", title: "OpenRouter", expanded: true }
    ];
  });

  it("returns no folders for an item at the collection root", () => {
    expect(collectionAncestorFolders(COLLECTION_ROOT_PARENT_ID)).toEqual([]);
  });

  it("lists ancestors outermost first", () => {
    expect(collectionAncestorFolders("f2").map((folder) => folder.title)).toEqual([
      "Prueba",
      "OpenRouter"
    ]);
  });

  it("stops at a missing parent instead of guessing", () => {
    expect(collectionAncestorFolders("gone")).toEqual([]);
  });

  it("terminates on a parent cycle", () => {
    state.items = [
      { id: "a", kind: "folder", parentId: "b", title: "A", expanded: true },
      { id: "b", kind: "folder", parentId: "a", title: "B", expanded: true }
    ];
    expect(collectionAncestorFolders("a").length).toBeLessThanOrEqual(2);
  });
});
