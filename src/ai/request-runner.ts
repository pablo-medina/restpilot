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
  const payload = {
    request: {
      id: runId,
      method: request.method,
      url: resolvedOutboundUrl(request, effectiveVariables).trim(),
      headers,
      body_mode: request.bodyMode,
      raw_type: request.rawType,
      body: request.bodyMode === "raw" ? applyVariables(request.body, effectiveVariables) : "",
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

  const fakeRequest = savedRequestFromFunction(func);
  const bodyText = await dispatchRequest(fakeRequest);

  let parsedBody: unknown = bodyText;
  try {
    const parsed = JSON.parse(bodyText);
    if (parsed && typeof parsed === "object" && "body" in parsed) {
      parsedBody = (parsed as { body: unknown }).body;
    }
  } catch {
    // keep string
  }

  const response = fakeRequest.lastResponse;
  if (!response) {
    return bodyText;
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
