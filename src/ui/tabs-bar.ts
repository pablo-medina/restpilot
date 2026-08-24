export function applyOpenTabOrder(strip: HTMLElement, tabIds: readonly string[]): void {
  for (const id of tabIds) {
    const el = strip.querySelector<HTMLElement>(
      `[data-open-tab="${typeof CSS !== "undefined" && "escape" in CSS ? CSS.escape(id) : id}"]`
    );
    if (el) strip.appendChild(el);
  }
}

/** One measure-and-scroll pass. `true` when it moved the viewport. */
function alignActiveTab(behavior: ScrollBehavior): boolean {
  const wrap = document.querySelector<HTMLElement>(".title-bar-tabs-host .tab-strip-wrap");
  if (!wrap) return false;

  const viewport = wrap.querySelector<HTMLElement>(".tab-strip-viewport");
  const strip = wrap.querySelector<HTMLElement>(".tab-strip");
  if (!viewport || !strip || strip.classList.contains("is-reordering")) return false;

  const tab = strip.querySelector<HTMLElement>(".request-tab.active");
  if (!tab) return false;

  const tabRect = tab.getBoundingClientRect();
  const viewRect = viewport.getBoundingClientRect();
  if (!tabRect.width || !viewRect.width) return false;

  // Stop short of the edge so the neighbouring tab still peeks in and the strip keeps
  // reading as scrollable. Never more than the slack a tab this wide leaves.
  const peek = Math.min(24, Math.max(0, (viewRect.width - tabRect.width) / 2));
  let left = viewport.scrollLeft;
  if (tabRect.left < viewRect.left + peek) {
    left += tabRect.left - viewRect.left - peek;
  } else if (tabRect.right > viewRect.right - peek) {
    left += tabRect.right - viewRect.right + peek;
  } else {
    return false;
  }

  const max = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
  const next = Math.max(0, Math.min(left, max));
  if (Math.abs(next - viewport.scrollLeft) < 1) return false;

  viewport.scrollTo({ left: next, behavior });
  return true;
}

/**
 * Brings the active tab fully inside the scroll viewport. The strip is a plain overflow
 * container, so nothing scrolls it on its own when the active tab changes from the tree, a
 * keyboard shortcut or a closed neighbour — the tab would simply sit off-screen.
 *
 * Two passes, because revealing a scroll arrow takes 26px off the viewport and can put the
 * tab we just scrolled to back under that arrow. No-op while a reorder drag is running:
 * the pointer owns the scroll then.
 */
export function scrollActiveTabIntoView(behavior: ScrollBehavior = "auto"): void {
  for (let pass = 0; pass < 2 && alignActiveTab(behavior); pass += 1) {
    updateTabStripScroll();
  }
}

export function updateTabStripScroll(): void {
  const wrap = document.querySelector<HTMLElement>(".title-bar-tabs-host .tab-strip-wrap");
  if (!wrap) return;

  const viewport = wrap.querySelector<HTMLElement>(".tab-strip-viewport");
  const strip = wrap.querySelector<HTMLElement>(".tab-strip");
  const back = wrap.querySelector<HTMLButtonElement>(".tab-scroll-back");
  const forward = wrap.querySelector<HTMLButtonElement>(".tab-scroll-forward");
  if (!viewport || !strip || !back || !forward) return;

  const overflow = strip.scrollWidth > viewport.clientWidth + 1;
  const atStart = viewport.scrollLeft <= 1;
  const atEnd = viewport.scrollLeft + viewport.clientWidth >= viewport.scrollWidth - 1;
  const showBack = overflow && !atStart;
  const showForward = overflow && !atEnd;
  wrap.classList.toggle("has-overflow", overflow);
  wrap.classList.toggle("has-scroll-back", showBack);
  wrap.classList.toggle("has-scroll-forward", showForward);
  back.classList.toggle("is-hidden", !showBack);
  forward.classList.toggle("is-hidden", !showForward);
}
