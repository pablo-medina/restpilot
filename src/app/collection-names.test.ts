import { describe, expect, it } from "vitest";
import {
  normalizeDuplicateNaming,
  numberedDuplicateTitle,
  titleForDuplicate
} from "./collection-names";
import type { TreeItem } from "../types";

const folder = (id: string, title: string, parentId: string = "/"): TreeItem => ({
  id,
  kind: "folder",
  parentId,
  title,
  expanded: true
});

describe("collection-names", () => {
  it("uses copy-of prefix when configured", () => {
    const items = [folder("a", "API")];
    expect(titleForDuplicate("API", "/", items, "copyOf")).toBe("Copy of API");
  });

  it("uses numbered suffix when configured", () => {
    const items = [folder("a", "API"), folder("b", "API (2)")];
    expect(titleForDuplicate("API", "/", items, "numbered")).toBe("API (3)");
  });

  it("numbers from base title when source already has a suffix", () => {
    const items = [folder("a", "API (2)")];
    expect(numberedDuplicateTitle("API (2)", "/", items)).toBe("API (3)");
  });

  it("migrates legacy numbered checkbox setting", () => {
    expect(normalizeDuplicateNaming(undefined, true)).toBe("numbered");
    expect(normalizeDuplicateNaming(undefined, false)).toBe("copyOf");
    expect(normalizeDuplicateNaming("original", true)).toBe("copyOf");
  });
});
