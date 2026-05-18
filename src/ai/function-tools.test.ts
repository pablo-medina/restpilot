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
});
