import { describe, expect, it } from "vitest";
import type { ApiResponse, Extractor, Variable } from "../types";
import {
  applyExtractedVariable,
  defaultExtractor,
  extractorNameProblem,
  findExtractor,
  responseFromSample,
  runExtractor,
  stringifyExtractedValue
} from "./extractors";

function response(body: string, headers: ApiResponse["headers"] = []): ApiResponse {
  return {
    status: 200,
    status_text: "OK",
    duration_ms: 1,
    headers,
    body,
    body_is_base64: false,
    body_size: body.length
  };
}

function extractor(name: string, id = name): Extractor {
  return { ...defaultExtractor(id, name) };
}

describe("runExtractor", () => {
  it("parses a JSON body before handing it to the script", () => {
    const outcome = runExtractor("return response.body.access_token;", response('{"access_token":"abc"}'));
    expect(outcome).toEqual({ success: true, value: "abc" });
  });

  it("leaves a non-JSON body as a string", () => {
    expect(runExtractor("return response.body.toUpperCase();", response("plain"))).toEqual({
      success: true,
      value: "PLAIN"
    });
  });

  it("exposes status and headers", () => {
    const outcome = runExtractor(
      'return `${response.status} ${response.headers["content-type"]}`;',
      response("{}", [["content-type", "application/json"]])
    );
    expect(outcome).toEqual({ success: true, value: "200 application/json" });
  });

  it("joins repeated headers like Headers.get()", () => {
    const outcome = runExtractor(
      'return response.headers["set-cookie"];',
      response("{}", [["set-cookie", "a=1"], ["set-cookie", "b=2"]])
    );
    expect(outcome).toEqual({ success: true, value: "a=1, b=2" });
  });

  it("reports a thrown error instead of propagating it", () => {
    const outcome = runExtractor("throw new Error('boom');", response("{}"));
    expect(outcome).toEqual({ success: false, error: "boom" });
  });

  it("reports a syntax error", () => {
    const outcome = runExtractor("return (;", response("{}"));
    expect(outcome.success).toBe(false);
  });

  it("runs against sample text with no HTTP call", () => {
    const outcome = runExtractor("return response.body.id;", responseFromSample('{"id":7}'));
    expect(outcome).toEqual({ success: true, value: 7 });
  });
});

describe("stringifyExtractedValue", () => {
  it("pretty-prints objects and passes scalars through", () => {
    expect(stringifyExtractedValue({ a: 1 })).toBe('{\n  "a": 1\n}');
    expect(stringifyExtractedValue("abc")).toBe("abc");
    expect(stringifyExtractedValue(7)).toBe("7");
  });

  it("turns nothing into an empty string", () => {
    expect(stringifyExtractedValue(undefined)).toBe("");
    expect(stringifyExtractedValue(null)).toBe("");
  });
});

describe("extractorNameProblem", () => {
  const existing = [extractor("Token", "x1"), extractor("Session", "x2")];

  it("requires a name", () => {
    expect(extractorNameProblem("   ", existing, "x1")).toBe("empty");
  });

  it("rejects a name another extractor already uses, ignoring case", () => {
    expect(extractorNameProblem("session", existing, "x1")).toBe("duplicate");
  });

  it("lets an extractor keep its own name", () => {
    expect(extractorNameProblem("Token", existing, "x1")).toBeNull();
  });

  it("accepts a fresh name", () => {
    expect(extractorNameProblem("Refresh", existing, "x1")).toBeNull();
  });
});

describe("applyExtractedVariable", () => {
  it("creates the variable when it does not exist", () => {
    const list: Variable[] = [];
    expect(applyExtractedVariable(list, "token", "abc", () => "v1")).toEqual({ created: true });
    expect(list).toEqual([{ id: "v1", name: "token", value: "abc", enabled: true }]);
  });

  it("overwrites and re-enables an existing variable", () => {
    const list: Variable[] = [{ id: "v1", name: "token", value: "old", enabled: false }];
    expect(applyExtractedVariable(list, "token", "new", () => "v2")).toEqual({ created: false });
    expect(list).toEqual([{ id: "v1", name: "token", value: "new", enabled: true }]);
  });
});

describe("findExtractor", () => {
  it("returns null for a missing or absent id", () => {
    expect(findExtractor([extractor("Token", "x1")], undefined)).toBeNull();
    expect(findExtractor([extractor("Token", "x1")], "gone")).toBeNull();
  });
});
