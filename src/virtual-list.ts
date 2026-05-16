import { sliceLine } from "./content-display";

export type VirtualListOptions = {
  lineHeight?: number;
  overscan?: number;
};

export type VirtualListHandle = {
  update: (source: string, offsets: number[]) => void;
  destroy: () => void;
};

export function mountVirtualList(
  host: HTMLElement,
  source: string,
  offsets: number[],
  options: VirtualListOptions = {}
): () => void {
  const lineHeight = options.lineHeight ?? 20;
  const overscan = options.overscan ?? 10;

  host.classList.add("virtual-list-host");
  host.innerHTML = `
    <div class="virtual-list-scroll" tabindex="0">
      <div class="virtual-list-spacer"></div>
      <pre class="virtual-list-window" aria-label="Response body"></pre>
    </div>
  `;

  const scroll = host.querySelector<HTMLElement>(".virtual-list-scroll");
  const spacer = host.querySelector<HTMLElement>(".virtual-list-spacer");
  const windowEl = host.querySelector<HTMLElement>(".virtual-list-window");
  if (!scroll || !spacer || !windowEl) return () => host.replaceChildren();

  let currentSource = source;
  let currentOffsets = offsets;
  let frame = 0;

  const setSpacerHeight = () => {
    spacer.style.height = `${Math.max(currentOffsets.length, 1) * lineHeight}px`;
  };

  const paint = () => {
    const lineCount = Math.max(currentOffsets.length, 1);
    const height = scroll.clientHeight || 1;
    const start = Math.max(0, Math.floor(scroll.scrollTop / lineHeight) - overscan);
    const end = Math.min(lineCount, Math.ceil((scroll.scrollTop + height) / lineHeight) + overscan);
    windowEl.style.transform = `translateY(${start * lineHeight}px)`;
    const chunks: string[] = [];
    for (let i = start; i < end; i++) chunks.push(sliceLine(currentSource, currentOffsets, i));
    windowEl.textContent = chunks.join("\n");
  };

  const onScroll = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(paint);
  };

  const handle: VirtualListHandle = {
    update(nextSource, nextOffsets) {
      currentSource = nextSource;
      currentOffsets = nextOffsets;
      setSpacerHeight();
      onScroll();
    },
    destroy() {
      cancelAnimationFrame(frame);
      scroll.removeEventListener("scroll", onScroll);
      resizeObserver.disconnect();
      host.replaceChildren();
    }
  };

  (host as HTMLElement & { __virtualList?: VirtualListHandle }).__virtualList = handle;

  setSpacerHeight();
  scroll.addEventListener("scroll", onScroll, { passive: true });
  const resizeObserver = new ResizeObserver(onScroll);
  resizeObserver.observe(scroll);
  paint();

  return () => {
    delete (host as HTMLElement & { __virtualList?: VirtualListHandle }).__virtualList;
    handle.destroy();
  };
}

export function updateVirtualList(host: HTMLElement, source: string, offsets: number[]) {
  const handle = (host as HTMLElement & { __virtualList?: VirtualListHandle }).__virtualList;
  if (handle) {
    handle.update(source, offsets);
    return true;
  }
  return false;
}
