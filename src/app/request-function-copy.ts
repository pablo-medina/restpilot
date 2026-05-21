import { normalizeRequestAuth } from "./request-auth";
import { id } from "./state";
import type { AppFunction, Pair, SavedRequest } from "../types";

export const DEFAULT_FUNCTION_EXTRACTOR = `// Extract data from the response
if (response.status === 200) {
  return response.body;
}
return undefined;
`;

function clonePairs(pairs: Pair[]): Pair[] {
  return pairs.map((pair) => ({ ...pair, id: id() }));
}

/** Copy HTTP fields from a saved request into an existing function. */
export function applyRequestToFunction(func: AppFunction, request: SavedRequest): void {
  func.method = request.method;
  func.url = request.url;
  func.queryParams = clonePairs(request.queryParams);
  func.headers = clonePairs(request.headers);
  func.bodyMode = request.bodyMode;
  func.rawType = request.rawType;
  func.body = request.body;
  func.form = clonePairs(request.form);
  func.binaryFilePath = request.binaryFilePath;
  func.graphqlVariables = request.graphqlVariables;
  func.auth = normalizeRequestAuth(request.auth);
  func.lastHttpResponse = null;
  func.lastTestResult = null;
}

/** Build a new function from a saved request. */
export function functionFromRequest(
  request: SavedRequest,
  overrides: Partial<Pick<AppFunction, "name" | "description" | "extractorCode">> = {}
): AppFunction {
  const func: AppFunction = {
    id: id(),
    name: overrides.name?.trim() || request.title,
    description: overrides.description?.trim() || request.description?.trim() || "",
    code: "",
    functionType: "http",
    method: request.method,
    url: request.url,
    queryParams: clonePairs(request.queryParams),
    headers: clonePairs(request.headers),
    bodyMode: request.bodyMode,
    rawType: request.rawType,
    body: request.body,
    form: clonePairs(request.form),
    auth: normalizeRequestAuth(request.auth),
    extractorCode: overrides.extractorCode ?? DEFAULT_FUNCTION_EXTRACTOR,
    lastHttpResponse: null,
    lastTestResult: null
  };
  return func;
}
