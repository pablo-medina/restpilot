/**
 * Tab strip drag: full-tab ghost + geometry-only insert index (clientX + layout rects).
 * Same model as VS Code / Cursor — never elementFromPoint under the ghost.
 */

import {
  computeTabInsertIndexFromStrip,
  readTabSlotRects,
  reorderTabsToInsertIndex
} from "./open-tabs";

export type TabStripReorderOptions = {
  getHost: () => HTMLElement | null;
  getTabIds: () => string[];
  onCommit: (next: string[]) => void;
};

const THRESHOLD = 5;
const GHOST_CLASS = "pointer-drag-ghost";
const MARKER_CLASS = "tab-insert-marker";
const BOUND_KEY = "__restpilotTabStripReorder";

function stripGhostInteractivity(ghost: HTMLElement) {
  ghost.querySelectorAll("button, [data-close-tab]").forEach((node) => node.remove());
}

function getStrip(host: HTMLElement | null): HTMLElement | null {
  return host?.querySelector<HTMLElement>(".tab-strip") ?? null;
}

function getViewport(strip: HTMLElement | null): HTMLElement | null {
  return strip?.closest<HTMLElement>(".tab-strip-viewport") ?? null;
}

export function attachTabStripReorder(options: TabStripReorderOptions): void {
  const win = window as Window & { [BOUND_KEY]?: boolean };
  if (win[BOUND_KEY]) return;
  win[BOUND_KEY] = true;

  let sourceEl: HTMLElement | null = null;
  let sourceId = "";
  let dragging = false;
  let captured = false;
  let activePointerId = -1;
  let blockNextClick = false;
  let ghostEl: HTMLElement | null = null;
  let markerEl: HTMLElement | null = null;
  let markerParent: HTMLElement | null = null;
  let ghostOffsetX = 0;
  let ghostOffsetY = 0;
  let savedOrder: string[] | null = null;
  let lastInsertIndex = -1;

  const removeGhost = () => {
    ghostEl?.remove();
    ghostEl = null;
  };

  const removeMarker = () => {
    markerEl?.remove();
    markerEl = null;
    markerParent = null;
  };

  const clearDragStyles = (strip: HTMLElement | null) => {
    strip?.classList.remove("is-reordering");
    strip?.querySelectorAll<HTMLElement>(".request-tab").forEach((tab) => {
      tab.classList.remove("dragging");
    });
    removeMarker();
    removeGhost();
    document.querySelectorAll(`.${MARKER_CLASS}`).forEach((node) => node.remove());
  };

  const releaseCapture = (event: PointerEvent) => {
    if (!captured) return;
    try {
      document.body.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
    captured = false;
  };

  const positionGhost = (clientX: number, clientY: number) => {
    if (!ghostEl) return;
    ghostEl.style.transform = `translate(${clientX - ghostOffsetX}px, ${clientY - ghostOffsetY}px)`;
  };

  const createGhost = (source: HTMLElement, event: PointerEvent) => {
    removeGhost();
    const rect = source.getBoundingClientRect();
    const ghost = source.cloneNode(true) as HTMLElement;
    ghost.classList.add(GHOST_CLASS);
    ghost.classList.remove("dragging");
    stripGhostInteractivity(ghost);
    ghost.setAttribute("aria-hidden", "true");
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.left = "0";
    ghost.style.top = "0";
    document.body.appendChild(ghost);
    ghostEl = ghost;
    ghostOffsetX = event.clientX - rect.left;
    ghostOffsetY = event.clientY - rect.top;
    positionGhost(event.clientX, event.clientY);
  };

  const ensureMarker = (viewport: HTMLElement): HTMLElement => {
    if (markerEl && markerParent === viewport) return markerEl;
    removeMarker();
    const marker = document.createElement("div");
    marker.className = MARKER_CLASS;
    marker.setAttribute("aria-hidden", "true");
    viewport.appendChild(marker);
    markerEl = marker;
    markerParent = viewport;
    return marker;
  };

  const insertEdgeX = (slots: ReturnType<typeof readTabSlotRects>, insertIndex: number) => {
    if (!slots.length) return 0;
    if (insertIndex <= 0) return slots[0]!.left;
    if (insertIndex >= slots.length) return slots[slots.length - 1]!.right;
    return slots[insertIndex]!.left;
  };

  const positionInsertMarker = (viewport: HTMLElement, slots: ReturnType<typeof readTabSlotRects>, insertIndex: number) => {
    if (!slots.length) return;

    const marker = ensureMarker(viewport);
    const viewportRect = viewport.getBoundingClientRect();
    const edgeX = insertEdgeX(slots, insertIndex);

    marker.style.left = `${edgeX - viewportRect.left + viewport.scrollLeft}px`;
    marker.classList.remove("is-hidden");
  };

  const resolveInsertIndex = (strip: HTMLElement, clientX: number): number => {
    if (!savedOrder) return 0;
    const slots = readTabSlotRects(strip, savedOrder);
    return computeTabInsertIndexFromStrip(slots, sourceId, clientX);
  };

  const autoScrollStrip = (viewport: HTMLElement, clientX: number) => {
    const rect = viewport.getBoundingClientRect();
    const edge = 48;
    const maxStep = 18;
    if (clientX < rect.left + edge) {
      viewport.scrollLeft -= maxStep;
    } else if (clientX > rect.right - edge) {
      viewport.scrollLeft += maxStep;
    }
  };

  const updateDrag = (strip: HTMLElement, viewport: HTMLElement, clientX: number, clientY: number) => {
    positionGhost(clientX, clientY);
    autoScrollStrip(viewport, clientX);
    const slots = readTabSlotRects(strip, savedOrder ?? []);
    lastInsertIndex = computeTabInsertIndexFromStrip(slots, sourceId, clientX);
    positionInsertMarker(viewport, slots, lastInsertIndex);
  };

  const finish = (commit: boolean) => {
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    document.removeEventListener("pointercancel", onUp);
    document.body.style.removeProperty("user-select");
    document.body.style.cursor = "";

    const strip = getStrip(options.getHost());

    if (sourceEl && dragging && commit && savedOrder && lastInsertIndex >= 0) {
      const next = reorderTabsToInsertIndex(savedOrder, sourceId, lastInsertIndex);
      if (next) options.onCommit(next);
    }

    clearDragStyles(strip);
    sourceEl = null;
    sourceId = "";
    dragging = false;
    savedOrder = null;
    lastInsertIndex = -1;
    activePointerId = -1;
  };

  const onMove = (event: PointerEvent) => {
    if (!sourceEl || event.pointerId !== activePointerId) return;

    const host = options.getHost();
    const strip = getStrip(host);
    const viewport = getViewport(strip);
    if (!strip || !viewport) return;

    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (!dragging && Math.hypot(dx, dy) < THRESHOLD) return;

    if (!dragging) {
      dragging = true;
      document.querySelectorAll(`.${MARKER_CLASS}`).forEach((node) => node.remove());
      markerEl = null;
      markerParent = null;
      strip.classList.add("is-reordering");
      sourceEl.classList.add("dragging");
      document.body.style.userSelect = "none";
      document.body.style.cursor = "grabbing";
      createGhost(sourceEl, event);
      try {
        document.body.setPointerCapture(event.pointerId);
        captured = true;
      } catch {
        captured = false;
      }
    }

    event.preventDefault();
    updateDrag(strip, viewport, event.clientX, event.clientY);
  };

  const onUp = (event: PointerEvent) => {
    if (!sourceEl || event.pointerId !== activePointerId) return;

    if (!dragging) {
      releaseCapture(event);
      finish(false);
      return;
    }

    blockNextClick = true;

    const host = options.getHost();
    const strip = getStrip(host);
    const viewport = getViewport(strip);

    if (strip && viewport) {
      updateDrag(strip, viewport, event.clientX, event.clientY);
    }

    releaseCapture(event);
    finish(true);
  };

  let startX = 0;
  let startY = 0;

  document.addEventListener(
    "click",
    (event) => {
      if (!blockNextClick) return;
      const host = options.getHost();
      const strip = getStrip(host);
      if (!strip?.contains(event.target as Node)) return;
      blockNextClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true
  );

  document.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("[data-close-tab]")) return;

    const host = options.getHost();
    const strip = getStrip(host);
    if (!strip) return;

    const item = (event.target as HTMLElement).closest<HTMLElement>("[data-open-tab]");
    if (!item || !strip.contains(item)) return;

    sourceEl = item;
    sourceId = item.dataset.openTab ?? "";
    if (!sourceId) {
      sourceEl = null;
      return;
    }

    savedOrder = [...options.getTabIds()];
    dragging = false;
    captured = false;
    activePointerId = event.pointerId;
    lastInsertIndex = savedOrder.indexOf(sourceId);
    startX = event.clientX;
    startY = event.clientY;

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  });
}
