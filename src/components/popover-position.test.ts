import { describe, expect, it } from "vitest";
import { computeMenuPosition, computePopoverPosition, computeSubmenuOffset } from "./popover-position";

describe("computePopoverPosition", () => {
  it("places above when there is more room on top", () => {
    const result = computePopoverPosition(
      new DOMRect(100, 500, 120, 32),
      { width: 400, height: 280 },
      { width: 800, height: 600 }
    );
    expect(result.placement).toBe("above");
    expect(result.top).toBeLessThan(500);
    expect(result.top).toBeGreaterThanOrEqual(8);
  });

  it("clamps horizontal position inside the viewport", () => {
    const result = computePopoverPosition(
      new DOMRect(750, 100, 40, 28),
      { width: 420, height: 200 },
      { width: 800, height: 600 }
    );
    expect(result.left).toBeLessThanOrEqual(800 - 420 - 8);
    expect(result.left).toBeGreaterThanOrEqual(8);
  });

  it("limits height when the popover would overflow below the anchor", () => {
    const result = computePopoverPosition(
      new DOMRect(40, 400, 100, 28),
      { width: 400, height: 400 },
      { width: 800, height: 600 }
    );
    expect(result.placement).toBe("below");
    expect(result.maxHeight).not.toBeNull();
    expect(result.top + (result.maxHeight ?? 0)).toBeLessThanOrEqual(600 - 8);
  });
});

const VIEWPORT = { width: 800, height: 600 };

describe("computeMenuPosition", () => {
  it("opens down and to the right when there is room", () => {
    const result = computeMenuPosition({ x: 100, y: 100 }, { width: 200, height: 240 }, VIEWPORT);
    expect(result.left).toBe(100);
    expect(result.top).toBe(100);
    expect(result.maxHeight).toBeNull();
  });

  it("flips upward when opened near the bottom edge", () => {
    // The reported bug: a menu opened low used to draw downward and get cut off.
    const result = computeMenuPosition({ x: 100, y: 560 }, { width: 200, height: 240 }, VIEWPORT);
    expect(result.top).toBeLessThan(560);
    expect(result.top).toBeGreaterThanOrEqual(8);
    expect(result.top + (result.maxHeight ?? 240)).toBeLessThanOrEqual(600 - 8);
  });

  it("flips leftward when opened near the right edge", () => {
    const result = computeMenuPosition({ x: 780, y: 100 }, { width: 200, height: 120 }, VIEWPORT);
    expect(result.left).toBe(580);
    expect(result.left + 200).toBeLessThanOrEqual(800 - 8);
  });

  it("caps the height when neither side can fit the menu", () => {
    const result = computeMenuPosition({ x: 100, y: 300 }, { width: 200, height: 900 }, VIEWPORT);
    expect(result.maxHeight).not.toBeNull();
    expect(result.top).toBeGreaterThanOrEqual(8);
    expect(result.top + (result.maxHeight ?? 0)).toBeLessThanOrEqual(600 - 8);
  });

  it("keeps an end-aligned menu inside the viewport", () => {
    const result = computeMenuPosition({ x: 40, y: 100 }, { width: 200, height: 120 }, VIEWPORT, "end");
    // Would land at -160 if the caller's preferred side were honoured blindly.
    expect(result.left).toBeGreaterThanOrEqual(8);
  });

  it("never positions a menu wider than the viewport off-screen", () => {
    const result = computeMenuPosition({ x: 400, y: 100 }, { width: 1200, height: 120 }, VIEWPORT);
    expect(result.left).toBe(8);
  });
});

describe("computeSubmenuOffset", () => {
  const size = { width: 220, height: 96 };
  /** Absolute viewport box the offsets resolve to, for readable assertions. */
  const resolve = (item: { left: number; right: number; top: number }, viewport = VIEWPORT) => {
    const offset = computeSubmenuOffset(item, size, viewport);
    const left = item.left + offset.left;
    const top = item.top + offset.top;
    return { left, top, right: left + size.width, bottom: top + size.height };
  };

  it("opens to the right of the item when there is room", () => {
    const box = resolve({ left: 100, right: 300, top: 200 });
    expect(box.left).toBe(296);
    expect(box.right).toBeLessThanOrEqual(VIEWPORT.width - 8);
  });

  it("flips to the left of the item near the right edge", () => {
    const wide = { width: 1280, height: 720 };
    const box = resolve({ left: 1056, right: 1244, top: 200 }, wide);
    expect(box.left).toBe(1056 - 220 + 4);
    expect(box.right).toBeLessThanOrEqual(wide.width - 8);
  });

  it("is not sticky — the same item away from the edge opens right again", () => {
    // Regression: deciding from the panel's own rect kept a previous flip forever.
    const wide = { width: 1280, height: 720 };
    expect(resolve({ left: 1056, right: 1244, top: 200 }, wide).left).toBe(840);
    expect(resolve({ left: 100, right: 300, top: 200 }, wide).left).toBe(296);
  });

  it("stays on the right when flipping left would fall off-screen", () => {
    const box = resolve({ left: 20, right: 60, top: 200 }, { width: 300, height: 600 });
    expect(box.left).toBeGreaterThanOrEqual(8);
    expect(box.right).toBeLessThanOrEqual(300 - 8);
  });

  it("slides up so the panel is never cut at the bottom", () => {
    const box = resolve({ left: 100, right: 300, top: 700 });
    expect(box.bottom).toBeLessThanOrEqual(VIEWPORT.height - 8);
    expect(box.top).toBeGreaterThanOrEqual(8);
  });
});
