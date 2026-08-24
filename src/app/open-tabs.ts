export function computeReorderedTabs(
  tabs: string[],
  sourceId: string,
  targetId: string,
  placement: "before" | "after"
): string[] | null {
  const next = [...tabs];
  const from = next.indexOf(sourceId);
  let to = next.indexOf(targetId);
  if (from < 0 || to < 0 || from === to) return null;

  const [moved] = next.splice(from, 1);
  if (from < to) to -= 1;
  if (placement === "after") to += 1;
  next.splice(to, 0, moved);
  return next;
}

export type TabSlotRect = {
  id: string;
  left: number;
  right: number;
  mid: number;
};

function tabSelector(id: string) {
  return `[data-open-tab="${typeof CSS !== "undefined" && "escape" in CSS ? CSS.escape(id) : id}"]`;
}

/** Read tab edges in state order from layout (ghost does not affect this). */
export function readTabSlotRects(strip: HTMLElement, tabIds: readonly string[]): TabSlotRect[] {
  const slots: TabSlotRect[] = [];
  for (const id of tabIds) {
    const el = strip.querySelector<HTMLElement>(tabSelector(id));
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) continue;
    slots.push({
      id,
      left: rect.left,
      right: rect.right,
      mid: rect.left + rect.width / 2
    });
  }
  return slots;
}

/**
 * Insert index from pointer X and tab layout rects only (VS Code / Cursor style).
 * Does not use elementFromPoint or clientY — ghost position cannot interfere.
 */
export function computeTabInsertIndexFromStrip(
  slots: TabSlotRect[],
  sourceId: string,
  clientX: number
): number {
  if (!slots.length) return 0;

  const sourceIndex = slots.findIndex((slot) => slot.id === sourceId);

  for (const slot of slots) {
    if (slot.id === sourceId) continue;
    if (clientX >= slot.left && clientX <= slot.right) {
      const index = slots.findIndex((entry) => entry.id === slot.id);
      return clientX < slot.mid ? index : index + 1;
    }
  }

  if (sourceIndex >= 0) {
    const source = slots[sourceIndex]!;
    if (clientX >= source.left && clientX <= source.right) {
      return clientX < source.mid ? sourceIndex : sourceIndex + 1;
    }
  }

  const without = slots.filter((slot) => slot.id !== sourceId);
  if (!without.length) return 0;

  for (const slot of without) {
    if (clientX < slot.mid) {
      return slots.findIndex((entry) => entry.id === slot.id);
    }
  }

  return slots.length;
}

/** Move sourceId to insertIndex (Chrome / VS Code style). */
export function reorderTabsToInsertIndex(
  tabs: string[],
  sourceId: string,
  insertIndex: number
): string[] | null {
  const from = tabs.indexOf(sourceId);
  if (from < 0) return null;

  let to = Math.max(0, Math.min(insertIndex, tabs.length));
  const next = [...tabs];
  const [moved] = next.splice(from, 1);
  if (from < to) to -= 1;
  if (to === from) return null;
  next.splice(to, 0, moved);
  return next;
}


/**
 * Tabs to drop so `openTabs` fits `limit`, least recently used first.
 *
 * `usedAt` ranks tabs by activation (see `app/tab-usage.ts`); tabs never activated in this
 * session share rank 0 and are broken apart by strip position, so the oldest tab on the left
 * goes first. `protectedIds` (the active tab, the one being opened) is never returned, so the
 * result can be shorter than the overflow when almost everything is protected.
 */
export function planTabLimitEviction(
  openTabs: readonly string[],
  limit: number,
  usedAt: (requestId: string) => number,
  protectedIds: readonly string[] = []
): string[] {
  const max = Math.max(1, Math.floor(limit));
  const overflow = openTabs.length - max;
  if (overflow <= 0) return [];

  const keep = new Set(protectedIds);
  const candidates = openTabs
    .map((id, index) => ({ id, index }))
    .filter((entry) => !keep.has(entry.id))
    .sort((a, b) => usedAt(a.id) - usedAt(b.id) || a.index - b.index);

  return candidates.slice(0, overflow).map((entry) => entry.id);
}
