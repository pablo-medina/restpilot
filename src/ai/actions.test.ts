import { describe, expect, it, beforeEach } from "vitest";
import { actionsFromToolResult, describeAiToolCall } from "./actions";
import { state } from "../app/state";
import { defaultConfig } from "../types";

describe("actionsFromToolResult", () => {
  beforeEach(() => {
    const config = defaultConfig();
    state.items = config.items;
    state.functions = config.functions;
  });

  it("creates open_request chip after create_request_draft", () => {
    state.items.push({
      id: "req-1",
      kind: "request",
      parentId: "/",
      title: "Health check",
      method: "GET",
      url: "https://api.example.com/health",
      headers: [],
      queryParams: [],
      auth: { type: "none" },
      bodyMode: "none",
      rawType: "json",
      body: "",
      form: [],
      streamResponse: false,
      lastResponse: null,
      lastError: null
    });

    const actions = actionsFromToolResult(
      "create_request_draft",
      JSON.stringify({ title: "Health check", method: "GET" }),
      JSON.stringify({ created: true, request_id: "req-1", title: "Health check" })
    );

    expect(actions).toHaveLength(1);
    expect(actions[0]?.kind).toBe("open_request");
    expect(actions[0]?.targetId).toBe("req-1");
    expect(actions[0]?.label).toContain("Health check");
  });

  it("describeAiToolCall uses display names not raw ids", () => {
    state.items.push({
      id: "req-2",
      kind: "request",
      parentId: "/",
      title: "Login",
      method: "POST",
      url: "/login",
      headers: [],
      queryParams: [],
      auth: { type: "none" },
      bodyMode: "none",
      rawType: "json",
      body: "",
      form: [],
      streamResponse: false,
      lastResponse: null,
      lastError: null
    });

    const text = describeAiToolCall("send_request", JSON.stringify({ request_id: "req-2" }));
    expect(text).toContain("Login");
    expect(text).not.toContain("req-2");
  });
});
