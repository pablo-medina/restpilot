import { describe, expect, it } from "vitest";
import { buildRequestUrl, splitUrl } from "./url-params";
import type { Pair } from "../types";

function pair(key: string, value: string, enabled = true): Pair {
  return { id: "p1", key, value, enabled };
}

describe("splitUrl", () => {
  it("splits base, query, and hash", () => {
    const parts = splitUrl("https://api.example.com/users?page=1&sort=name#section");
    expect(parts.base).toBe("https://api.example.com/users");
    expect(parts.hash).toBe("section");
    expect(parts.params).toEqual([
      { key: "page", value: "1" },
      { key: "sort", value: "name" }
    ]);
  });

  it("returns empty parts for blank input", () => {
    expect(splitUrl("   ")).toEqual({ base: "", hash: "", params: [] });
  });
});

describe("buildRequestUrl", () => {
  it("builds query string from enabled params", () => {
    const url = buildRequestUrl("https://api.example.com/users", [
      pair("page", "2"),
      pair("ignored", "x", false)
    ]);
    expect(url).toBe("https://api.example.com/users?page=2");
  });

  it("appends hash when present", () => {
    const url = buildRequestUrl("https://api.example.com/", [], "frag");
    expect(url).toBe("https://api.example.com/#frag");
  });
});
