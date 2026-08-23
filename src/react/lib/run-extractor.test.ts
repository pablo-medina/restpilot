import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { state } from "../../app/state";
import { defaultConfig, type ApiResponse, type SavedRequest } from "../../types";
import { registerExtractorResultDialog } from "./extractor-result-dialog";
import { runRequestExtractor } from "./run-extractor";

vi.mock("../../app/persistence", () => ({ scheduleSave: () => {} }));
vi.mock("../components/Toast", () => ({ pushToast: vi.fn() }));

function response(body: string): ApiResponse {
  return { status: 200, status_text: "OK", duration_ms: 1, headers: [], body, body_is_base64: false, body_size: body.length };
}

function request(extractor?: SavedRequest["extractor"]): SavedRequest {
  return {
    id: "r1",
    kind: "request",
    parentId: "/",
    title: "Login",
    method: "POST",
    url: "https://api.test/auth",
    queryParams: [],
    headers: [],
    bodyMode: "none",
    rawType: "json",
    body: "",
    form: [],
    streamResponse: false,
    auth: { type: "none" },
    extractor,
    lastResponse: null,
    lastError: null
  };
}

let shown: { title: string; value: string; error?: string } | null = null;
let unregister = () => {};

describe("runRequestExtractor", () => {
  beforeEach(() => {
    shown = null;
    unregister = registerExtractorResultDialog((result) => {
      shown = result;
    });
    Object.assign(state, {
      ...defaultConfig(),
      extractors: [
        { id: "x1", name: "Token", code: "return response.body.access_token;", sampleText: "" },
        { id: "x2", name: "Broken", code: "throw new Error('nope');", sampleText: "" }
      ]
    });
  });

  afterEach(() => unregister());

  it("does nothing when the request has no extractor", () => {
    runRequestExtractor(request(), response("{}"));
    expect(shown).toBeNull();
  });

  it("does nothing when no extractor is selected", () => {
    runRequestExtractor(request({ extractorId: "" }), response('{"access_token":"abc"}'));
    expect(shown).toBeNull();
    expect(state.variables).toEqual([]);
  });

  it("stores the value in a global when no environment is active", () => {
    runRequestExtractor(
      request({ extractorId: "x1", variable: "token" }),
      response('{"access_token":"abc"}')
    );
    expect(state.variables).toEqual([{ id: expect.any(String), name: "token", value: "abc", enabled: true }]);
    expect(shown).toBeNull();
  });

  it("stores the value in the active environment when there is one", () => {
    state.environments = [{ id: "e1", name: "Dev", variables: [] }];
    state.activeEnvironmentId = "e1";

    runRequestExtractor(
      request({ extractorId: "x1", variable: "token" }),
      response('{"access_token":"abc"}')
    );

    expect(state.environments[0].variables.map((v) => [v.name, v.value])).toEqual([["token", "abc"]]);
    expect(state.variables).toEqual([]);
  });

  it("shows the result dialog when no variable is given", () => {
    runRequestExtractor(request({ extractorId: "x1" }), response('{"access_token":"abc"}'));
    expect(shown).toEqual({ title: "Token — result", value: "abc" });
  });

  it("treats a blank variable name as no variable", () => {
    runRequestExtractor(
      request({ extractorId: "x1", variable: "   " }),
      response('{"access_token":"abc"}')
    );
    expect(shown?.value).toBe("abc");
    expect(state.variables).toEqual([]);
  });

  it("surfaces a script error in the dialog instead of writing a variable", () => {
    runRequestExtractor(
      request({ extractorId: "x2", variable: "token" }),
      response("{}")
    );
    expect(shown?.error).toBe("nope");
    expect(state.variables).toEqual([]);
  });

  it("does not throw when the assigned extractor was deleted", () => {
    runRequestExtractor(request({ extractorId: "gone", variable: "token" }), response("{}"));
    expect(shown).toBeNull();
    expect(state.variables).toEqual([]);
  });
});
