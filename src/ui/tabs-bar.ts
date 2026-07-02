export function applyOpenTabOrder(strip: HTMLElement, tabIds: readonly string[]): void {
  for (const id of tabIds) {
    const el = strip.querySelector<HTMLElement>(
      `[data-open-tab="${typeof CSS !== "undefined" && "escape" in CSS ? CSS.escape(id) : id}"]`
    );
    if (el) strip.appendChild(el);
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
