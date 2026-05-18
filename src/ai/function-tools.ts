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
        "List all saved RestPilot functions (id, name, method, url, has_description). Call when you need function_id or to see what exists.",
      parameters: { type: "object", properties: {}, additionalProperties: false }
    }
  },
  {
    type: "function",
    function: {
      name: "get_function",
      description:
        "Load full function details by id: http_request (method, url, query_params, headers, body, auth redacted), extractor_code (JavaScript run on the response), description, and optional last_http_response preview. Use to explain, draft, or update functions.",
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
        "Create a new HTTP function. Set method, URL, and body when needed. Optionally set description (what it does, for the user and AI) and extractor_code (JavaScript that returns a value from the response).",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string", description: "What this function does (for user and AI)" },
          method: { type: "string" },
          url: { type: "string" },
          body_mode: { type: "string", enum: ["none", "raw", "form"] },
          raw_type: { type: "string", enum: ["json", "text", "xml", "html"] },
          body: {
            description: "Request body as JSON object when applicable",
            oneOf: [{ type: "object" }, { type: "array" }, { type: "string" }]
          },
          extractor_code: { type: "string", description: "JavaScript extractor run against the HTTP response" }
        },
        required: ["name", "method", "url"],
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
        "Update an existing function (name, description, method, url, body, extractor_code). Requires function_id from list_functions or a prior tool result.",
      parameters: {
        type: "object",
        properties: {
          function_id: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          method: { type: "string" },
          url: { type: "string" },
          body_mode: { type: "string", enum: ["none", "raw", "form"] },
          raw_type: { type: "string", enum: ["json", "text", "xml", "html"] },
          body: {
            oneOf: [{ type: "object" }, { type: "array" }, { type: "string" }]
          },
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
    method: func.method,
    url: func.url,
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
  const method = String(args.method ?? "GET").trim().toUpperCase() || "GET";
  const url = String(args.url ?? "").trim();
  const description = String(args.description ?? "").trim();
  const extractorCode =
    args.extractor_code !== undefined ? String(args.extractor_code) : DEFAULT_FUNCTION_EXTRACTOR;

  const func: AppFunction = {
    id: id(),
    name,
    description: description || undefined,
    code: "",
    functionType: "http",
    method,
    url,
    queryParams: [],
    headers: [],
    bodyMode: "none",
    rawType: "json",
    body: "",
    form: [],
    auth: defaultRequestAuth(),
    extractorCode,
    lastHttpResponse: null,
    lastTestResult: null
  };

  const bodyMeta = applyBodyFields(func, args);
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
      has_description: Boolean(func.description),
      ...functionBodySummary(func, bodyMeta)
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
  if (args.method !== undefined) {
    const method = String(args.method).trim().toUpperCase();
    if (method) func.method = method;
  }
  if (args.url !== undefined) func.url = String(args.url).trim();
  if (args.extractor_code !== undefined) func.extractorCode = String(args.extractor_code);

  const bodyMeta = applyBodyFields(func, args);
  notifyFunctionsChanged();

  return JSON.stringify({
    updated: true,
    function_id: func.id,
    name: func.name,
    method: func.method,
    url: func.url,
    has_description: Boolean(func.description),
    ...functionBodySummary(func, bodyMeta)
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
