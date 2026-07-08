import { describe, expect, it } from "vitest";
import { buildRequestUrl, ingestUrlIntoRequest, splitUrl } from "./url-params";
import type { Pair, SavedRequest } from "../types";

function pair(key: string, value: string, enabled = true): Pair {
  return { id: "p1", key, value, enabled };
}

function request(overrides: Pick<SavedRequest, "url" | "urlHash" | "queryParams">): SavedRequest {
  return {
    id: "r1",
    kind: "request",
    parentId: "/",
    title: "T",
    method: "GET",
    headers: [],
    bodyMode: "none",
    rawType: "json",
    body: "",
    form: [],
    streamResponse: false,
    auth: { type: "none" },
    lastResponse: null,
    lastError: null,
    ...overrides
  };
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

  it("preserves a trailing question mark in the base when query is empty", () => {
    const url = buildRequestUrl("https://api.example.com/users?", [], "");
    expect(url).toBe("https://api.example.com/users?");
  });
});

describe("ingestUrlIntoRequest", () => {
  it("keeps a bare question mark while the user types query params", () => {
    const req = request({
      url: "https://api.example.com/users",
      urlHash: "",
      queryParams: []
    });
    let nextId = 0;
    ingestUrlIntoRequest(req, "https://api.example.com/users?", () => `p${++nextId}`);
    expect(req.url).toBe("https://api.example.com/users?");
    expect(req.queryParams).toEqual([]);
    expect(buildRequestUrl(req.url, req.queryParams, req.urlHash)).toBe(
      "https://api.example.com/users?"
    );
  });

  it("moves parsed query params out of the base url", () => {
    const req = request({
      url: "https://api.example.com/users",
      urlHash: "",
      queryParams: []
    });
    let nextId = 0;
    ingestUrlIntoRequest(req, "https://api.example.com/users?page=2", () => `p${++nextId}`);
    expect(req.url).toBe("https://api.example.com/users");
    expect(req.queryParams).toEqual([{ id: "p1", key: "page", value: "2", enabled: true }]);
  });
});
