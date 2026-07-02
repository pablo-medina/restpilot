import { describe, expect, it } from "vitest";
import type { SavedRequest, Variable } from "../types";
import { applyVariables, displayRequestUrl, resolvedRequestUrl, shouldShowUrlPreview } from "./variables";

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
    url: "${base_url}",
    urlHash: "",
    queryParams: [{ id: "q1", key: "api_key", value: "${token}", enabled: true }],
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
    expect(applyVariables("${base_url}/users", variables)).toBe("https://api.test/users");
  });

  it("leaves unknown names empty", () => {
    expect(applyVariables("${missing}", variables)).toBe("");
  });

  it("ignores disabled variables", () => {
    const disabled = [{ ...variables[0], enabled: false }];
    expect(applyVariables("${base_url}", disabled)).toBe("");
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

describe("displayRequestUrl", () => {
  it("keeps templates in the composed URL", () => {
    expect(displayRequestUrl(sampleRequest())).toBe("${base_url}?api_key=%24%7Btoken%7D");
  });
});
