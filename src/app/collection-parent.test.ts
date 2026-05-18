import { describe, expect, it } from "vitest";
import {
  COLLECTION_ROOT_PARENT_ID,
  isCollectionRoot,
  normalizeParentId
} from "./collection-parent";

describe("collection parent id", () => {
  it("normalizes legacy null and empty to root", () => {
    expect(normalizeParentId(null)).toBe(COLLECTION_ROOT_PARENT_ID);
    expect(normalizeParentId(undefined)).toBe(COLLECTION_ROOT_PARENT_ID);
    expect(normalizeParentId("")).toBe(COLLECTION_ROOT_PARENT_ID);
    expect(normalizeParentId("/")).toBe(COLLECTION_ROOT_PARENT_ID);
  });

  it("keeps folder ids unchanged", () => {
    expect(normalizeParentId("folder-abc")).toBe("folder-abc");
  });

  it("detects collection root", () => {
    expect(isCollectionRoot("/")).toBe(true);
    expect(isCollectionRoot(null)).toBe(true);
    expect(isCollectionRoot("folder-1")).toBe(false);
  });
});
