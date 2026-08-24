import { describe, expect, it } from "vitest";
import {
  computeReorderedTabs,
  computeTabInsertIndexFromStrip,
  planTabLimitEviction,
  reorderTabsToInsertIndex,
  type TabSlotRect
} from "./open-tabs";

describe("computeReorderedTabs", () => {
  const tabs = ["a", "b", "c", "d"];

  it("moves a tab before another", () => {
    expect(computeReorderedTabs(tabs, "d", "b", "before")).toEqual(["a", "d", "b", "c"]);
  });

  it("moves a tab after another", () => {
    expect(computeReorderedTabs(tabs, "a", "c", "after")).toEqual(["b", "c", "a", "d"]);
  });

  it("swaps adjacent tabs", () => {
    expect(computeReorderedTabs(tabs, "b", "a", "before")).toEqual(["b", "a", "c", "d"]);
  });

  it("returns null for unknown ids", () => {
    expect(computeReorderedTabs(tabs, "a", "missing", "before")).toBeNull();
  });

  it("returns null when source and target are the same", () => {
    expect(computeReorderedTabs(tabs, "b", "b", "after")).toBeNull();
  });
});

describe("reorderTabsToInsertIndex", () => {
  const tabs = ["a", "b", "c", "d"];

  it("inserts at the start", () => {
    expect(reorderTabsToInsertIndex(tabs, "c", 0)).toEqual(["c", "a", "b", "d"]);
  });

  it("inserts in the middle", () => {
    expect(reorderTabsToInsertIndex(tabs, "a", 2)).toEqual(["b", "a", "c", "d"]);
  });

  it("inserts at the end", () => {
    expect(reorderTabsToInsertIndex(tabs, "b", 4)).toEqual(["a", "c", "d", "b"]);
  });

  it("returns null when the index is unchanged", () => {
    expect(reorderTabsToInsertIndex(tabs, "b", 1)).toBeNull();
  });
});

describe("computeTabInsertIndexFromStrip", () => {
  const slots: TabSlotRect[] = [
    { id: "a", left: 0, right: 100, mid: 50 },
    { id: "b", left: 100, right: 200, mid: 150 },
    { id: "c", left: 200, right: 300, mid: 250 }
  ];

  it("inserts before a tab on its left half", () => {
    expect(computeTabInsertIndexFromStrip(slots, "c", 120)).toBe(1);
  });

  it("inserts after a tab on its right half", () => {
    expect(computeTabInsertIndexFromStrip(slots, "c", 180)).toBe(2);
  });

  it("uses gap logic when pointer is not inside any tab span", () => {
    expect(computeTabInsertIndexFromStrip(slots, "b", 95)).toBe(1);
    expect(computeTabInsertIndexFromStrip(slots, "b", 280)).toBe(3);
  });

  it("maps over the source tab span to its edges", () => {
    expect(computeTabInsertIndexFromStrip(slots, "b", 120)).toBe(1);
    expect(computeTabInsertIndexFromStrip(slots, "b", 180)).toBe(2);
  });
});

describe("planTabLimitEviction", () => {
  const never = () => 0;
  const usage = (ranks: Record<string, number>) => (id: string) => ranks[id] ?? 0;

  it("keeps every tab while the limit is not exceeded", () => {
    expect(planTabLimitEviction(["a", "b", "c"], 5, never)).toEqual([]);
    expect(planTabLimitEviction(["a", "b", "c"], 3, never)).toEqual([]);
  });

  it("drops the least recently used tab first", () => {
    const tabs = ["a", "b", "c", "d"];
    const ranks = usage({ a: 4, b: 1, c: 3, d: 2 });
    expect(planTabLimitEviction(tabs, 3, ranks)).toEqual(["b"]);
    expect(planTabLimitEviction(tabs, 2, ranks)).toEqual(["b", "d"]);
  });

  it("falls back to strip order for tabs never used in this session", () => {
    expect(planTabLimitEviction(["a", "b", "c", "d"], 2, never)).toEqual(["a", "b"]);
  });

  it("never drops a protected tab", () => {
    const ranks = usage({ a: 1, b: 2, c: 3 });
    expect(planTabLimitEviction(["a", "b", "c"], 1, ranks, ["a", "c"])).toEqual(["b"]);
  });

  it("returns fewer tabs than the overflow when the rest is protected", () => {
    expect(planTabLimitEviction(["a", "b"], 1, never, ["a", "b"])).toEqual([]);
  });

  it("treats a limit below one as one", () => {
    expect(planTabLimitEviction(["a", "b"], 0, never, ["b"])).toEqual(["a"]);
  });
});
