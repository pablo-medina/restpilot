import { describe, expect, it } from "vitest";
import { blankRequest } from "./request-utils";
import { COLLECTION_ROOT_PARENT_ID } from "./collection-parent";
import { applyRequestToFunction, functionFromRequest } from "./request-function-copy";
import type { AppFunction } from "../types";

function minimalFunction(): AppFunction {
  return functionFromRequest(blankRequest(COLLECTION_ROOT_PARENT_ID));
}

describe("request-function-copy", () => {
  it("functionFromRequest clones pairs with new ids", () => {
    const request = blankRequest(COLLECTION_ROOT_PARENT_ID);
    request.queryParams = [{ id: "p1", key: "q", value: "1", enabled: true }];
    const func = functionFromRequest(request);
    expect(func.queryParams).toHaveLength(1);
    expect(func.queryParams[0]?.id).not.toBe("p1");
    expect(func.queryParams[0]?.key).toBe("q");
  });

  it("applyRequestToFunction replaces HTTP configuration", () => {
    const request = blankRequest(COLLECTION_ROOT_PARENT_ID);
    request.method = "POST";
    request.url = "https://api.example.com/items";
    request.body = '{"ok":true}';
    request.bodyMode = "raw";
    const func = minimalFunction();
    applyRequestToFunction(func, request);
    expect(func.method).toBe("POST");
    expect(func.url).toBe("https://api.example.com/items");
    expect(func.body).toBe('{"ok":true}');
    expect(func.lastTestResult).toBeNull();
  });
});
