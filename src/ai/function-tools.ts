import { defaultRequestAuth } from "../app/request-auth";
import {
  DEFAULT_FUNCTION_EXTRACTOR,
  functionFromRequest
} from "../app/request-function-copy";
import { scheduleSave } from "../app/persistence";
import { render } from "../app/render";
import { getItem, id, state } from "../app/state";
import { functionDetailsPayload } from "./function-details";
import { normalizeRequestBodyArg, type NormalizeRequestBodyResult } from "../json-request-body";
import type { AppFunction, BodyMode, RawType } from "../types";

export const FUNCTION_AI_TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "list_functions",
      description:
        "List all saved RestPilot functions (id, name, function_type, method/url/ai_request_prompt, has_description). Call when you need function_id or to see what exists.",
      parameters: { type: "object", properties: {}, additionalProperties: false }
    }
  },
  {
    type: "function",
    function: {
      name: "get_function",
      description:
        "Load full function details by id: function_type ('http' or 'ai'), description, and either ai_request_prompt (for AI direct requests) or http_request configuration with extractor_type ('javascript' or 'ai') and extractor_prompt/extractor_code. Use to explain, draft, or update functions.",
      parameters: {
        type: "object",
        properties: { function_id: { type: "string", description: "Function id" } },
        required: ["function_id"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_function_draft",
      description:
        "Create a new HTTP request function or direct AI Request function. Set function_type to 'ai' for direct AI JSON requests (set ai_request_prompt), or 'http' for HTTP requests (which can use a 'javascript' or 'ai' extractor_type).",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string", description: "What this function does (for user and AI)" },
          function_type: { type: "string", enum: ["http", "ai", "javascript"], description: "Whether this is a standard HTTP request function, a direct AI Request function, or a standalone JavaScript function" },
          ai_request_prompt: { type: "string", description: "Prompt for direct AI Request function (if function_type is 'ai')" },
          code: { type: "string", description: "The standalone JavaScript code to run (if function_type is 'javascript')" },
          method: { type: "string" },
          url: { type: "string" },
          body_mode: { type: "string", enum: ["none", "raw", "form"] },
          raw_type: { type: "string", enum: ["json", "text", "xml", "html"] },
          body: {
            description: "Request body as JSON object when applicable",
            oneOf: [{ type: "object" }, { type: "array" }, { type: "string" }]
          },
          extractor_type: { type: "string", enum: ["javascript", "ai"], description: "For HTTP function, whether the response extraction script is standard JavaScript or an AI extractor prompt" },
          extractor_prompt: { type: "string", description: "The prompt for the AI extractor (if extractor_type is 'ai')" },
          extractor_code: { type: "string", description: "JavaScript extractor run against the HTTP response (if extractor_type is 'javascript')" }
        },
        required: ["name"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_function_from_request",
      description:
        "Create a new function by copying HTTP configuration from an existing saved request (method, url, params, headers, body, auth). Optionally set name, description, and extractor_code.",
      parameters: {
        type: "object",
        properties: {
          request_id: { type: "string", description: "Saved request id to copy from" },
          name: { type: "string" },
          description: { type: "string" },
          extractor_code: { type: "string" }
        },
        required: ["request_id"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_function",
      description:
        "Update an existing function (name, description, function_type, ai_request_prompt, method, url, body, extractor_type, extractor_prompt, extractor_code). Requires function_id.",
      parameters: {
        type: "object",
        properties: {
          function_id: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          function_type: { type: "string", enum: ["http", "ai", "javascript"] },
          ai_request_prompt: { type: "string" },
          code: { type: "string", description: "The standalone JavaScript code to run (if function_type is 'javascript')" },
          method: { type: "string" },
          url: { type: "string" },
          body_mode: { type: "string", enum: ["none", "raw", "form"] },
          raw_type: { type: "string", enum: ["json", "text", "xml", "html"] },
          body: {
            oneOf: [{ type: "object" }, { type: "array" }, { type: "string" }]
          },
          extractor_type: { type: "string", enum: ["javascript", "ai"] },
          extractor_prompt: { type: "string" },
          extractor_code: { type: "string" }
        },
        required: ["function_id"],
        additionalProperties: false
      }
    }
  }
] as const;

function notifyFunctionsChanged(): void {
  scheduleSave();
  render();
}

function normalizeBodyMode(value: unknown): BodyMode {
  const mode = String(value ?? "").toLowerCase();
  if (mode === "none" || mode === "form") return mode;
  return "raw";
}

function normalizeRawType(value: unknown): RawType {
  const raw = String(value ?? "").toLowerCase();
  if (raw === "json" || raw === "xml" || raw === "html") return raw;
  return "text";
}

function applyBodyFields(
  func: AppFunction,
  args: Record<string, unknown>
): NormalizeRequestBodyResult | null {
  if (args.body_mode !== undefined) func.bodyMode = normalizeBodyMode(args.body_mode);
  if (args.raw_type !== undefined) func.rawType = normalizeRawType(args.raw_type);
  if (args.body === undefined) return null;

  const normalized = normalizeRequestBodyArg(args.body, func.rawType);
  func.body = normalized.body;
  if (func.body.trim() && func.bodyMode === "none") {
    func.bodyMode = "raw";
  }
  if (
    func.body.trim() &&
    func.rawType !== "json" &&
    typeof args.body === "object" &&
    args.body !== null
  ) {
    func.rawType = "json";
  }
  return normalized;
}

function functionBodySummary(func: AppFunction, bodyMeta?: NormalizeRequestBodyResult | null) {
  const summary: Record<string, unknown> = {
    body_mode: func.bodyMode,
    has_body: func.bodyMode !== "none" && Boolean(func.body.trim())
  };
  if (bodyMeta?.repaired) summary.body_json_repaired = true;
  if (bodyMeta && !bodyMeta.valid) {
    summary.body_json_valid = false;
    summary.body_json_error = "Body is not valid JSON.";
  }
  return summary;
}

export function listFunctionsAi(): string {
  const items = state.functions.map((func) => ({
    id: func.id,
    name: func.name,
    function_type: func.functionType ?? "http",
    ...(func.functionType === "ai"
      ? { ai_request_prompt: func.aiRequestPrompt || "" }
      : func.functionType === "javascript"
      ? { code: func.code || "" }
      : { method: func.method, url: func.url }),
    has_description: Boolean(func.description?.trim())
  }));
  return JSON.stringify({ items }, null, 2);
}

export function getFunctionAi(functionId: string): string {
  const func = state.functions.find((f) => f.id === functionId);
  if (!func) {
    return JSON.stringify({ error: `Function not found: ${functionId}` });
  }
  return JSON.stringify(functionDetailsPayload(func), null, 2);
}

export function createFunctionDraftAi(args: Record<string, unknown>): string {
  const name = String(args.name ?? "New function").trim() || "New function";
  const functionType = (args.function_type as "http" | "ai" | "javascript") || "http";
  const aiRequestPrompt = String(args.ai_request_prompt ?? "");
  const code = String(args.code ?? "");
  const method = String(args.method ?? "GET").trim().toUpperCase() || "GET";
  const url = String(args.url ?? "").trim();
  const description = String(args.description ?? "").trim();
  const extractorType = (args.extractor_type as "javascript" | "ai") || "javascript";
  const extractorPrompt = String(args.extractor_prompt ?? "");
  const extractorCode =
    args.extractor_code !== undefined ? String(args.extractor_code) : DEFAULT_FUNCTION_EXTRACTOR;

  const func: AppFunction = {
    id: id(),
    name,
    description: description || undefined,
    code,
    functionType,
    aiRequestPrompt,
    method,
    url,
    queryParams: [],
    headers: [],
    bodyMode: "none",
    rawType: "json",
    body: "",
    form: [],
    auth: defaultRequestAuth(),
    extractorType,
    extractorPrompt,
    extractorCode,
    lastHttpResponse: null,
    lastTestResult: null
  };

  const bodyMeta = applyBodyFields(func, args);

  // Apply clean default rules to avoid stale data!
  if (functionType === "ai") {
    func.method = "GET";
    func.url = "";
    func.queryParams = [];
    func.headers = [];
    func.bodyMode = "none";
    func.body = "";
    func.form = [];
    func.auth = { type: "none" };
    func.extractorCode = DEFAULT_FUNCTION_EXTRACTOR;
    func.extractorPrompt = "";
    func.lastHttpResponse = null;
    func.code = "";
  } else if (functionType === "javascript") {
    func.method = "GET";
    func.url = "";
    func.queryParams = [];
    func.headers = [];
    func.bodyMode = "none";
    func.body = "";
    func.form = [];
    func.auth = { type: "none" };
    func.extractorCode = DEFAULT_FUNCTION_EXTRACTOR;
    func.extractorPrompt = "";
    func.lastHttpResponse = null;
    func.aiRequestPrompt = "";
    if (!func.code.trim()) {
      func.code = `// Standalone JavaScript Function\n// Return the result of the execution\nconst items = ["Apple", "Banana", "Cherry"];\nconst randomItem = items[Math.floor(Math.random() * items.length)];\nreturn randomItem;\n`;
    }
  } else {
    func.aiRequestPrompt = "";
    func.code = "";
    if (extractorType === "ai") {
      func.extractorCode = DEFAULT_FUNCTION_EXTRACTOR;
    } else {
      func.extractorPrompt = "";
    }
  }

  state.functions.push(func);
  state.activeFunctionId = func.id;
  notifyFunctionsChanged();

  return JSON.stringify(
    {
      created: true,
      function_id: func.id,
      name: func.name,
      function_type: func.functionType,
      has_description: Boolean(func.description),
      ...(func.functionType === "ai"
        ? { ai_request_prompt: func.aiRequestPrompt }
        : func.functionType === "javascript"
        ? { code: func.code }
        : { method: func.method, url: func.url, ...functionBodySummary(func, bodyMeta) })
    },
    null,
    2
  );
}

export function createFunctionFromRequestAi(args: Record<string, unknown>): string {
  const requestId = String(args.request_id ?? "").trim();
  const item = getItem(requestId);
  if (!item || item.kind !== "request") {
    return JSON.stringify({ error: `Request not found: ${requestId}` });
  }

  const name = args.name !== undefined ? String(args.name).trim() : "";
  const description = args.description !== undefined ? String(args.description).trim() : "";
  const extractorCode =
    args.extractor_code !== undefined ? String(args.extractor_code) : undefined;

  const func = functionFromRequest(item, {
    name: name || undefined,
    description: description || item.description,
    extractorCode
  });

  state.functions.push(func);
  state.activeFunctionId = func.id;
  notifyFunctionsChanged();

  return JSON.stringify(
    {
      created: true,
      function_id: func.id,
      name: func.name,
      method: func.method,
      url: func.url,
      copied_from_request_id: requestId,
      has_description: Boolean(func.description)
    },
    null,
    2
  );
}

export function updateFunctionAi(args: Record<string, unknown>): string {
  const functionId = String(args.function_id ?? "").trim();
  const func = state.functions.find((f) => f.id === functionId);
  if (!func) {
    return JSON.stringify({ error: `Function not found: ${functionId}` });
  }

  if (args.name !== undefined) {
    const name = String(args.name).trim();
    if (name) func.name = name;
  }
  if (args.description !== undefined) {
    const description = String(args.description).trim();
    func.description = description || undefined;
  }
  if (args.function_type !== undefined) {
    func.functionType = args.function_type as "http" | "ai" | "javascript";
  }
  if (args.code !== undefined) {
    func.code = String(args.code);
  }
  if (args.ai_request_prompt !== undefined) {
    func.aiRequestPrompt = String(args.ai_request_prompt);
  }
  if (args.method !== undefined) {
    const method = String(args.method).trim().toUpperCase();
    if (method) func.method = method;
  }
  if (args.url !== undefined) func.url = String(args.url).trim();
  if (args.extractor_type !== undefined) {
    func.extractorType = args.extractor_type as "javascript" | "ai";
  }
  if (args.extractor_prompt !== undefined) {
    func.extractorPrompt = String(args.extractor_prompt);
  }
  if (args.extractor_code !== undefined) {
    func.extractorCode = String(args.extractor_code);
  }

  const bodyMeta = applyBodyFields(func, args);

  // Apply clean default rules to avoid stale data!
  if (func.functionType === "ai") {
    func.method = "GET";
    func.url = "";
    func.queryParams = [];
    func.headers = [];
    func.bodyMode = "none";
    func.body = "";
    func.form = [];
    func.auth = { type: "none" };
    func.extractorCode = DEFAULT_FUNCTION_EXTRACTOR;
    func.extractorPrompt = "";
    func.lastHttpResponse = null;
    func.code = "";
  } else if (func.functionType === "javascript") {
    func.method = "GET";
    func.url = "";
    func.queryParams = [];
    func.headers = [];
    func.bodyMode = "none";
    func.body = "";
    func.form = [];
    func.auth = { type: "none" };
    func.extractorCode = DEFAULT_FUNCTION_EXTRACTOR;
    func.extractorPrompt = "";
    func.lastHttpResponse = null;
    func.aiRequestPrompt = "";
    if (!func.code.trim()) {
      func.code = `// Standalone JavaScript Function\n// Return the result of the execution\nconst items = ["Apple", "Banana", "Cherry"];\nconst randomItem = items[Math.floor(Math.random() * items.length)];\nreturn randomItem;\n`;
    }
  } else {
    func.aiRequestPrompt = "";
    func.code = "";
    if (func.extractorType === "ai") {
      func.extractorCode = DEFAULT_FUNCTION_EXTRACTOR;
    } else {
      func.extractorPrompt = "";
    }
  }

  notifyFunctionsChanged();

  return JSON.stringify({
    updated: true,
    function_id: func.id,
    name: func.name,
    function_type: func.functionType,
    has_description: Boolean(func.description),
    ...(func.functionType === "ai"
      ? { ai_request_prompt: func.aiRequestPrompt }
      : func.functionType === "javascript"
      ? { code: func.code }
      : { method: func.method, url: func.url, ...functionBodySummary(func, bodyMeta) })
  });
}

export function executeFunctionAiTool(name: string, args: Record<string, unknown>): string | null {
  switch (name) {
    case "list_functions":
      return listFunctionsAi();
    case "get_function":
      return getFunctionAi(String(args.function_id ?? ""));
    case "create_function_draft":
      return createFunctionDraftAi(args);
    case "create_function_from_request":
      return createFunctionFromRequestAi(args);
    case "update_function":
      return updateFunctionAi(args);
    default:
      return null;
  }
}
