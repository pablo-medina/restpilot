import { describe, expect, it } from "vitest";
import {
  applyAuthHeaders,
  buildOutboundHeaders,
  defaultRequestAuth,
  mergeAuthQueryParams,
  normalizeRequestAuth,
  parseAuthFromHeaders,
  resolvedOutboundUrl
} from "./request-auth";
import { encodeBasicCredentials } from "../lib/basic-auth";
import type { Pair, RequestAuth, SavedRequest, Variable } from "../types";

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
    const auth: RequestAuth = { type: "basic", basicMode: "token", basicToken: "{{creds}}" };
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

describe("request-auth — run-time parameters", () => {
  const variables: Variable[] = [{ id: "v1", name: "base_url", value: "https://api.test", enabled: true }];

  function request(overrides: Partial<SavedRequest> = {}): SavedRequest {
    return {
      id: "r1",
      kind: "request",
      parentId: "/",
      title: "Login",
      method: "POST",
      url: "{{base_url}}/u/{{?user}}",
      urlHash: "",
      queryParams: [{ id: "q1", key: "tenant", value: "{{?tenant}}", enabled: true }],
      headers: [{ id: "h1", key: "X-Actor", value: "{{?user}}", enabled: true }],
      bodyMode: "raw",
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

  it("substitutes answers into the outbound URL and query", () => {
    const url = resolvedOutboundUrl(request(), variables, { user: "alice", tenant: "acme" });
    expect(url).toBe("https://api.test/u/alice?tenant=acme");
  });

  it("substitutes answers into manual headers", () => {
    const headers = buildOutboundHeaders(request(), variables, { user: "alice" });
    expect(headers).toEqual([["X-Actor", "alice"]]);
  });

  it("substitutes answers into auth fields", () => {
    const withAuth = request({ auth: { type: "bearer", bearerToken: "{{?jwt}}" } });
    const headers = buildOutboundHeaders(withAuth, variables, { jwt: "abc" });
    expect(headers).toContainEqual(["Authorization", "Bearer abc"]);
  });

  // An enabled query row still goes on the wire with an empty value, exactly as it would for an
  // unresolved variable — what matters is that no `{{?…}}` leaks out.
  it("resolves an unanswered parameter to empty rather than leaving the template on the wire", () => {
    expect(resolvedOutboundUrl(request(), variables, {})).toBe("https://api.test/u/?tenant=");
  });

  it("keeps stored variables working when no answers are given at all", () => {
    const plain = request({ url: "{{base_url}}/ping", queryParams: [], headers: [] });
    expect(resolvedOutboundUrl(plain, variables)).toBe("https://api.test/ping");
  });
});
