import { t } from "../i18n";
import {
  iconChevronLeft,
  iconChevronRight
} from "../icons";
import { escapeHtml } from "../content-display";
import {
  renderEnvironmentChipButton,
  renderVariablesPopoverButton
} from "../request-popovers";
import { attachTabStripReorder } from "../app/tab-strip-reorder";
import { scheduleSave } from "../app/persistence";
import { getRequest, state } from "../app/state";
import type { SavedRequest, TabState } from "../types";

export function renderRequestActionsTrigger(streamActive: boolean): string {
  const labels = t().request;
  return `
    <button
      type="button"
      id="request-actions-trigger"
      class="tab-actions-trigger${streamActive ? " has-stream" : ""}"
      data-request-actions-trigger
      aria-haspopup="menu"
      aria-expanded="false"
      title="${labels.actions}"
    >
      <span class="tab-actions-label">${labels.actions}</span>
      ${iconChevronRight}
    </button>
  `;
}

export function renderTabBar(
  request: SavedRequest | undefined,
  tab: TabState | null | undefined
): string {
  if (!state.openTabs.length) return "";
  const labels = t().request;
  const tools =
    request && tab
      ? `
      <div class="tab-bar-tools">
        ${renderEnvironmentChipButton()}
        ${renderVariablesPopoverButton()}
        ${renderRequestActionsTrigger(request.streamResponse)}
      </div>`
      : "";
  return `
    <header class="tab-bar">
      <div class="tab-strip-wrap">
        <button class="tab-scroll-btn tab-scroll-back is-hidden" type="button" aria-label="${labels.tabScrollBack}">${iconChevronLeft}</button>
        <div class="tab-strip-viewport">
          <div class="tab-strip">${state.openTabs.map(renderTab).join("")}</div>
        </div>
        <button class="tab-scroll-btn tab-scroll-forward is-hidden" type="button" aria-label="${labels.tabScrollForward}">${iconChevronRight}</button>
      </div>
      <div class="title-bar-drag" data-tauri-drag-region aria-hidden="true"></div>
      ${tools}
    </header>
  `;
}

export function renderTab(requestId: string): string {
  const request = getRequest(requestId);
  if (!request) return "";
  return `
    <div class="request-tab ${state.activeTabId === requestId ? "active" : ""}" data-open-tab="${requestId}" role="tab" aria-selected="${state.activeTabId === requestId}" tabindex="0">
      <span class="tab-label">${escapeHtml(request.title)}</span>
      <button class="mini-btn tab-close field-remove-btn" data-close-tab="${requestId}" type="button" aria-label="${t().dialog.close}">×</button>
    </div>
  `;
}

export function removeStrayTabBars(): void {
  const host = document.querySelector(".title-bar-tabs-host");
  document.querySelectorAll<HTMLElement>(".tab-bar").forEach((bar) => {
    if (host?.contains(bar)) return;
    bar.remove();
  });
}

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

export function updateTabStripActive(): void {
  document.querySelectorAll<HTMLElement>("[data-open-tab]").forEach((element) => {
    const tabId = element.dataset.openTab ?? "";
    const active = tabId === state.activeTabId;
    element.classList.toggle("active", active);
    element.setAttribute("aria-selected", active ? "true" : "false");
  });
}

export function bindTabStripScroll(): void {
  const host = document.querySelector<HTMLElement>(".title-bar-tabs-host");
  const wrap = host?.querySelector<HTMLElement>(".tab-strip-wrap");
  if (!wrap || wrap.dataset.scrollBound === "true") return;

  const viewport = wrap.querySelector<HTMLElement>(".tab-strip-viewport");
  const strip = wrap.querySelector<HTMLElement>(".tab-strip");
  const back = wrap.querySelector<HTMLButtonElement>(".tab-scroll-back");
  const forward = wrap.querySelector<HTMLButtonElement>(".tab-scroll-forward");
  if (!viewport || !strip || !back || !forward) return;

  wrap.dataset.scrollBound = "true";

  const scrollByPage = (direction: -1 | 1) => {
    const delta = Math.max(120, viewport.clientWidth * 0.65) * direction;
    viewport.scrollBy({ left: delta, behavior: "smooth" });
  };

  back.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    scrollByPage(-1);
  });
  forward.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    scrollByPage(1);
  });

  viewport.addEventListener("scroll", updateTabStripScroll, { passive: true });
  const observer = new ResizeObserver(() => updateTabStripScroll());
  observer.observe(viewport);
  observer.observe(strip);
  requestAnimationFrame(updateTabStripScroll);
}

export function bindTabBar(options: {
  closeTab: (id: string) => void;
  openRequest: (id: string) => void;
}): void {
  const boundKey = "__restpilotTabBarUi";
  const win = window as Window & { [boundKey]?: boolean };
  if (win[boundKey]) return;
  win[boundKey] = true;

  const tabHost = () => document.querySelector<HTMLElement>(".title-bar-tabs-host");

  document.addEventListener("click", (event) => {
    const host = tabHost();
    const strip = host?.querySelector(".tab-strip");
    if (!strip?.contains(event.target as Node)) return;

    const closeTarget = (event.target as HTMLElement).closest<HTMLElement>("[data-close-tab]");
    if (closeTarget) {
      event.preventDefault();
      event.stopPropagation();
      options.closeTab(closeTarget.getAttribute("data-close-tab") ?? "");
      return;
    }
    const tabEl = (event.target as HTMLElement).closest<HTMLElement>("[data-open-tab]");
    if (tabEl) options.openRequest(tabEl.dataset.openTab ?? "");
  });

  document.addEventListener("auxclick", (event) => {
    if (event.button !== 1) return;
    const host = tabHost();
    const strip = host?.querySelector(".tab-strip");
    if (!strip?.contains(event.target as Node)) return;

    const tabEl = (event.target as HTMLElement).closest<HTMLElement>("[data-open-tab]");
    if (!tabEl || (event.target as HTMLElement).closest("[data-close-tab]")) return;
    event.preventDefault();
    options.closeTab(tabEl.dataset.openTab ?? "");
  });

  document.addEventListener("mousedown", (event) => {
    if (event.button !== 1) return;
    const host = tabHost();
    const strip = host?.querySelector(".tab-strip");
    if (!strip?.contains(event.target as Node)) return;

    const tabEl = (event.target as HTMLElement).closest<HTMLElement>("[data-open-tab]");
    if (!tabEl || (event.target as HTMLElement).closest("[data-close-tab]")) return;
    event.preventDefault();
    options.closeTab(tabEl.dataset.openTab ?? "");
  });

  attachTabStripReorder({
    getHost: tabHost,
    getTabIds: () => state.openTabs,
    onCommit: (next) => {
      state.openTabs = next;
      scheduleSave();
      const strip = tabHost()?.querySelector<HTMLElement>(".tab-strip");
      if (strip) applyOpenTabOrder(strip, next);
      updateTabStripActive();
      requestAnimationFrame(updateTabStripScroll);
    }
  });
}
