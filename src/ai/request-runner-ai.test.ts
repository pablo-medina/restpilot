import { beforeEach, describe, expect, it, vi } from "vitest";
import { state } from "../app/state";
import { defaultConfig } from "../types";
import { runFunctionById } from "./request-runner";
import * as standaloneCompletion from "./standalone-completion";
import { invoke } from "@tauri-apps/api/core";

// Mock @tauri-apps/api/core
vi.mock("@tauri-apps/api/core", () => {
  return {
    invoke: vi.fn()
  };
});

// Mock standalone completion
vi.mock("./standalone-completion", async () => {
  return {
    requestStandaloneAiCompletion: vi.fn()
  };
});

// Mock persistence and render to avoid saving to file/DOM
vi.mock("../app/persistence", () => ({
  scheduleSave: vi.fn(),
  httpTransportPayload: vi.fn(() => ({ proxy: null, network: null })),
  persistConfig: vi.fn()
}));

describe("runFunctionById with AI request/extractor", () => {
  beforeEach(() => {
    Object.assign(state, defaultConfig(), { tabs: {}, functions: [] });
    vi.clearAllMocks();
  });

  it("handles AI Request type with valid JSON outcome", async () => {
    const mockCompletion = vi.spyOn(standaloneCompletion, "requestStandaloneAiCompletion");
    mockCompletion.mockResolvedValue({
      ok: true,
      content: '{"result": "success", "status": "completed"}'
    });

    state.functions = [
      {
        id: "fn-1",
        name: "Direct AI request",
        description: "Direct direct",
        functionType: "ai",
        code: "",
        method: "GET",
        url: "https://api.test",
        queryParams: [],
        headers: [],
        bodyMode: "none",
        rawType: "text",
        body: "",
        form: [],
        auth: { type: "none" },
        extractorType: "javascript",
        extractorCode: "",
        extractorPrompt: "",
        aiRequestPrompt: "Write a JSON outcome of the job status",
        lastHttpResponse: null,
        lastTestResult: null
      }
    ];

    const result = await runFunctionById("fn-1");
    const parsed = JSON.parse(result);
    expect(parsed.extracted).toEqual({ result: "success", status: "completed" });
    expect(mockCompletion).toHaveBeenCalledTimes(1);
    expect(mockCompletion.mock.calls[0]?.[0]?.[1]?.content).toBe("Write a JSON outcome of the job status");
  });

  it("handles AI Request type with fallback code blocks", async () => {
    const mockCompletion = vi.spyOn(standaloneCompletion, "requestStandaloneAiCompletion");
    mockCompletion.mockResolvedValue({
      ok: true,
      content: '```json\n{"fallback": true}\n```'
    });

    state.functions = [
      {
        id: "fn-2",
        name: "Direct AI markdown block",
        description: "Markdown response fallback test",
        functionType: "ai",
        code: "",
        method: "GET",
        url: "https://api.test",
        queryParams: [],
        headers: [],
        bodyMode: "none",
        rawType: "text",
        body: "",
        form: [],
        auth: { type: "none" },
        extractorType: "javascript",
        extractorCode: "",
        extractorPrompt: "",
        aiRequestPrompt: "Job status",
        lastHttpResponse: null,
        lastTestResult: null
      }
    ];

    const result = await runFunctionById("fn-2");
    const parsed = JSON.parse(result);
    expect(parsed.extracted).toEqual({ fallback: true });
  });

  it("handles HTTP with AI Extractor", async () => {
    const mockCompletion = vi.spyOn(standaloneCompletion, "requestStandaloneAiCompletion");
    mockCompletion.mockResolvedValue({
      ok: true,
      content: '{"extracted_key": "some_value"}'
    });

    const mockInvoke = vi.mocked(invoke);
    mockInvoke.mockResolvedValue({
      status: 200,
      status_text: "OK",
      duration_ms: 120,
      headers: { "content-type": "application/json" },
      body: '{"foo": "bar"}'
    });

    state.functions = [
      {
        id: "fn-3",
        name: "HTTP with AI Extractor",
        description: "Extract using prompt from HTTP response",
        functionType: "http",
        code: "",
        method: "GET",
        url: "https://api.test",
        queryParams: [],
        headers: [],
        bodyMode: "none",
        rawType: "text",
        body: "",
        form: [],
        auth: { type: "none" },
        extractorType: "ai",
        extractorCode: "",
        extractorPrompt: "Get the extracted_key field",
        aiRequestPrompt: "",
        lastHttpResponse: null,
        lastTestResult: null
      }
    ];

    const result = await runFunctionById("fn-3");
    const parsed = JSON.parse(result);

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockCompletion).toHaveBeenCalledTimes(1);
    expect(parsed.extracted).toEqual({ extracted_key: "some_value" });
    expect(parsed.http.status).toBe(200);
    expect(parsed.http.body).toBe('{"foo": "bar"}');
  });

  it("handles standalone javascript evaluation correctly", async () => {
    state.functions = [
      {
        id: "fn-js-4",
        name: "JS Standalone test",
        description: "Executes raw JS",
        functionType: "javascript",
        code: "const x = 10; const y = 20; return x + y;",
        method: "GET",
        url: "",
        queryParams: [],
        headers: [],
        bodyMode: "none",
        rawType: "text",
        body: "",
        form: [],
        auth: { type: "none" },
        extractorType: "javascript",
        extractorCode: "",
        extractorPrompt: "",
        aiRequestPrompt: "",
        lastHttpResponse: null,
        lastTestResult: null
      }
    ];

    const result = await runFunctionById("fn-js-4");
    const parsed = JSON.parse(result) as { extracted: number };
    expect(parsed.extracted).toBe(30);
  });
});
