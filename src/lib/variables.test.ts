import { describe, expect, it } from "vitest";
import type { SavedRequest, Variable } from "../types";
import {
  applyVariables,
  displayRequestUrl,
  requestUsesSecretVariables,
  resolvedRequestUrl,
  shouldShowUrlPreview
} from "./variables";

const variables: Variable[] = [
  { id: "1", name: "base_url", value: "https://api.test", enabled: true },
  { id: "2", name: "token", value: "secret", enabled: true }
];

function sampleRequest(): SavedRequest {
  return {
    id: "r1",
    kind: "request",
    parentId: "/",
    title: "Test",
    method: "GET",
    url: "{{base_url}}",
    urlHash: "",
    queryParams: [{ id: "q1", key: "api_key", value: "{{token}}", enabled: true }],
    headers: [],
    bodyMode: "raw",
    rawType: "json",
    body: "",
    form: [],
    streamResponse: false,
    auth: { type: "none" },
    lastResponse: null,
    lastError: null
  };
}

describe("applyVariables", () => {
  it("replaces enabled variables", () => {
    expect(applyVariables("{{base_url}}/users", variables)).toBe("https://api.test/users");
  });

  it("leaves unknown names empty", () => {
    expect(applyVariables("{{missing}}", variables)).toBe("");
  });

  it("ignores disabled variables", () => {
    const disabled = [{ ...variables[0], enabled: false }];
    expect(applyVariables("{{base_url}}", disabled)).toBe("");
  });

  it("resolves `{{?name}}` from the answers", () => {
    expect(applyVariables("{{base_url}}/u/{{?user}}", variables, { user: "bob" })).toBe("https://api.test/u/bob");
  });

  it("lets a parameter and a variable of the same name coexist", () => {
    expect(applyVariables("{{?token}}", variables, { token: "from-prompt" })).toBe("from-prompt");
    expect(applyVariables("{{token}}", variables, { token: "from-prompt" })).toBe("secret");
  });

  it("resolves an unanswered parameter to empty, like an unknown variable", () => {
    expect(applyVariables("[{{?missing}}]", variables)).toBe("[]");
    expect(applyVariables("[{{nosuchvar}}]", variables)).toBe("[]");
  });

  it("substitutes a resolved value verbatim rather than expanding it again", () => {
    expect(applyVariables("{{?raw}}", variables, { raw: "{{base_url}}" })).toBe("{{base_url}}");
  });

  it("leaves a malformed reference in place instead of silently eating it", () => {
    expect(applyVariables("{{ }}", variables)).toBe("{{ }}");
    expect(applyVariables("{{?}}", variables)).toBe("{{?}}");
  });
});

describe("resolvedRequestUrl", () => {
  it("resolves base and query params", () => {
    const url = resolvedRequestUrl(sampleRequest(), variables);
    expect(url).toBe("https://api.test?api_key=secret");
  });
});

describe("shouldShowUrlPreview", () => {
  it("is true when templates are present", () => {
    expect(shouldShowUrlPreview(sampleRequest(), variables)).toBe(true);
  });

  it("is false for a plain URL without templates", () => {
    const request = sampleRequest();
    request.url = "https://api.test";
    request.queryParams = [];
    expect(shouldShowUrlPreview(request, variables)).toBe(false);
  });
});

describe("requestUsesSecretVariables", () => {
  const secrets: Variable[] = [{ id: "s1", name: "api_key", value: "shh", enabled: true, secret: true }];

  it("detects a secret in the GraphQL variables field", () => {
    const request = sampleRequest();
    request.bodyMode = "graphql";
    request.graphqlVariables = '{"key": "{{api_key}}"}';

    expect(requestUsesSecretVariables(request, secrets)).toBe(true);
  });

  it("detects a secret in an auth field", () => {
    const request = sampleRequest();
    request.auth = { type: "bearer", bearerToken: "{{api_key}}" };

    expect(requestUsesSecretVariables(request, secrets)).toBe(true);
  });

  it("is false when no secret is referenced", () => {
    expect(requestUsesSecretVariables(sampleRequest(), secrets)).toBe(false);
  });
});

describe("displayRequestUrl", () => {
  it("keeps templates in the composed URL", () => {
    expect(displayRequestUrl(sampleRequest())).toBe("{{base_url}}?api_key={{token}}");
  });
});
