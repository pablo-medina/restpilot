import { redactRequestAuthForExport } from "../app/request-auth";
import type { AppFunction, Pair } from "../types";

const HTTP_BODY_PREVIEW_MAX = 4000;

function enabledPairs(pairs: Pair[]) {
  return pairs
    .filter((p) => p.enabled && p.key.trim())
    .map((p) => ({ key: p.key, value: p.value }));
}

/** Structured function snapshot for AI tools and extractor generation. */
export function functionDetailsPayload(func: AppFunction) {
  const http: Record<string, unknown> = {
    method: func.method,
    url: func.url,
    query_params: enabledPairs(func.queryParams),
    headers: enabledPairs(func.headers),
    body_mode: func.bodyMode,
    auth: redactRequestAuthForExport(func.auth)
  };

  if (func.bodyMode === "raw" && func.body.trim()) {
    http.raw_type = func.rawType;
    http.body = func.body;
  } else if (func.bodyMode === "form") {
    http.form = func.form
      .filter((p) => p.enabled && p.key.trim())
      .map((p) => ({
        key: p.key,
        value: p.value,
        part_type: p.partType ?? "text",
        file_name: p.fileName
      }));
  }

  const payload: Record<string, unknown> = {
    id: func.id,
    name: func.name,
    description: func.description?.trim() || "",
    http_request: http,
    extractor_code: func.extractorCode
  };

  if (func.lastHttpResponse) {
    const body = func.lastHttpResponse.body ?? "";
    payload.last_http_response = {
      status: func.lastHttpResponse.status,
      status_text: func.lastHttpResponse.status_text,
      duration_ms: func.lastHttpResponse.duration_ms,
      body_preview:
        body.length > HTTP_BODY_PREVIEW_MAX
          ? `${body.slice(0, HTTP_BODY_PREVIEW_MAX)}…`
          : body
    };
  }

  return payload;
}
