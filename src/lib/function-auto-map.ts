import type { Variable } from "../types";

/** Serializes a function result the same way the mapping dialog does. */
export function stringifyFunctionResult(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value) ?? "";
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/** Writes `value` into the variable named `name`, creating it when it does not exist yet.
 * Mutates `list` in place (the same arrays the app keeps in `state`). */
export function applyAutoMappedVariable(
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
