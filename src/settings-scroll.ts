/** Preserve `.settings-view` scroll position across full re-renders. */

export function getSettingsScrollTop(): number | null {
  const view = document.querySelector<HTMLElement>(".settings-view");
  if (!view) return null;
  return view.scrollTop;
}

export function restoreSettingsScrollTop(scrollTop: number | null) {
  if (scrollTop === null) return;
  requestAnimationFrame(() => {
    const view = document.querySelector<HTMLElement>(".settings-view");
    if (view) view.scrollTop = scrollTop;
  });
}
