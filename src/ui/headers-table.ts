import { escapeHtml } from "../lib/content-display";

export type HeaderRow = { key: string; value: string };

export type HeadersTableLabels = {
  search: string;
  key: string;
  value: string;
  empty: string;
};

const ROW_HEIGHT = 32;
const OVERSCAN = 8;

export function mountHeadersTable(host: HTMLElement, rows: HeaderRow[], labels: HeadersTableLabels): () => void {
  host.classList.add("headers-table-host");
  host.innerHTML = `
    <div class="headers-table-toolbar">
      <input class="headers-table-search" type="search" placeholder="${escapeAttribute(labels.search)}" spellcheck="false" />
    </div>
    <div class="headers-table-frame">
      <div class="headers-table-head" aria-hidden="true">
        <span>${escapeHtml(labels.key)}</span>
        <span>${escapeHtml(labels.value)}</span>
      </div>
      <div class="headers-table-scroll" tabindex="0">
        <div class="headers-table-spacer"></div>
        <div class="headers-table-window"></div>
      </div>
    </div>
    <p class="headers-table-empty hidden">${escapeHtml(labels.empty)}</p>
  `;

  const search = host.querySelector<HTMLInputElement>(".headers-table-search");
  const scroll = host.querySelector<HTMLElement>(".headers-table-scroll");
  const spacer = host.querySelector<HTMLElement>(".headers-table-spacer");
  const windowEl = host.querySelector<HTMLElement>(".headers-table-window");
  const emptyEl = host.querySelector<HTMLElement>(".headers-table-empty");
  if (!search || !scroll || !spacer || !windowEl || !emptyEl) return () => host.replaceChildren();

  let filtered = rows;
  let frame = 0;

  const setSpacerHeight = () => {
    spacer.style.height = `${Math.max(filtered.length, 0) * ROW_HEIGHT}px`;
  };

  const paint = () => {
    const hasRows = filtered.length > 0;
    emptyEl.classList.toggle("hidden", hasRows);
    scroll.classList.toggle("hidden", !hasRows);
    if (!hasRows) {
      windowEl.replaceChildren();
      return;
    }

    const height = scroll.clientHeight || 1;
    const start = Math.max(0, Math.floor(scroll.scrollTop / ROW_HEIGHT) - OVERSCAN);
    const end = Math.min(filtered.length, Math.ceil((scroll.scrollTop + height) / ROW_HEIGHT) + OVERSCAN);
    windowEl.style.transform = `translateY(${start * ROW_HEIGHT}px)`;
    windowEl.innerHTML = filtered
      .slice(start, end)
      .map(
        (row) => `
      <div class="headers-table-row">
        <span class="headers-table-key">${escapeHtml(row.key)}</span>
        <span class="headers-table-value">${escapeHtml(row.value)}</span>
      </div>`
      )
      .join("");
  };

  const schedulePaint = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(paint);
  };

  const onSearch = () => {
    const needle = search.value.trim().toLowerCase();
    filtered = needle
      ? rows.filter((row) => row.key.toLowerCase().includes(needle) || row.value.toLowerCase().includes(needle))
      : rows;
    scroll.scrollTop = 0;
    setSpacerHeight();
    schedulePaint();
  };

  search.addEventListener("input", onSearch);
  scroll.addEventListener("scroll", schedulePaint, { passive: true });
  const resizeObserver = new ResizeObserver(schedulePaint);
  resizeObserver.observe(scroll);

  setSpacerHeight();
  paint();

  return () => {
    cancelAnimationFrame(frame);
    search.removeEventListener("input", onSearch);
    scroll.removeEventListener("scroll", schedulePaint);
    resizeObserver.disconnect();
    host.classList.remove("headers-table-host");
    host.replaceChildren();
  };
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
