const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 6;
const MIN_POPOVER_HEIGHT = 120;
const MIN_MENU_HEIGHT = 96;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

export type PopoverPlacement = "below" | "above";

export type PopoverPosition = {
  left: number;
  top: number;
  placement: PopoverPlacement;
  maxHeight: number | null;
};

/** Compute viewport-safe popover position for a given anchor and measured size. */
export function computePopoverPosition(
  anchorRect: DOMRect,
  size: { width: number; height: number },
  viewport = { width: window.innerWidth, height: window.innerHeight }
): PopoverPosition {
  const width = size.width;
  const height = size.height;

  let left = anchorRect.left;
  if (left + width > viewport.width - VIEWPORT_MARGIN) {
    left = anchorRect.right - width;
  }
  left = Math.max(VIEWPORT_MARGIN, Math.min(left, viewport.width - width - VIEWPORT_MARGIN));

  const spaceBelow = viewport.height - anchorRect.bottom - ANCHOR_GAP - VIEWPORT_MARGIN;
  const spaceAbove = anchorRect.top - ANCHOR_GAP - VIEWPORT_MARGIN;

  const preferBelow = spaceBelow >= spaceAbove || spaceBelow >= MIN_POPOVER_HEIGHT;
  const placement: PopoverPlacement = preferBelow ? "below" : "above";
  const available = placement === "below" ? spaceBelow : spaceAbove;

  const maxHeight = height > available ? Math.max(MIN_POPOVER_HEIGHT, available) : null;
  const fittedHeight = maxHeight ?? height;

  let top =
    placement === "below"
      ? anchorRect.bottom + ANCHOR_GAP
      : anchorRect.top - ANCHOR_GAP - fittedHeight;

  top = Math.max(VIEWPORT_MARGIN, Math.min(top, viewport.height - fittedHeight - VIEWPORT_MARGIN));

  return { left, top, placement, maxHeight };
}

/** Horizontal direction a point-anchored menu grows toward. */
export type MenuAlign = "start" | "end";

export type MenuPosition = {
  left: number;
  top: number;
  maxHeight: number | null;
};

/**
 * Compute a viewport-safe position for a menu anchored to a point (cursor or trigger corner).
 *
 * Unlike `computePopoverPosition` there is no anchor box to sit beside: the menu opens from the
 * point, flips to the opposite side when it would be clipped, and finally clamps into the
 * viewport. `maxHeight` is returned when even the roomier side is too short, so the caller can
 * make the menu scroll instead of letting options fall off-screen.
 */
export function computeMenuPosition(
  point: { x: number; y: number },
  size: { width: number; height: number },
  viewport = { width: window.innerWidth, height: window.innerHeight },
  align: MenuAlign = "start"
): MenuPosition {
  const width = Math.min(size.width, Math.max(0, viewport.width - VIEWPORT_MARGIN * 2));

  let left = align === "end" ? point.x - width : point.x;
  if (align === "end") {
    // Preferred side is to the left of the point; fall back to the right when it does not fit.
    if (left < VIEWPORT_MARGIN && point.x + width <= viewport.width - VIEWPORT_MARGIN) {
      left = point.x;
    }
  } else if (left + width > viewport.width - VIEWPORT_MARGIN && point.x - width >= VIEWPORT_MARGIN) {
    left = point.x - width;
  }
  left = clamp(left, VIEWPORT_MARGIN, viewport.width - width - VIEWPORT_MARGIN);

  const spaceBelow = viewport.height - point.y - VIEWPORT_MARGIN;
  const spaceAbove = point.y - VIEWPORT_MARGIN;
  const openUp = size.height > spaceBelow && spaceAbove > spaceBelow;

  const available = Math.max(MIN_MENU_HEIGHT, openUp ? spaceAbove : spaceBelow);
  const maxHeight = size.height > available ? available : null;
  const fittedHeight = maxHeight ?? size.height;

  let top = openUp ? point.y - fittedHeight : point.y;
  top = clamp(top, VIEWPORT_MARGIN, viewport.height - fittedHeight - VIEWPORT_MARGIN);

  return { left, top, maxHeight };
}

const SUBMENU_OVERLAP = 4;
const SUBMENU_RISE = 5;

/**
 * Offsets (relative to the parent menu item) for a flyout submenu that opens beside it.
 *
 * Everything is derived from the item's rect, never from the panel's own measured overflow —
 * the panel already carries the offsets from its previous open, so measuring it makes the
 * decision sticky and the flip never reverts.
 */
export function computeSubmenuOffset(
  itemRect: { left: number; right: number; top: number },
  size: { width: number; height: number },
  viewport = { width: window.innerWidth, height: window.innerHeight }
): { left: number; top: number } {
  const rightSide = itemRect.right - SUBMENU_OVERLAP;
  const leftSide = itemRect.left - size.width + SUBMENU_OVERLAP;

  const fitsRight = rightSide + size.width <= viewport.width - VIEWPORT_MARGIN;
  const fitsLeft = leftSide >= VIEWPORT_MARGIN;

  const targetLeft =
    fitsRight || !fitsLeft
      ? clamp(rightSide, VIEWPORT_MARGIN, viewport.width - size.width - VIEWPORT_MARGIN)
      : leftSide;

  const targetTop = clamp(
    itemRect.top - SUBMENU_RISE,
    VIEWPORT_MARGIN,
    viewport.height - size.height - VIEWPORT_MARGIN
  );

  return { left: targetLeft - itemRect.left, top: targetTop - itemRect.top };
}
