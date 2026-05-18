import { describe, expect, it } from "vitest";
import { defaultSettings } from "../types";
import {
  COLLECTION_FORMAT,
  COLLECTION_VERSION,
  buildCollectionSnapshot,
  mergeItems,
  mergeVariables,
  parseCollectionExport
} from "./collection-format";
import type { CollectionSnapshot, SavedRequest, TreeItem, Variable } from "../types";

const request = (id: string, title: string, parentId: string = "/"): SavedRequest => ({
  id,
  kind: "request",
  parentId,
  title,
  method: "GET",
  url: "https://example.com",
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

describe("collection-format", () => {
  it("builds and parses a collection export file", () => {
    const snapshot: CollectionSnapshot = {
      items: [request("r1", "Example")],
      variables: [{ id: "v1", name: "base_url", value: "https://api.example.com", enabled: true, secret: false }],
      environments: [],
      activeEnvironmentId: null
    };
    const collection = buildCollectionSnapshot(snapshot, false);
    const file = {
      format: COLLECTION_FORMAT,
      version: COLLECTION_VERSION,
      exportedAt: new Date().toISOString(),
      collection
    };

    const parsed = parseCollectionExport(JSON.stringify(file), defaultSettings());
    expect(parsed.collection.items).toHaveLength(file.collection.items.length);
    expect(parsed.collection.items[0]?.title).toBe("Example");
    expect(parsed.collection.variables).toEqual(file.collection.variables);
  });

  it("strips variable values when requested", () => {
    const collection = buildCollectionSnapshot(
      {
        items: [],
        variables: [{ id: "v1", name: "token", value: "secret", enabled: true }],
        environments: [],
        activeEnvironmentId: null
      },
      true
    );
    expect(collection.variables.every((variable) => variable.value === "")).toBe(true);
  });

  it("rejects unknown formats", () => {
    expect(() => parseCollectionExport(JSON.stringify({ format: "other", version: 1 }), defaultSettings())).toThrow(
      "invalid-format"
    );
  });

  it("renames conflicting items on merge", () => {
    const existing: TreeItem[] = [request("a", "Alpha")];
    const incoming: TreeItem[] = [request("a", "Alpha import")];
    const merged = mergeItems(existing, incoming, "rename");
    expect(merged).toHaveLength(2);
    expect(merged[1]?.id).not.toBe("a");
    expect(merged[1]?.title).toContain("Alpha import");
  });

  it("skips conflicting subtrees on merge", () => {
    const existing: TreeItem[] = [request("a", "Alpha")];
    const incoming: TreeItem[] = [request("a", "Alpha import"), request("b", "Child", "a")];
    const merged = mergeItems(existing, incoming, "skip");
    expect(merged).toHaveLength(1);
  });

  it("merges variables with rename policy", () => {
    const existing: Variable[] = [{ id: "v1", name: "token", value: "one", enabled: true }];
    const incoming: Variable[] = [{ id: "v1", name: "token", value: "two", enabled: true }];
    const merged = mergeVariables(existing, incoming, "rename");
    expect(merged).toHaveLength(2);
    expect(merged.some((variable) => variable.value === "two")).toBe(true);
  });
});
