import { describe, expect, it } from "vitest";
import { renderAuthPanel } from "./request-auth-panel";
import type { SavedRequest } from "./types";

function requestWithAuth(auth: SavedRequest["auth"]): SavedRequest {
  return {
    id: "r1",
    parentId: "/",
    kind: "request",
    title: "Test",
    method: "GET",
    url: "https://example.com",
    queryParams: [],
    headers: [],
    bodyMode: "none",
    rawType: "text",
    body: "",
    form: [],
    auth,
    streamResponse: false,
    lastResponse: null,
    lastError: null
  };
}

describe("renderAuthPanel", () => {
  it("shows only the bearer fields when bearer is selected", () => {
    const html = renderAuthPanel(requestWithAuth({ type: "bearer", bearerToken: "x" }));
    expect(html).toContain('class="auth-fields" data-auth-panel="bearer"');
    expect(html).toContain('class="auth-fields is-hidden" data-auth-panel="basic"');
    expect(html).toContain('class="auth-fields is-hidden" data-auth-panel="apikey"');
  });

  it("hides all auth field groups when type is none", () => {
    const html = renderAuthPanel(requestWithAuth({ type: "none" }));
    expect(html).toContain('class="auth-fields is-hidden" data-auth-panel="bearer"');
    expect(html).toContain('class="auth-fields is-hidden" data-auth-panel="basic"');
    expect(html).toContain('class="auth-fields is-hidden" data-auth-panel="apikey"');
  });
});
