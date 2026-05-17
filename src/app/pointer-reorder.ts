/** Pointer-driven reorder (reliable in Tauri WebView2; HTML5 DnD is flaky there). */

export type PointerReorderPlacement = "before" | "after" | "inside";

export type PointerReorderOptions = {
  container: HTMLElement;
  itemSelector: string;
  ignoreSelector?: string;
  dragThreshold?: number;
  placementClasses?: Partial<Record<PointerReorderPlacement, string>>;
  draggingClass?: string;
  useDragGhost?: boolean;
  ghostClass?: string;
  getItemId: (element: HTMLElement) => string;
  resolvePlacement: (target: HTMLElement, event: PointerEvent, sourceId: string) => PointerReorderPlacement;
  onCommit: (sourceId: string, targetId: string, placement: PointerReorderPlacement) => void;
  onCommitToRoot?: (sourceId: string) => void;
  onOverContainer?: (event: PointerEvent) => void;
  onLeaveContainer?: () => void;
  /** When elementFromPoint misses a row (gaps), resolve target by layout. */
  resolveTarget?: (event: PointerEvent, sourceId: string) => HTMLElement | null;
  /** Root drop highlight / commit only when this returns true. */
  shouldOfferRootDrop?: (event: PointerEvent, sourceId: string) => boolean;
};

const DEFAULT_THRESHOLD = 6;
const GHOST_CLASS = "pointer-drag-ghost";

function stripGhostInteractivity(ghost: HTMLElement) {
  ghost.querySelectorAll("button, input, select, textarea, a").forEach((node) => node.remove());
  ghost.querySelectorAll<HTMLElement>("[data-close-tab], [data-tree-action]").forEach((node) => node.remove());
}

export function attachPointerReorder(options: PointerReorderOptions): void {
  const threshold = options.dragThreshold ?? DEFAULT_THRESHOLD;
  const draggingClass = options.draggingClass ?? "dragging";
  const useDragGhost = options.useDragGhost ?? true;
  const ghostClass = options.ghostClass ?? GHOST_CLASS;
  const classBefore = options.placementClasses?.before ?? "drop-before";
  const classAfter = options.placementClasses?.after ?? "drop-after";
  const classInside = options.placementClasses?.inside ?? "drop-into";
  const allPlacementClasses = [classBefore, classAfter, classInside];

  let sourceEl: HTMLElement | null = null;
  let sourceId = "";
  let dragging = false;
  let captured = false;
  let blockNextClick = false;
  let ghostEl: HTMLElement | null = null;
  let ghostOffsetX = 0;
  let ghostOffsetY = 0;

  const clearIndicators = (except?: HTMLElement) => {
    options.container.querySelectorAll<HTMLElement>(options.itemSelector).forEach((item) => {
      if (item !== except) item.classList.remove(...allPlacementClasses, draggingClass);
    });
    if (!except) options.onLeaveContainer?.();
  };

  const removeGhost = () => {
    ghostEl?.remove();
    ghostEl = null;
  };

  const positionGhost = (event: PointerEvent) => {
    if (!ghostEl) return;
    ghostEl.style.transform = `translate(${event.clientX - ghostOffsetX}px, ${event.clientY - ghostOffsetY}px)`;
  };

  const createGhost = (source: HTMLElement, event: PointerEvent) => {
    removeGhost();
    const rect = source.getBoundingClientRect();
    const ghost = source.cloneNode(true) as HTMLElement;
    ghost.classList.add(ghostClass);
    ghost.classList.remove(draggingClass, ...allPlacementClasses);
    stripGhostInteractivity(ghost);
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.left = "0";
    ghost.style.top = "0";
    document.body.appendChild(ghost);
    ghostEl = ghost;
    ghostOffsetX = event.clientX - rect.left;
    ghostOffsetY = event.clientY - rect.top;
    positionGhost(event);
  };

  const applyIndicator = (target: HTMLElement, placement: PointerReorderPlacement) => {
    clearIndicators(target);
    if (placement === "before") target.classList.add(classBefore);
    else if (placement === "after") target.classList.add(classAfter);
    else target.classList.add(classInside);
  };

  const finish = () => {
    document.body.style.removeProperty("user-select");
    document.body.style.removeProperty("cursor");
    if (sourceEl) sourceEl.classList.remove(draggingClass);
    sourceEl = null;
    sourceId = "";
    dragging = false;
    captured = false;
    removeGhost();
    clearIndicators();
  };

  const onMove = (event: PointerEvent) => {
    if (!sourceEl) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (!dragging && Math.hypot(dx, dy) < threshold) return;

    if (!dragging) {
      dragging = true;
      sourceEl.classList.add(draggingClass);
      document.body.style.userSelect = "none";
      document.body.style.cursor = "grabbing";
      if (useDragGhost) createGhost(sourceEl, event);
      try {
        sourceEl.setPointerCapture(event.pointerId);
        captured = true;
      } catch {
        captured = false;
      }
    }

    event.preventDefault();
    positionGhost(event);

    const under = document.elementFromPoint(event.clientX, event.clientY);
    const overContainer = Boolean(under && options.container.contains(under));
    let target =
      under?.closest<HTMLElement>(options.itemSelector) ??
      options.resolveTarget?.(event, sourceId) ??
      null;

    if (!overContainer) {
      clearIndicators();
      return;
    }

    if (!target || target === sourceEl) {
      const offerRoot = options.shouldOfferRootDrop?.(event, sourceId) ?? !options.shouldOfferRootDrop;
      if (offerRoot) {
        clearIndicators();
        options.onOverContainer?.(event);
      } else {
        clearIndicators();
      }
      return;
    }

    const placement = options.resolvePlacement(target, event, sourceId);
    applyIndicator(target, placement);
  };

  const onUp = (event: PointerEvent) => {
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    document.removeEventListener("pointercancel", onUp);

    if (!sourceEl) return;

    if (!dragging) {
      finish();
      return;
    }

    blockNextClick = true;

    if (captured) {
      try {
        sourceEl.releasePointerCapture(event.pointerId);
      } catch {
        /* already released */
      }
    }

    const under = document.elementFromPoint(event.clientX, event.clientY);
    let target =
      under?.closest<HTMLElement>(options.itemSelector) ??
      options.resolveTarget?.(event, sourceId) ??
      null;
    const id = sourceId;

    if (target && target !== sourceEl) {
      const placement = options.resolvePlacement(target, event, id);
      options.onCommit(id, options.getItemId(target), placement);
    } else if (under && options.container.contains(under)) {
      const offerRoot = options.shouldOfferRootDrop?.(event, id) ?? !options.shouldOfferRootDrop;
      if (offerRoot) options.onCommitToRoot?.(id);
    }

    finish();
  };

  let startX = 0;
  let startY = 0;

  options.container.addEventListener(
    "click",
    (event) => {
      if (!blockNextClick) return;
      blockNextClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true
  );

  options.container.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (options.ignoreSelector && (event.target as HTMLElement).closest(options.ignoreSelector)) return;

    const item = (event.target as HTMLElement).closest<HTMLElement>(options.itemSelector);
    if (!item || !options.container.contains(item)) return;

    sourceEl = item;
    sourceId = options.getItemId(item);
    if (!sourceId) {
      sourceEl = null;
      return;
    }

    dragging = false;
    captured = false;
    startX = event.clientX;
    startY = event.clientY;

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  });
}
