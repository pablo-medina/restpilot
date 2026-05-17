import { requestAuthTextFields } from "./app/request-auth";
import { buildRequestUrl } from "./url-params";
import type { Pair, SavedRequest, Variable } from "./types";

/** Environment variables override global variables with the same name. */
export function effectiveVariables(global: Variable[], environment: Variable[]): Variable[] {
  const byName = new Map<string, Variable>();
  for (const variable of global) {
    const key = variable.name.trim();
    if (key) byName.set(key, variable);
  }
  for (const variable of environment) {
    const key = variable.name.trim();
    if (key) byName.set(key, variable);
  }
  return Array.from(byName.values());
}

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
  if (request.queryParams.some((pair) => /\$\{[^}]+\}/.test(pair.key) || /\$\{[^}]+\}/.test(pair.value))) {
    return true;
  }
  if (request.headers.some((pair) => /\$\{[^}]+\}/.test(pair.key) || /\$\{[^}]+\}/.test(pair.value))) {
    return true;
  }
  if (/\$\{[^}]+\}/.test(request.body)) return true;
  return request.form.some((pair) => /\$\{[^}]+\}/.test(pair.key) || /\$\{[^}]+\}/.test(pair.value));
}

const VARIABLE_PATTERN = /\$\{([^}]+)\}/g;

function collectTemplateNames(value: string) {
  const names = new Set<string>();
  for (const match of value.matchAll(VARIABLE_PATTERN)) {
    const name = match[1]?.trim();
    if (name) names.add(name);
  }
  return names;
}

function secretNamesUsedInText(value: string, variables: Variable[]) {
  const used = new Set<string>();
  for (const name of collectTemplateNames(value)) {
    const variable = variables.find((item) => item.enabled && item.name.trim() === name);
    if (variable?.secret) used.add(name);
  }
  return used;
}

export function requestUsesSecretVariables(request: SavedRequest, variables: Variable[]) {
  const fields = [
    request.url,
    request.urlHash ?? "",
    request.body,
    ...request.queryParams.flatMap((pair) => [pair.key, pair.value]),
    ...request.headers.flatMap((pair) => [pair.key, pair.value]),
    ...request.form.flatMap((pair) => [pair.key, pair.value])
  ];

  for (const field of fields) {
    if (secretNamesUsedInText(field, variables).size) return true;
  }

  for (const field of requestAuthTextFields(request)) {
    if (secretNamesUsedInText(field, variables).size) return true;
  }

  return false;
}

export function variablesForCurl(variables: Variable[], includeSecrets: boolean) {
  if (includeSecrets) return variables;
  return variables.map((variable) => (variable.secret ? { ...variable, value: "" } : variable));
}
