import { describe, expect, it } from "vitest";
import type { SavedRequest } from "../types";
import { collectParameterNames, requestParameterNames } from "./parameters";

function loginRequest(): SavedRequest {
  return {
    id: "r1",
    kind: "request",
    parentId: "/",
    title: "Login",
    method: "POST",
    url: "{{base_url}}/auth/{{?tenant}}",
    queryParams: [{ id: "q1", key: "trace", value: "{{?trace}}", enabled: true }],
    headers: [],
    bodyMode: "raw",
    rawType: "json",
    body: '{"username": "{{?username}}", "password": "{{?password}}"}',
    form: [],
    streamResponse: false,
    auth: { type: "bearer", bearerToken: "{{?bootstrap}}" },
    lastResponse: null,
    lastError: null
  };
}

describe("collectParameterNames", () => {
  it("picks up `{{?name}}` and ignores plain variables", () => {
    expect([...collectParameterNames("{{base_url}}/u/{{?user}}")]).toEqual(["user"]);
  });

  it("tolerates whitespace around the sigil and the name", () => {
    expect([...collectParameterNames("{{ ? user }}")]).toEqual(["user"]);
  });

  it("ignores a sigil with no name", () => {
    expect([...collectParameterNames("{{?}}")]).toEqual([]);
  });

  it("deduplicates repeated references", () => {
    expect([...collectParameterNames("{{?a}}/{{?a}}")]).toEqual(["a"]);
  });
});

describe("requestParameterNames", () => {
  it("reaches every templated field, auth included, ordered by first appearance", () => {
    expect(requestParameterNames(loginRequest())).toEqual([
      "tenant",
      "username",
      "password",
      "trace",
      "bootstrap"
    ]);
  });

  it("is empty for a request that escapes nothing", () => {
    const plain = loginRequest();
    plain.url = "https://api.test/ping";
    plain.body = "";
    plain.queryParams = [];
    plain.auth = { type: "none" };

    expect(requestParameterNames(plain)).toEqual([]);
  });
});
