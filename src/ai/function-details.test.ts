import { describe, expect, it } from "vitest";
import { defaultConfig } from "../types";
import { state } from "../app/state";
import { functionDetailsPayload } from "./function-details";

describe("functionDetailsPayload", () => {
  it("structures http_request and extractor_code", () => {
    Object.assign(state, defaultConfig(), { tabs: {} });
    state.functions.push({
      id: "f1",
      name: "Test",
      code: "",
      functionType: "http",
      method: "GET",
      url: "https://example.com",
      queryParams: [],
      headers: [],
      bodyMode: "none",
      rawType: "json",
      body: "",
      form: [],
      auth: { type: "none" },
      extractorCode: "return 1;",
      lastHttpResponse: null,
      lastTestResult: null
    });
    const func = state.functions[0]!;
    func.description = "Gets a todo";
    func.queryParams = [{ id: "1", key: "q", value: "1", enabled: true }];
    func.extractorCode = "return response.body.id;";

    const payload = functionDetailsPayload(func) as {
      http_request: { method: string; query_params: Array<{ key: string }> };
      extractor_code: string;
      description: string;
    };

    expect(payload.description).toBe("Gets a todo");
    expect(payload.http_request.method).toBe(func.method);
    expect(payload.http_request.query_params).toEqual([{ key: "q", value: "1" }]);
    expect(payload.extractor_code).toBe("return response.body.id;");
  });
});
