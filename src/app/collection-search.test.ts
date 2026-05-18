import { describe, expect, it } from "vitest";
import { collectionSearchVisibleIds, itemMatchesCollectionSearch } from "./collection-search";
import type { SavedRequest, TreeItem } from "../types";

const request = (id: string, title: string, parentId: string, url: string, method = "GET"): SavedRequest => ({
  id,
  kind: "request",
  parentId,
  title,
  method,
  url,
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

describe("collection-search", () => {
  const items: TreeItem[] = [
    { id: "f1", kind: "folder", parentId: "/", title: "API", expanded: true },
    request("r1", "List users", "f1", "https://api.example.com/users"),
    request("r2", "Health", "/", "https://example.com/health", "POST")
  ];

  it("matches title, method, and url", () => {
    expect(itemMatchesCollectionSearch(items[1]!, "users")).toBe(true);
    expect(itemMatchesCollectionSearch(items[2]!, "post")).toBe(true);
    expect(itemMatchesCollectionSearch(items[2]!, "health")).toBe(true);
  });

  it("includes ancestors and descendants of a match", () => {
    const visible = collectionSearchVisibleIds(items, "users");
    expect(visible?.has("f1")).toBe(true);
    expect(visible?.has("r1")).toBe(true);
    expect(visible?.has("r2")).toBe(false);
  });

  it("returns null for an empty query", () => {
    expect(collectionSearchVisibleIds(items, "")).toBeNull();
  });
});
