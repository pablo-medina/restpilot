/**
 * Least-recently-used order for open tabs, used by the open-tab limit to pick which tab
 * leaves the strip. Runtime only — never written to `config.json`: a restored session
 * starts from the strip order (leftmost = oldest), which is all the ranking needs.
 */
const usedAt = new Map<string, number>();

/** Monotonic counter, not a clock: two tabs opened in the same millisecond still order. */
let tick = 0;

/** Records a tab as the most recently used one. */
export function markTabUsed(requestId: string): void {
  if (!requestId) return;
  usedAt.set(requestId, ++tick);
}

/** Drops a closed tab so a later reopen does not inherit its old rank. */
export function forgetTabUsage(requestId: string): void {
  usedAt.delete(requestId);
}

/** 0 for a tab that has not been activated in this session (e.g. restored from config). */
export function tabUsedAt(requestId: string): number {
  return usedAt.get(requestId) ?? 0;
}

export function resetTabUsage(): void {
  usedAt.clear();
  tick = 0;
}
