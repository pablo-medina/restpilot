import { describe, expect, it } from "vitest";
import { applyAuthHeaders, defaultRequestAuth, mergeAuthQueryParams, parseAuthFromHeaders } from "./request-auth";
import type { Pair, RequestAuth } from "../types";

describe("request-auth", () => {
  it("parses bearer authorization headers", () => {
    const headers: Pair[] = [
      { id: "1", key: "Authorization", value: "Bearer abc123", enabled: true }
    ];
    const { auth, headers: rest } = parseAuthFromHeaders(headers);
    expect(auth.type).toBe("bearer");
    expect(auth.bearerToken).toBe("abc123");
    expect(rest).toHaveLength(0);
  });

  it("applies bearer auth to outbound headers", () => {
    const auth: RequestAuth = { type: "bearer", bearerToken: "token" };
    const headers = applyAuthHeaders([], auth, []);
    expect(headers).toEqual([["Authorization", "Bearer token"]]);
  });

  it("preserves duplicate custom headers instead of collapsing them", () => {
    const auth: RequestAuth = { type: "none" };
    const headers = applyAuthHeaders(
      [
        ["Accept", "application/json"],
        ["Accept", "text/plain"]
      ],
      auth,
      []
    );
    expect(headers).toEqual([
      ["Accept", "application/json"],
      ["Accept", "text/plain"]
    ]);
  });

  it("replaces only the previous Authorization header when auth changes", () => {
    const auth: RequestAuth = { type: "bearer", bearerToken: "new" };
    const headers = applyAuthHeaders([["Authorization", "Bearer old"]], auth, []);
    expect(headers).toEqual([["Authorization", "Bearer new"]]);
  });

  it("merges api key query parameters", () => {
    const auth: RequestAuth = {
      type: "apikey",
      apiKeyName: "api_key",
      apiKeyValue: "secret",
      apiKeyIn: "query"
    };
    const merged = mergeAuthQueryParams([], auth, []);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.key).toBe("api_key");
    expect(merged[0]?.value).toBe("secret");
  });

  it("defaults to none", () => {
    expect(defaultRequestAuth().type).toBe("none");
  });
});
