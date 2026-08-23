import type { ApiResponse, Extractor, Variable } from "../types";

export const DEFAULT_EXTRACTOR_CODE = `// The response is available as \`response\`.
// Return the value you want to extract.
return response.body.access_token;
`;

export function defaultExtractor(id: string, name = ""): Extractor {
  return { id, name, code: DEFAULT_EXTRACTOR_CODE, sampleText: "" };
}

/** Header lookup for scripts (`response.headers["content-type"]`). Repeated names are joined
 * with ", ", matching `Headers.get()`. */
function headerLookup(headers: ApiResponse["headers"]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of headers) {
    result[key] = key in result ? `${result[key]}, ${value}` : value;
  }
  return result;
}

function parseBody(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

export type ExtractorOutcome =
  | { success: true; value: unknown }
  | { success: false; error: string };

/** Runs `code` against a response. JSON bodies arrive parsed; anything else stays a string. */
export function runExtractor(code: string, response: ApiResponse): ExtractorOutcome {
  try {
    const script = new Function(
      "response",
      `"use strict";\n${code}`
    ) as (response: unknown) => unknown;
    return {
      success: true,
      value: script({
        status: response.status,
        statusText: response.status_text,
        headers: headerLookup(response.headers),
        body: parseBody(response.body)
      })
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Wraps raw text as a response so the editor's Test button can run without an HTTP call. */
export function responseFromSample(sampleText: string): ApiResponse {
  return {
    status: 200,
    status_text: "OK",
    duration_ms: 0,
    headers: [],
    body: sampleText,
    body_is_base64: false,
    body_size: sampleText.length
  };
}

export function stringifyExtractedValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2) ?? "";
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/** Writes `value` into the variable named `name`, creating it when missing. Mutates `list`. */
export function applyExtractedVariable(
  list: Variable[],
  name: string,
  value: string,
  newId: () => string
): { created: boolean } {
  const target = name.trim();
  const existing = list.find((variable) => variable.name.trim() === target);
  if (existing) {
    existing.value = value;
    existing.enabled = true;
    return { created: false };
  }
  list.push({ id: newId(), name: target, value, enabled: true });
  return { created: true };
}

export type ExtractorNameProblem = "empty" | "duplicate" | null;

/** Names are required and unique; `selfId` excludes the extractor being edited. */
export function extractorNameProblem(
  name: string,
  extractors: Extractor[],
  selfId: string
): ExtractorNameProblem {
  const trimmed = name.trim();
  if (!trimmed) return "empty";
  const clash = extractors.some(
    (item) => item.id !== selfId && item.name.trim().toLowerCase() === trimmed.toLowerCase()
  );
  return clash ? "duplicate" : null;
}

export function findExtractor(extractors: Extractor[], id: string | undefined): Extractor | null {
  if (!id) return null;
  return extractors.find((item) => item.id === id) ?? null;
}
