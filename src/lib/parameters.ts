import { collectTemplateNames, requestTemplateFields } from "./variables";
import type { SavedRequest } from "../types";

/** Parameter names referenced by `{{?name}}` in a single field. */
export function collectParameterNames(value: string): Set<string> {
  return collectTemplateNames(value, "parameter");
}

/**
 * Parameters a request asks for, inferred from its text every time it runs — there is nothing to
 * declare or configure. Ordered by first appearance across URL, query, headers, body, form, auth.
 */
export function requestParameterNames(request: SavedRequest): string[] {
  const names = new Set<string>();
  for (const field of requestTemplateFields(request)) {
    for (const name of collectParameterNames(field)) names.add(name);
  }
  return [...names];
}
