import { invoke } from "@tauri-apps/api/core";
import { applyVariables } from "../variables";
import { getEffectiveVariables } from "../app/environments";
import { httpTransportPayload } from "../app/persistence";
import { resolvedOutboundUrl } from "../app/request-auth";
import {
  buildFormPayload,
  buildRequestHeaders,
  withContentType
} from "../app/request-utils";
import { getItem, id, state } from "../app/state";
import type { ApiResponse, AppFunction, SavedRequest } from "../types";
import { requestStandaloneAiCompletion } from "./standalone-completion";

const MAX_BODY_CHARS = 12_000;

function truncate(text: string, max = MAX_BODY_CHARS): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…(truncated)`;
}

function formatResponse(response: ApiResponse): string {
  const headerLines = Object.entries(response.headers)
    .slice(0, 40)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  return JSON.stringify(
    {
      status: response.status,
      status_text: response.status_text,
      duration_ms: response.duration_ms,
      headers: headerLines,
      body: truncate(response.body)
    },
    null,
    2
  );
}

function savedRequestFromFunction(func: AppFunction): SavedRequest {
  return {
    id: func.id,
    kind: "request",
    parentId: "/",
    title: func.name,
    method: func.method,
    url: func.url,
    queryParams: func.queryParams,
    headers: func.headers,
    bodyMode: func.bodyMode,
    rawType: func.rawType,
    body: func.body,
    form: func.form,
    binaryFilePath: func.binaryFilePath,
    graphqlVariables: func.graphqlVariables,
    streamResponse: false,
    auth: func.auth,
    lastResponse: null,
    lastError: null
  };
}

async function dispatchRequest(request: SavedRequest): Promise<string> {
  const runId = id();
  const effectiveVariables = getEffectiveVariables();
  const headers = withContentType(request, buildRequestHeaders(request));

  let body = "";
  if (request.bodyMode === "raw") {
    body = applyVariables(request.body, effectiveVariables);
  } else if (request.bodyMode === "graphql") {
    const query = applyVariables(request.body, effectiveVariables);
    let variables: Record<string, unknown> = {};
    if (request.graphqlVariables) {
      try {
        variables = JSON.parse(applyVariables(request.graphqlVariables, effectiveVariables));
      } catch { /* send as-is */ }
    }
    body = JSON.stringify({ query, variables });
  } else if (request.bodyMode === "binary" && request.binaryFilePath) {
    try {
      const { readFile } = await import("@tauri-apps/plugin-fs");
      const fileBytes = await readFile(request.binaryFilePath);
      let binaryStr = "";
      for (let i = 0; i < fileBytes.length; i++) {
        binaryStr += String.fromCharCode(fileBytes[i]);
      }
      body = btoa(binaryStr);
    } catch {
      return JSON.stringify({ error: "Failed to read binary file: " + request.binaryFilePath }, null, 2);
    }
  }

  const payload = {
    request: {
      id: runId,
      method: request.method,
      url: resolvedOutboundUrl(request, effectiveVariables).trim(),
      headers,
      body_mode: request.bodyMode,
      raw_type: request.bodyMode === "graphql" ? "json" : request.rawType,
      body,
      form: buildFormPayload(request),
      stream: false
    },
    ...httpTransportPayload(state.settings, false)
  };

  try {
    const response = await invoke<ApiResponse>("send_request", { payload });
    request.lastResponse = response;
    request.lastError = null;
    return formatResponse(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    request.lastError = message;
    return JSON.stringify({ error: message }, null, 2);
  }
}

export async function runSavedRequestById(requestId: string): Promise<string> {
  const item = getItem(requestId);
  if (!item || item.kind !== "request") {
    return JSON.stringify({ error: `Request not found: ${requestId}` });
  }
  return dispatchRequest(item);
}

export async function runFunctionById(functionId: string): Promise<string> {
  const func = state.functions.find((f) => f.id === functionId);
  if (!func) {
    return JSON.stringify({ error: `Function not found: ${functionId}` });
  }

  // 1. Direct AI Request type
  if (func.functionType === "ai") {
    const userPrompt = applyVariables(func.aiRequestPrompt ?? "", getEffectiveVariables());
    const messages = [
      {
        role: "system" as const,
        content: "You are a helpful assistant. You must respond ONLY with a valid JSON object or array as requested. Do NOT include markdown code blocks (such as ```json), explanations, or any other text before or after the JSON."
      },
      {
        role: "user" as const,
        content: userPrompt
      }
    ];

    const res = await requestStandaloneAiCompletion(messages);
    if (!res.ok) {
      return JSON.stringify({ error: res.error });
    }

    let extracted: unknown;
    try {
      extracted = JSON.parse(res.content);
    } catch {
      let cleaned = res.content.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```[a-zA-Z]*\n/, "").replace(/\n```$/, "").trim();
      }
      try {
        extracted = JSON.parse(cleaned);
      } catch (jsonErr: any) {
        return JSON.stringify({
          error: "AI returned invalid JSON: " + jsonErr.message,
          raw_output: res.content
        }, null, 2);
      }
    }

    return JSON.stringify({ extracted }, null, 2);
  }

  // 2. Standalone JavaScript type
  if (func.functionType === "javascript") {
    try {
      const standaloneFunc = new Function(`
        "use strict";
        try {
          ${func.code}
        } catch (e) {
          throw new Error("Execution error: " + e.message);
        }
      `);
      const extracted = standaloneFunc();
      return JSON.stringify({ extracted }, null, 2);
    } catch (error) {
      return JSON.stringify({
        error: error instanceof Error ? error.message : String(error)
      }, null, 2);
    }
  }

  // 3. HTTP request type
  const fakeRequest = savedRequestFromFunction(func);
  const bodyText = await dispatchRequest(fakeRequest);

  const response = fakeRequest.lastResponse;
  if (!response) {
    return bodyText;
  }

  // A. HTTP with AI Extractor
  if (func.extractorType === "ai") {
    const userPrompt = applyVariables(func.extractorPrompt ?? "", getEffectiveVariables());
    const messages = [
      {
        role: "system" as const,
        content: userPrompt || "Extract the most relevant data from this HTTP response. Return only the extracted value cleanly."
      },
      {
        role: "user" as const,
        content: JSON.stringify({
          status: response.status,
          statusText: response.status_text,
          headers: response.headers,
          body: response.body
        }, null, 2)
      }
    ];

    const res = await requestStandaloneAiCompletion(messages);
    if (!res.ok) {
      return JSON.stringify(
        {
          http: JSON.parse(bodyText),
          extractor_error: res.error
        },
        null,
        2
      );
    }

    let extracted: unknown = res.content;
    const trimmed = res.content.trim();
    if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
      try {
        extracted = JSON.parse(trimmed);
      } catch {
        // keep string
      }
    }

    return JSON.stringify(
      {
        http: JSON.parse(bodyText),
        extracted
      },
      null,
      2
    );
  }

  // B. HTTP with JS Extractor (Original code)
  let parsedBody: unknown = bodyText;
  try {
    const parsed = JSON.parse(bodyText);
    if (parsed && typeof parsed === "object" && "body" in parsed) {
      parsedBody = (parsed as { body: unknown }).body;
    }
  } catch {
    // keep string
  }

  try {
    const extractorFunc = new Function("__rawResponse__", "__parsedBody__", `
      "use strict";
      const response = {
        status: __rawResponse__.status,
        statusText: __rawResponse__.status_text,
        headers: __rawResponse__.headers,
        body: __parsedBody__
      };
      try {
        ${func.extractorCode}
      } catch (e) {
        throw new Error("Extractor error: " + e.message);
      }
    `);
    const extracted = extractorFunc(response, parsedBody);
    return JSON.stringify(
      {
        http: JSON.parse(bodyText),
        extracted
      },
      null,
      2
    );
  } catch (error) {
    return JSON.stringify(
      {
        http: JSON.parse(bodyText),
        extractor_error: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    );
  }
}
