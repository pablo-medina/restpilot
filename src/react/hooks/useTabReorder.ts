import { useLayoutEffect } from "react";
import { applyOpenTabOrder, scrollActiveTabIntoView, updateTabStripScroll } from "../../ui/tabs-bar";
import { scheduleSave } from "../../app/persistence";
import { attachTabStripReorder } from "../../app/tab-strip-reorder";
import { setState, state } from "../../app/state";

type Options = {
  stripRef: React.RefObject<HTMLDivElement | null>;
  refresh: () => void;
};

export function useTabReorder({ stripRef, refresh }: Options): void {
  useLayoutEffect(() => {
    if (!state.openTabs.length) return;
    const strip = stripRef.current;
    const wrap = strip?.closest<HTMLElement>(".tab-strip-wrap");
    const viewport = wrap?.querySelector<HTMLElement>(".tab-strip-viewport");
    if (!strip || !viewport) return;

    const onScroll = () => updateTabStripScroll();
    viewport.addEventListener("scroll", onScroll, { passive: true });
    const observer = new ResizeObserver(() => updateTabStripScroll());
    observer.observe(viewport);
    observer.observe(strip);
    requestAnimationFrame(() => {
      updateTabStripScroll();
      scrollActiveTabIntoView();
    });

    attachTabStripReorder({
      getHost: () => strip.closest<HTMLElement>(".tab-strip-wrap")?.parentElement ?? null,
      getTabIds: () => state.openTabs,
      onCommit: (next) => {
        setState(prev => ({ ...prev, openTabs: [...next] }));
        scheduleSave();
        applyOpenTabOrder(strip, next);
        requestAnimationFrame(() => {
          updateTabStripScroll();
          scrollActiveTabIntoView();
        });
        refresh();
      }
    });

    return () => {
      viewport.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, state.openTabs.join("|"), state.activeTabId]);
}
