/**
 * Selectors for controls that should NOT be treated as "outside click" targets by
 * popover/context-menu close handlers.
 * These are elements with explicit React onClick handlers that perform their own actions.
 */
const APP_ACTION_SELECTOR = [
  "[data-func-action]",
  ".tree-row-actions",
  ".tree-action-btn",
  ".variable-secret-btn",
  ".variable-remove",
  ".remove-variable",
  ".field-remove-btn",
  ".request-popover-trigger",
  ".env-chip",
  ".variables-add-btn"
].join(", ");

export function isAppActionTarget(target: EventTarget | null): boolean {
  return Boolean((target as HTMLElement | null)?.closest(APP_ACTION_SELECTOR));
}

/** @deprecated Use isAppActionTarget */
export function isRowWorkspaceActionTarget(target: EventTarget | null): boolean {
  return isAppActionTarget(target);
}
