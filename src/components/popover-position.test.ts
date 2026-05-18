import { describe, expect, it } from "vitest";
import { computePopoverPosition } from "./popover-position";

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
