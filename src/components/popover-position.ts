const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 6;
const MIN_POPOVER_HEIGHT = 120;

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
