import { describe, expect, it } from "vitest";
import { looksLikeCurl, normalizeCurlInput, parseCurl, requestToCurl } from "./curl";
import type { SavedRequest } from "./types";

let seq = 0;
const nextId = () => `id-${++seq}`;

describe("looksLikeCurl", () => {
  it("detects curl commands", () => {
    expect(looksLikeCurl("curl https://example.com")).toBe(true);
    expect(looksLikeCurl("  CURL -X POST https://example.com")).toBe(true);
    expect(looksLikeCurl("wget https://example.com")).toBe(false);
  });
});

describe("normalizeCurlInput", () => {
  it("joins Windows caret continuations", () => {
    const input = "curl ^\r\n  https://example.com";
    expect(normalizeCurlInput(input)).toBe("curl https://example.com");
  });
});

describe("parseCurl", () => {
  it("parses method, URL, and headers", () => {
    const parsed = parseCurl(
      'curl -X POST "https://api.example.com/items" -H "Authorization: Bearer x" -H "Content-Type: application/json" --data-raw "{\\"name\\":\\"a\\"}"',
      nextId
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.method).toBe("POST");
    expect(parsed!.url).toBe("https://api.example.com/items");
    expect(parsed!.bodyMode).toBe("raw");
    expect(parsed!.rawType).toBe("json");
    expect(parsed!.headers.some((h) => h.key === "Authorization")).toBe(true);
  });

  it("splits query string into queryParams", () => {
    const parsed = parseCurl("curl https://api.example.com/search?q=rest&limit=10", nextId);
    expect(parsed!.url).toBe("https://api.example.com/search");
    expect(parsed!.queryParams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "q", value: "rest", enabled: true }),
        expect.objectContaining({ key: "limit", value: "10", enabled: true })
      ])
    );
  });

  it("returns null for non-curl input", () => {
    expect(parseCurl("not a command", nextId)).toBeNull();
  });
});

describe("requestToCurl", () => {
  it("includes query params in the URL", () => {
    const request: SavedRequest = {
      id: "r1",
      kind: "request",
      parentId: "/",
      title: "T",
      method: "GET",
      url: "https://api.example.com/items",
      urlHash: "",
      queryParams: [{ id: "q1", key: "page", value: "1", enabled: true }],
      headers: [{ id: "h1", key: "Accept", value: "application/json", enabled: true }],
      bodyMode: "none",
      rawType: "json",
      body: "",
      form: [],
      streamResponse: false,
      auth: { type: "none" },
      lastResponse: null,
      lastError: null
    };
    const curl = requestToCurl(request);
    expect(curl).toContain("https://api.example.com/items?page=1");
    expect(curl).toContain("Accept: application/json");
  });
});
