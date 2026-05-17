import { applyVariables } from "../variables";
import { clampRequestTimeoutSecs, type SavedRequest, type UserSettings } from "../types";
import { id, state } from "./state";

export function networkPayload(settings: UserSettings, stream: boolean) {
  const base = clampRequestTimeoutSecs(settings.requestTimeoutSecs);
  const timeoutSecs = stream ? Math.max(base, 600) : base;
  return {
    timeout_secs: timeoutSecs,
    follow_redirects: settings.followRedirects
  };
}

export function blankRequest(parentId: string | null): SavedRequest {
  return {
    id: id(),
    kind: "request",
    parentId,
    title: "New request",
    method: "GET",
    url: "",
    urlHash: "",
    queryParams: [],
    headers: [],
    bodyMode: "raw",
    rawType: "json",
    body: "",
    form: [],
    streamResponse: false,
    lastResponse: null,
    lastError: null
  };
}

export function hasEnabledFormFields(request: SavedRequest) {
  return request.form.some((field) => field.enabled && field.key.trim());
}

export function withContentType(request: SavedRequest, headers: Record<string, string>) {
  if (Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) return headers;

  if (request.bodyMode === "form" && hasEnabledFormFields(request)) {
    return { ...headers, "Content-Type": "application/x-www-form-urlencoded" };
  }

  if (request.bodyMode === "raw" && request.body.trim()) {
    const type =
      request.rawType === "json"
        ? "application/json"
        : request.rawType === "xml"
          ? "application/xml"
          : "text/plain";
    return { ...headers, "Content-Type": type };
  }

  return headers;
}

export function buildFormPayload(request: SavedRequest) {
  return request.form.map((field) => ({
    key: applyVariables(field.key, state.variables),
    value: field.partType === "file" ? field.value : applyVariables(field.value, state.variables),
    enabled: field.enabled,
    part_type: field.partType ?? "text",
    file_name: field.fileName ?? null
  }));
}
