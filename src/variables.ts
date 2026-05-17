import { buildRequestUrl } from "./url-params";
import type { Pair, SavedRequest, Variable } from "./types";

export function applyVariables(value: string, variables: Variable[]): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, name: string) => {
    const variable = variables.find((item) => item.enabled && item.name === name.trim());
    return variable?.value ?? "";
  });
}

function resolvePairs(params: Pair[], variables: Variable[]): Pair[] {
  return params.map((pair) => ({
    ...pair,
    key: applyVariables(pair.key, variables),
    value: applyVariables(pair.value, variables)
  }));
}

export function resolvedRequestUrl(request: SavedRequest, variables: Variable[]): string {
  const base = applyVariables(request.url.trim(), variables);
  const params = resolvePairs(request.queryParams, variables);
  const hash = applyVariables(request.urlHash ?? "", variables);
  return buildRequestUrl(base, params, hash);
}

export function displayRequestUrl(request: SavedRequest): string {
  return buildRequestUrl(request.url, request.queryParams, request.urlHash ?? "");
}

export function shouldShowUrlPreview(request: SavedRequest, variables: Variable[]): boolean {
  if (requestHasVariableTemplate(request)) return true;
  return displayRequestUrl(request) !== resolvedRequestUrl(request, variables);
}

function requestHasVariableTemplate(request: SavedRequest): boolean {
  if (/\$\{[^}]+\}/.test(request.url) || /\$\{[^}]+\}/.test(request.urlHash ?? "")) return true;
  return request.queryParams.some(
    (pair) => /\$\{[^}]+\}/.test(pair.key) || /\$\{[^}]+\}/.test(pair.value)
  );
}
