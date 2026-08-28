import { requestAuthTextFields } from "../app/request-auth";
import { buildRequestUrl } from "./url-params";
import type { Pair, ParameterAnswers, SavedRequest, Variable } from "../types";

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

/** Matches a single `{{name}}` reference. `[^}]+` keeps a match from spanning two
 * templates, so `{{a}}{{b}}` resolves as two names rather than one. */
const VARIABLE_TEMPLATE = /\{\{([^}]+)\}\}/;
const VARIABLE_TEMPLATE_GLOBAL = new RegExp(VARIABLE_TEMPLATE, "g");

/** Marks a reference as a run-time parameter rather than a stored variable: `{{?username}}`. */
const PARAMETER_SIGIL = "?";

/** A single `{{…}}` occurrence, classified. `{{name}}` reads a stored variable; `{{?name}}` is
 * answered when the request runs. */
export type TemplateReference =
  | { kind: "variable"; name: string }
  | { kind: "parameter"; name: string };

/** Classifies the text between the braces. Returns `null` for a reference with no name
 * (`{{}}` or `{{?}}`), which is left in place rather than resolved to nothing. */
function classifyTemplate(inner: string): TemplateReference | null {
  const trimmed = inner.trim();
  if (trimmed.startsWith(PARAMETER_SIGIL)) {
    const name = trimmed.slice(PARAMETER_SIGIL.length).trim();
    return name ? { kind: "parameter", name } : null;
  }
  return trimmed ? { kind: "variable", name: trimmed } : null;
}

/** Walks every `{{…}}` in `text` exactly once, replacing each with what `resolve` returns.
 *
 * One pass is deliberate: whatever a reference resolves to is final, so a value that itself
 * contains `{{…}}` is not expanded again. That is what keeps variable chaining out of the
 * language until it is designed properly (ROADMAP 3.8). */
function replaceTemplates(text: string, resolve: (reference: TemplateReference) => string): string {
  return text.replace(VARIABLE_TEMPLATE_GLOBAL, (match, inner: string) => {
    const reference = classifyTemplate(inner);
    return reference ? resolve(reference) : match;
  });
}

/** Value of an enabled variable, or `""` when there is no such variable. */
export function variableValue(name: string, variables: Variable[]): string {
  return variables.find((item) => item.enabled && item.name === name)?.value ?? "";
}

/**
 * Resolves both kinds of reference in a single pass: `{{name}}` from `variables`, `{{?name}}`
 * from `answers`. An unanswered parameter resolves to `""`, exactly like an unknown variable —
 * so every caller that has no answers to give (previews, cURL generation, export) keeps working
 * unchanged and simply renders parameters as empty.
 *
 * One pass means a resolved value that itself contains `{{…}}` is substituted verbatim, never
 * expanded again.
 */
export function applyVariables(
  value: string,
  variables: Variable[],
  answers: ParameterAnswers = {}
): string {
  return replaceTemplates(value, (reference) =>
    reference.kind === "parameter"
      ? (answers[reference.name] ?? "")
      : variableValue(reference.name, variables)
  );
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

/** What the URL field shows: templates stay readable instead of coming back percent-encoded. */
export function displayRequestUrl(request: SavedRequest): string {
  return buildRequestUrl(request.url, request.queryParams, request.urlHash ?? "", true);
}

export function shouldShowUrlPreview(request: SavedRequest, variables: Variable[]): boolean {
  if (requestHasVariableTemplate(request)) return true;
  return displayRequestUrl(request) !== resolvedRequestUrl(request, variables);
}

/** True when `value` still contains at least one `{{name}}` reference. */
export function hasVariableTemplate(value: string): boolean {
  return VARIABLE_TEMPLATE.test(value);
}

function requestHasVariableTemplate(request: SavedRequest): boolean {
  if (hasVariableTemplate(request.url) || hasVariableTemplate(request.urlHash ?? "")) return true;
  if (request.queryParams.some((pair) => hasVariableTemplate(pair.key) || hasVariableTemplate(pair.value))) {
    return true;
  }
  if (request.headers.some((pair) => hasVariableTemplate(pair.key) || hasVariableTemplate(pair.value))) {
    return true;
  }
  if (hasVariableTemplate(request.body)) return true;
  return request.form.some((pair) => hasVariableTemplate(pair.key) || hasVariableTemplate(pair.value));
}

/** Every distinct reference in `value` whose `kind` matches. */
export function collectTemplateNames(value: string, kind: TemplateReference["kind"] = "variable") {
  const names = new Set<string>();
  for (const match of value.matchAll(VARIABLE_TEMPLATE_GLOBAL)) {
    const reference = classifyTemplate(match[1] ?? "");
    if (reference?.kind === kind) names.add(reference.name);
  }
  return names;
}

/** Every request field that carries `{{…}}` templates, flattened — the single list that anything
 * scanning a request for references should walk, so a new templated field is added in one place. */
export function requestTemplateFields(request: SavedRequest): string[] {
  return [
    request.url,
    request.urlHash ?? "",
    request.body,
    request.graphqlVariables ?? "",
    ...request.queryParams.flatMap((pair) => [pair.key, pair.value]),
    ...request.headers.flatMap((pair) => [pair.key, pair.value]),
    ...request.form.flatMap((pair) => [pair.key, pair.value]),
    ...requestAuthTextFields(request)
  ];
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
  return requestTemplateFields(request).some((field) => secretNamesUsedInText(field, variables).size > 0);
}

export function variablesForCurl(variables: Variable[], includeSecrets: boolean) {
  if (includeSecrets) return variables;
  return variables.map((variable) => (variable.secret ? { ...variable, value: "" } : variable));
}
