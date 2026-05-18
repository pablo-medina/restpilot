import { beforeEach, describe, expect, it } from "vitest";
import { state } from "./state";
import {
  collectionPathForFolder,
  collectionPathForParent,
  collectionPathForRequest,
  resolveCollectionPath
} from "./collection-path";
import { COLLECTION_ROOT_PARENT_ID } from "./collection-parent";

describe("collection paths", () => {
  beforeEach(() => {
    state.items = [
      { id: "f1", kind: "folder", parentId: "/", title: "Prueba", expanded: true },
      { id: "f2", kind: "folder", parentId: "f1", title: "OpenRouter", expanded: true }
    ];
  });

  it("resolves root path", () => {
    expect(resolveCollectionPath("/").parentId).toBe(COLLECTION_ROOT_PARENT_ID);
  });

  it("resolves folder at root by path", () => {
    expect(resolveCollectionPath("/Prueba").parentId).toBe("f1");
  });

  it("resolves nested folder path", () => {
    expect(resolveCollectionPath("/Prueba/OpenRouter").parentId).toBe("f2");
  });

  it("builds path for folder parent id", () => {
    expect(collectionPathForParent("f1")).toBe("/Prueba");
    expect(collectionPathForParent("f2")).toBe("/Prueba/OpenRouter");
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
