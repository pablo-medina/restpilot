import { beforeEach, describe, expect, it } from "vitest";
import { state } from "./state";
import {
  collectionPathForFolder,
  collectionPathForParent,
  collectionPathForRequest
} from "./collection-path";
import { COLLECTION_ROOT_PARENT_ID } from "./collection-parent";

describe("collection paths", () => {
  beforeEach(() => {
    state.items = [
      { id: "f1", kind: "folder", parentId: "/", title: "Prueba", expanded: true },
      { id: "f2", kind: "folder", parentId: "f1", title: "OpenRouter", expanded: true }
    ];
  });

  it("builds path for folder parent id", () => {
    expect(collectionPathForParent("f1")).toBe("/Prueba");
    expect(collectionPathForParent("f2")).toBe("/Prueba/OpenRouter");
  });

  it("returns root for items directly under the collection root", () => {
    expect(collectionPathForParent(COLLECTION_ROOT_PARENT_ID)).toBe(COLLECTION_ROOT_PARENT_ID);
  });

  it("builds full path for a folder", () => {
    expect(collectionPathForFolder(state.items[1] as any)).toBe("/Prueba/OpenRouter");
  });

  it("builds full path for a request", () => {
    state.items.push({
      id: "r1",
      kind: "request",
      parentId: "f2",
      title: "Chat",
      method: "POST",
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
    });
    expect(collectionPathForRequest(state.items[2] as any)).toBe("/Prueba/OpenRouter/Chat");
  });
});
