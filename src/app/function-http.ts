import { invoke } from "@tauri-apps/api/core";
import { applyVariables } from "../variables";
import type { ApiResponse, AppFunction, SavedRequest } from "../types";
import { COLLECTION_ROOT_PARENT_ID } from "./collection-parent";
import { getEffectiveVariables } from "./environments";
import { httpTransportPayload } from "./persistence";
import { resolvedOutboundUrl } from "./request-auth";
import { buildFormPayload, buildRequestHeaders, withContentType } from "./request-utils";
import { state } from "./state";

export function functionAsSavedRequest(func: AppFunction): SavedRequest {
  return {
    id: func.id,
    kind: "request",
    parentId: COLLECTION_ROOT_PARENT_ID,
    title: func.name,
    method: func.method,
    url: func.url,
    queryParams: func.queryParams,
    headers: func.headers,
    bodyMode: func.bodyMode,
    rawType: func.rawType,
    body: func.body,
    form: func.form,
    auth: func.auth,
    streamResponse: false,
    lastResponse: null,
    lastError: null
  };
}

export async function invokeFunctionHttp(func: AppFunction): Promise<ApiResponse> {
  const fakeRequest = functionAsSavedRequest(func);
  const effectiveVariables = getEffectiveVariables();
  const headers = withContentType(fakeRequest, buildRequestHeaders(fakeRequest));
  const resolvedUrl = resolvedOutboundUrl(fakeRequest, effectiveVariables).trim();

  const payload = {
    request: {
      id: func.id,
      method: func.method,
      url: resolvedUrl,
      headers,
      body_mode: func.bodyMode,
      raw_type: func.rawType,
      body: func.bodyMode === "raw" ? applyVariables(func.body, effectiveVariables) : "",
      form: buildFormPayload(fakeRequest),
      stream: false
    },
    ...httpTransportPayload(state.settings, false)
  };

  return invoke<ApiResponse>("send_request", { payload });
}

export function runExtractorOnResponse(func: AppFunction, response: ApiResponse): unknown {
  const codeToEval = func.extractorCode;
  let parsedBody: unknown = response.body;
  if (typeof response.body === "string") {
    try {
      parsedBody = JSON.parse(response.body);
    } catch {
      // keep string
    }
  }

  const extractorFunc = new Function("__rawResponse__", "__parsedBody__", `
      "use strict";
      const response = {
        status: __rawResponse__.status,
        statusText: __rawResponse__.status_text,
        headers: __rawResponse__.headers,
        body: __parsedBody__
      };

      try {
        ${codeToEval}
      } catch(e) {
        throw new Error("Extractor error: " + e.message);
      }
    `);

  return extractorFunc(response, parsedBody);
}
