import { beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../types";
import { state } from "../app/state";
import { blankRequest } from "../app/request-utils";
import { COLLECTION_ROOT_PARENT_ID } from "../app/collection-parent";
import {
  createFunctionFromRequestAi,
  createFunctionDraftAi,
  getFunctionAi,
  listFunctionsAi,
  updateFunctionAi
} from "./function-tools";

describe("function AI tools", () => {
  beforeEach(() => {
    Object.assign(state, defaultConfig(), { tabs: {} });
    const request = blankRequest(COLLECTION_ROOT_PARENT_ID);
    request.title = "Example";
    request.method = "GET";
    request.url = "https://example.com/api";
    request.description = "Lists items";
    state.items = [request];
  });

  it("list_functions returns saved functions", () => {
    createFunctionDraftAi({ name: "Fn A", method: "GET", url: "https://a.test" });
    const parsed = JSON.parse(listFunctionsAi()) as { items: Array<{ name: string }> };
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]?.name).toBe("Fn A");
  });

  it("create_function_from_request copies HTTP fields and description", () => {
    const requestId = state.items[0]!.id;
    const result = JSON.parse(
      createFunctionFromRequestAi({ request_id: requestId, name: "From request" })
    ) as { created: boolean; function_id: string };
    expect(result.created).toBe(true);
    const func = state.functions.find((f) => f.id === result.function_id);
    expect(func?.method).toBe("GET");
    expect(func?.url).toBe("https://example.com/api");
    expect(func?.description).toBe("Lists items");
    expect(func?.name).toBe("From request");
  });

  it("get_function redacts auth secrets", () => {
    const created = JSON.parse(
      createFunctionDraftAi({
        name: "Auth fn",
        method: "GET",
        url: "https://example.com"
      })
    ) as { function_id: string };
    const func = state.functions.find((f) => f.id === created.function_id)!;
    func.auth = { type: "bearer", bearerToken: "secret-token" };
    const payload = JSON.parse(getFunctionAi(func.id)) as {
      http_request: { auth: { bearerToken?: string } };
    };
    expect(payload.http_request.auth.bearerToken).toBe("***");
  });

  it("update_function sets description", () => {
    const created = JSON.parse(
      createFunctionDraftAi({ name: "Fn", method: "POST", url: "https://x.test" })
    ) as { function_id: string };
    updateFunctionAi({ function_id: created.function_id, description: "Runs daily sync" });
    const func = state.functions.find((f) => f.id === created.function_id);
    expect(func?.description).toBe("Runs daily sync");
  });

  it("create_function_draft of type ai sets prompt and resets HTTP fields", () => {
    const created = JSON.parse(
      createFunctionDraftAi({
        name: "AI Query",
        function_type: "ai",
        ai_request_prompt: "Calculate age",
        url: "https://should-be-cleared.com"
      })
    ) as { function_id: string };

    const func = state.functions.find((f) => f.id === created.function_id)!;
    expect(func.functionType).toBe("ai");
    expect(func.aiRequestPrompt).toBe("Calculate age");
    expect(func.url).toBe("");
    expect(func.queryParams).toEqual([]);
    expect(func.headers).toEqual([]);
  });

  it("updating function type to ai cleans up HTTP parameters automatically", () => {
    const created = JSON.parse(
      createFunctionDraftAi({ name: "Mixed Fn", method: "POST", url: "https://example.com" })
    ) as { function_id: string };

    const func = state.functions.find((f) => f.id === created.function_id)!;
    expect(func.url).toBe("https://example.com");

    updateFunctionAi({
      function_id: func.id,
      function_type: "ai",
      ai_request_prompt: "Summarize this PDF"
    });

    expect(func.functionType).toBe("ai");
    expect(func.aiRequestPrompt).toBe("Summarize this PDF");
    expect(func.url).toBe("");
    expect(func.method).toBe("GET");
  });

  it("list_functions and get_function serialize AI Request without http_request leaks", () => {
    const created = JSON.parse(
      createFunctionDraftAi({
        name: "Summarizer AI",
        function_type: "ai",
        ai_request_prompt: "Make shorter"
      })
    ) as { function_id: string };

    // list_functions
    const listRes = JSON.parse(listFunctionsAi()) as {
      items: Array<{ name: string; function_type: string; ai_request_prompt?: string; url?: string }>;
    };
    const summarizedItem = listRes.items.find((x) => x.name === "Summarizer AI")!;
    expect(summarizedItem.function_type).toBe("ai");
    expect(summarizedItem.ai_request_prompt).toBe("Make shorter");
    expect(summarizedItem.url).toBeUndefined();

    // get_function
    const detailRes = JSON.parse(getFunctionAi(created.function_id)) as {
      function_type: string;
      ai_request_prompt: string;
      http_request?: any;
    };
    expect(detailRes.function_type).toBe("ai");
    expect(detailRes.ai_request_prompt).toBe("Make shorter");
    expect(detailRes.http_request).toBeUndefined();
  });

  it("create_function_draft of type javascript sets code and resets HTTP fields", () => {
    const created = JSON.parse(
      createFunctionDraftAi({
        name: "Mock JS Generator",
        function_type: "javascript",
        code: "return 'Success';",
        url: "https://should-be-cleared.com"
      })
    ) as { function_id: string };

    const func = state.functions.find((f) => f.id === created.function_id)!;
    expect(func.functionType).toBe("javascript");
    expect(func.code).toBe("return 'Success';");
    expect(func.url).toBe("");
    expect(func.queryParams).toEqual([]);
    expect(func.headers).toEqual([]);
  });

  it("updating function type to javascript cleans up HTTP/AI parameters automatically", () => {
    const created = JSON.parse(
      createFunctionDraftAi({ name: "Mixed JS", method: "POST", url: "https://example.com" })
    ) as { function_id: string };

    const func = state.functions.find((f) => f.id === created.function_id)!;
    expect(func.url).toBe("https://example.com");

    updateFunctionAi({
      function_id: func.id,
      function_type: "javascript",
      code: "return 'Updated';"
    });

    expect(func.functionType).toBe("javascript");
    expect(func.code).toBe("return 'Updated';");
    expect(func.url).toBe("");
    expect(func.method).toBe("GET");
  });

  it("list_functions and get_function serialize JavaScript standalone without leaks", () => {
    const created = JSON.parse(
      createFunctionDraftAi({
        name: "Generator JS",
        function_type: "javascript",
        code: "return 42;"
      })
    ) as { function_id: string };

    // list_functions
    const listRes = JSON.parse(listFunctionsAi()) as {
      items: Array<{ name: string; function_type: string; code?: string; url?: string }>;
    };
    const summarizedItem = listRes.items.find((x) => x.name === "Generator JS")!;
    expect(summarizedItem.function_type).toBe("javascript");
    expect(summarizedItem.code).toBe("return 42;");
    expect(summarizedItem.url).toBeUndefined();

    // get_function
    const detailRes = JSON.parse(getFunctionAi(created.function_id)) as {
      function_type: string;
      code: string;
      http_request?: any;
      ai_request_prompt?: string;
    };
    expect(detailRes.function_type).toBe("javascript");
    expect(detailRes.code).toBe("return 42;");
    expect(detailRes.http_request).toBeUndefined();
    expect(detailRes.ai_request_prompt).toBeUndefined();
  });
});
