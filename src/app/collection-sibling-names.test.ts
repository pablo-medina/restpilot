import { beforeEach, describe, expect, it } from "vitest";
import { state } from "./state";
import {
  assertUniqueSiblingTitle,
  buildSiblingNameConflict,
  duplicateTitleGroups,
  SiblingNameConflictError,
  uniquifySiblingTitle
} from "./collection-sibling-names";
import { insertItemAt } from "./collection-store";
import type { TreeItem } from "../types";

const folder = (id: string, title: string, parentId: string = "/"): TreeItem => ({
  id,
  kind: "folder",
  parentId,
  title,
  expanded: true
});

describe("collection-sibling-names", () => {
  beforeEach(() => {
    state.items = [folder("f1", "API"), folder("f2", "Other", "f1")];
  });

  it("detects sibling title conflicts", () => {
    const conflict = buildSiblingNameConflict("/", "API");
    expect(conflict?.existing).toHaveLength(1);
    expect(conflict?.existing[0]?.path).toBe("/API");
  });

  it("throws when inserting a duplicate sibling name", () => {
    expect(() => assertUniqueSiblingTitle("/", "API")).toThrow(SiblingNameConflictError);
  });

  it("uniquifies default sibling titles", () => {
    expect(uniquifySiblingTitle("/", "API")).toBe("API (2)");
  });

  it("lists duplicate title groups with full paths", () => {
    state.items.push(folder("f3", "API", "/"));
    const groups = duplicateTitleGroups();
    expect(groups).toEqual([{ kind: "folder", title: "API", paths: ["/API", "/API"] }]);
  });

  it("blocks insertItemAt for duplicate sibling names", () => {
    const next = folder("f9", "API");
    expect(() => insertItemAt(next, "/", 0)).toThrow(SiblingNameConflictError);
  });
});
