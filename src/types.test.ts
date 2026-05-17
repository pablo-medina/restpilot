import { describe, expect, it } from "vitest";
import { clampRequestTimeoutSecs, defaultSettings } from "./types";

describe("clampRequestTimeoutSecs", () => {
  it("clamps to 5–300", () => {
    expect(clampRequestTimeoutSecs(3)).toBe(5);
    expect(clampRequestTimeoutSecs(999)).toBe(300);
    expect(clampRequestTimeoutSecs(60)).toBe(60);
  });

  it("falls back to default for invalid input", () => {
    expect(clampRequestTimeoutSecs("x")).toBe(defaultSettings().requestTimeoutSecs);
  });
});
