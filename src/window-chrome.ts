import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { hasOpenDialogs } from "./components/dialogs";
import { t } from "./i18n";

export type WindowPlatform = "windows" | "macos" | "linux" | "web";

const iconMinimize = `<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M2 6.5h8v-1H2z"/></svg>`;

const iconMaximize = `<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.1" d="M2.5 2.5h7v7h-7z"/></svg>`;

const iconRestore = `<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1" d="M5.5 2H10V6.5H5.5z"/><path fill="none" stroke="currentColor" stroke-width="1" d="M2 5H6.5V10H2z"/></svg>`;

const iconClose = `<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" d="M3 3l6 6M9 3 3 9"/></svg>`;

let chromeReady = false;
let maximizeListenerBound = false;

export function detectWindowPlatform(): WindowPlatform {
  if (!isTauri()) return "web";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "macos";
  if (ua.includes("linux")) return "linux";
  return "windows";
}

export function initWindowChrome() {
  const platform = detectWindowPlatform();
  document.documentElement.dataset.windowPlatform = platform;
  if (!isTauri() || chromeReady) return;
  chromeReady = true;
  void syncMaximizeControl();
  if (maximizeListenerBound) return;
  maximizeListenerBound = true;
  void getCurrentWindow().onResized(() => {
    void syncMaximizeControl();
  });
}

export function renderWindowChromeMarkup(options?: { center?: string }): string {
  const labels = t().titleBar;
  const platform = detectWindowPlatform();
  const showControls = platform === "windows" || platform === "linux";
  const center = options?.center?.trim() || t().app.name;

  const controls = showControls
    ? `<div class="title-bar-controls" role="group" aria-label="${labels.windowControls}">
        <button type="button" class="title-bar-control" data-window-action="minimize" title="${labels.minimize}" aria-label="${labels.minimize}">
          ${iconMinimize}
        </button>
        <button type="button" class="title-bar-control" data-window-action="maximize" title="${labels.maximize}" aria-label="${labels.maximize}">
          ${iconMaximize}
        </button>
        <button type="button" class="title-bar-control title-bar-control--close" data-window-action="close" title="${labels.close}" aria-label="${labels.close}">
          ${iconClose}
        </button>
      </div>`
    : "";

  return `
    <header class="title-bar title-bar--${platform}" aria-label="${labels.ariaLabel}">
      <div class="title-bar-center" data-tauri-drag-region>
        <span class="title-bar-center-text">${center}</span>
      </div>
      ${controls}
    </header>
  `;
}

/** Request workspace: tab strip in the title bar instead of a centered title. */
export function renderWindowChromeTabsMarkup(tabsMarkup: string): string {
  const labels = t().titleBar;
  const platform = detectWindowPlatform();
  const showControls = platform === "windows" || platform === "linux";

  const controls = showControls
    ? `<div class="title-bar-controls" role="group" aria-label="${labels.windowControls}">
        <button type="button" class="title-bar-control" data-window-action="minimize" title="${labels.minimize}" aria-label="${labels.minimize}">
          ${iconMinimize}
        </button>
        <button type="button" class="title-bar-control" data-window-action="maximize" title="${labels.maximize}" aria-label="${labels.maximize}">
          ${iconMaximize}
        </button>
        <button type="button" class="title-bar-control title-bar-control--close" data-window-action="close" title="${labels.close}" aria-label="${labels.close}">
          ${iconClose}
        </button>
      </div>`
    : "";

  const tabsHostClass = tabsMarkup.trim()
    ? "title-bar-tabs-host"
    : "title-bar-tabs-host title-bar-tabs-host--empty";

  return `
    <header class="title-bar title-bar--tabs title-bar--${platform}" aria-label="${labels.ariaLabel}">
      <div class="${tabsHostClass}"${tabsMarkup.trim() ? "" : ' aria-hidden="true"'}>${tabsMarkup}</div>
      <div class="title-bar-drag" data-tauri-drag-region aria-hidden="true"></div>
      ${controls}
    </header>
  `;
}

export async function syncMaximizeControl() {
  const button = document.querySelector<HTMLButtonElement>('[data-window-action="maximize"]');
  if (!button || !isTauri()) return;
  const labels = t().titleBar;
  const maximized = await getCurrentWindow().isMaximized();
  button.classList.toggle("is-restored", maximized);
  button.title = maximized ? labels.restore : labels.maximize;
  button.setAttribute("aria-label", maximized ? labels.restore : labels.maximize);
  button.innerHTML = maximized ? iconRestore : iconMaximize;
}

/** Windows/Linux already toggle maximize on double-click via Tauri drag regions. */
function usesNativeTitleBarDoubleClickMaximize(): boolean {
  if (!isTauri()) return false;
  const platform = detectWindowPlatform();
  return platform === "windows" || platform === "linux";
}

function isTitleBarDoubleClickIgnored(target: EventTarget | null): boolean {
  return Boolean(
    (target as HTMLElement | null)?.closest(
      "[data-window-action], .request-tab, .tab-close, .tab-scroll-btn, .tab-bar-tools button, .env-chip"
    )
  );
}

export function bindWindowChrome() {
  const bar = document.querySelector<HTMLElement>(".title-bar");
  if (!bar) return;

  bar.querySelectorAll<HTMLButtonElement>("[data-window-action]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      void runWindowAction(button.dataset.windowAction);
    });
  });

  if (usesNativeTitleBarDoubleClickMaximize()) return;

  bar.addEventListener("dblclick", (event) => {
    if (hasOpenDialogs()) return;
    if (isTitleBarDoubleClickIgnored(event.target)) return;
    if (!(event.target as HTMLElement).closest("[data-tauri-drag-region], .title-bar-center, .title-bar-drag")) return;
    if (!isTauri()) return;
    void getCurrentWindow().toggleMaximize().then(() => syncMaximizeControl());
  });
}

async function runWindowAction(action: string | undefined) {
  if (!isTauri() || !action || hasOpenDialogs()) return;
  const window = getCurrentWindow();
  if (action === "minimize") {
    await window.minimize();
    return;
  }
  if (action === "maximize") {
    await window.toggleMaximize();
    await syncMaximizeControl();
    return;
  }
  if (action === "close") {
    await window.close();
  }
}
