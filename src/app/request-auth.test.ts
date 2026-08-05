import { describe, expect, it } from "vitest";
import {
  applyAuthHeaders,
  defaultRequestAuth,
  mergeAuthQueryParams,
  normalizeRequestAuth,
  parseAuthFromHeaders
} from "./request-auth";
import { encodeBasicCredentials } from "../lib/basic-auth";
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

  it("defaults basic auth to the credentials input mode", () => {
    expect(normalizeRequestAuth({ type: "basic", basicUsername: "alice" }).basicMode).toBe("credentials");
  });

  it("encodes username and password as base64 credentials", () => {
    const auth: RequestAuth = { type: "basic", basicUsername: "alice", basicPassword: "secret" };
    expect(applyAuthHeaders([], auth, [])).toEqual([["Authorization", "Basic YWxpY2U6c2VjcmV0"]]);
  });

  it("encodes non-ASCII credentials as UTF-8 instead of throwing", () => {
    const auth: RequestAuth = { type: "basic", basicUsername: "alice", basicPassword: "contraseña" };
    const headers = applyAuthHeaders([], auth, []);
    expect(headers[0]?.[1]).toBe(`Basic ${encodeBasicCredentials("alice", "contraseña")}`);
    expect(headers[0]?.[1]).toBe("Basic YWxpY2U6Y29udHJhc2XDsWE=");
  });

  it("sends a pre-encoded base64 token verbatim", () => {
    const auth: RequestAuth = { type: "basic", basicMode: "token", basicToken: "YWxpY2U6c2VjcmV0" };
    expect(applyAuthHeaders([], auth, [])).toEqual([["Authorization", "Basic YWxpY2U6c2VjcmV0"]]);
  });

  it("strips whitespace from a pasted base64 token", () => {
    const auth: RequestAuth = { type: "basic", basicMode: "token", basicToken: "YWxpY2U6\n c2VjcmV0 " };
    expect(applyAuthHeaders([], auth, [])).toEqual([["Authorization", "Basic YWxpY2U6c2VjcmV0"]]);
  });

  it("ignores credential fields while in token mode", () => {
    const auth: RequestAuth = {
      type: "basic",
      basicMode: "token",
      basicUsername: "alice",
      basicPassword: "secret",
      basicToken: ""
    };
    expect(applyAuthHeaders([], auth, [])).toEqual([]);
  });

  it("resolves variables inside a base64 token", () => {
    const auth: RequestAuth = { type: "basic", basicMode: "token", basicToken: "${creds}" };
    const headers = applyAuthHeaders([], auth, [
      { id: "1", name: "creds", value: "YWxpY2U6c2VjcmV0", enabled: true }
    ]);
    expect(headers).toEqual([["Authorization", "Basic YWxpY2U6c2VjcmV0"]]);
  });

  it("parses a basic authorization header back into credentials", () => {
    const headers: Pair[] = [
      { id: "1", key: "Authorization", value: "Basic YWxpY2U6c2VjcmV0", enabled: true }
    ];
    const { auth } = parseAuthFromHeaders(headers);
    expect(auth).toMatchObject({
      type: "basic",
      basicMode: "credentials",
      basicUsername: "alice",
      basicPassword: "secret"
    });
  });

  it("keeps an undecodable basic header as an opaque token instead of dropping it", () => {
    const headers: Pair[] = [
      { id: "1", key: "Authorization", value: "Basic not-base-64!!", enabled: true }
    ];
    const { auth, headers: rest } = parseAuthFromHeaders(headers);
    expect(auth).toMatchObject({ type: "basic", basicMode: "token", basicToken: "not-base-64!!" });
    expect(rest).toHaveLength(0);
  });
});
