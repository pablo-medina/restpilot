import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { hasOpenDialogs } from "../components/dialogs";
import { t } from "../i18n";

export type WindowPlatform = "windows" | "macos" | "linux" | "web";

const iconMaximize = `<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.1" d="M2.5 2.5h7v7h-7z"/></svg>`;

const iconRestore = `<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1" d="M5.5 2H10V6.5H5.5z"/><path fill="none" stroke="currentColor" stroke-width="1" d="M2 5H6.5V10H2z"/></svg>`;

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

export async function syncMaximizeControl() {
  const button = document.querySelector<HTMLButtonElement>('[data-window-action="maximize"]');
  if (!button || !isTauri()) return;
  const labels = t().titleBar;
  const maximized = await getCurrentWindow().isMaximized();
  const icon = button.querySelector<HTMLElement>(".title-bar-icon") ?? button;
  button.classList.toggle("is-restored", maximized);
  button.title = maximized ? labels.restore : labels.maximize;
  button.setAttribute("aria-label", maximized ? labels.restore : labels.maximize);
  icon.innerHTML = maximized ? iconRestore : iconMaximize;
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
      "[data-window-action], [data-title-bar-settings], [data-title-bar-sidebar], .request-tab, .tab-close, .tab-scroll-btn, .tab-bar-tools button, .env-chip"
    )
  );
}

export function bindWindowChrome() {
  const bar = document.querySelector<HTMLElement>(".title-bar");
  if (!bar) return;

  if (usesNativeTitleBarDoubleClickMaximize()) return;

  bar.addEventListener("dblclick", (event) => {
    if (hasOpenDialogs()) return;
    if (isTitleBarDoubleClickIgnored(event.target)) return;
    if (!(event.target as HTMLElement).closest("[data-tauri-drag-region], .title-bar-center, .title-bar-drag")) return;
    if (!isTauri()) return;
    void getCurrentWindow().toggleMaximize().then(() => syncMaximizeControl());
  });
}
