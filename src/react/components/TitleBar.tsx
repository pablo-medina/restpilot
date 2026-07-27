import { useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getActiveRequest, state } from "../../app/state";
import { hasOpenDialogs } from "../../components/dialogs";
import { t } from "../../i18n";
import {
  detectWindowPlatform,
  initWindowChrome,
  syncMaximizeControl
} from "../../ui/window-chrome";
import { iconSettings, iconSidebar } from "../../lib/icons";
import { useRenderGeneration } from "../hooks/useRenderGeneration";
import { openSettingsDialog } from "../lib/settings-dialog";
import { toggleSidebar } from "../lib/sync-app-frame";
import { TabBar } from "./TabBar";

const iconMinimize = `<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M2 6.5h8v-1H2z"/></svg>`;
const iconMaximize = `<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.1" d="M2.5 2.5h7v7h-7z"/></svg>`;
const iconClose = `<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" d="M3 3l6 6M9 3 3 9"/></svg>`;

type Props = {
  refresh: () => void;
};

async function runWindowAction(action: string): Promise<void> {
  if (!isTauri() || hasOpenDialogs()) return;
  const win = getCurrentWindow();
  if (action === "minimize") { await win.minimize(); return; }
  if (action === "maximize") { await win.toggleMaximize(); await syncMaximizeControl(); return; }
  if (action === "close") { await win.close(); }
}

function resolveTitleBarCenter(): string {
  if (state.activePanel === "settings") return t().settings.title;
  if (state.activePanel === "functions") return "";
  const request = getActiveRequest();
  if (request?.title.trim()) return request.title.trim();
  return t().app.name;
}

export function TitleBar({ refresh }: Props) {
  useRenderGeneration();
  const platform = detectWindowPlatform();
  const showControls = platform === "windows" || platform === "linux";
  const labels = t().titleBar;
  const nav = t().nav;
  const settingsActive = false;
  const useTabsChrome = state.activePanel === "request" && state.openTabs.length > 0;
  const center = resolveTitleBarCenter();
  const sidebarLabel = state.sidebarVisible ? nav.hideSidebar : nav.showSidebar;

  useEffect(() => {
    initWindowChrome();
    void syncMaximizeControl();
  }, []);

  const controls = showControls ? (
    <div className="title-bar-controls" role="group" aria-label={labels.windowControls}>
      <button
        type="button"
        className="title-bar-control"
        data-window-action="minimize"
        title={labels.minimize}
        aria-label={labels.minimize}
        onClick={() => void runWindowAction("minimize")}
      >
        <span className="title-bar-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: iconMinimize }} />
      </button>
      <button
        type="button"
        className="title-bar-control"
        data-window-action="maximize"
        title={labels.maximize}
        aria-label={labels.maximize}
        onClick={() => void runWindowAction("maximize")}
      >
        <span className="title-bar-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: iconMaximize }} />
      </button>
      <button
        type="button"
        className="title-bar-control title-bar-control--close"
        data-window-action="close"
        title={labels.close}
        aria-label={labels.close}
        onClick={() => void runWindowAction("close")}
      >
        <span className="title-bar-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: iconClose }} />
      </button>
    </div>
  ) : null;

  const sidebarToggle = (
    <button
      type="button"
      className={`title-bar-sidebar-toggle${state.sidebarVisible ? " is-active" : ""}`}
      data-title-bar-sidebar
      title={sidebarLabel}
      aria-label={sidebarLabel}
      aria-pressed={state.sidebarVisible}
      onClick={() => toggleSidebar(refresh)}
    >
      <span className="title-bar-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: iconSidebar }} />
    </button>
  );

  const settingsButton = (
    <button
      type="button"
      className={`title-bar-settings${settingsActive ? " is-active" : ""}`}
      data-title-bar-settings
      title={nav.settings}
      aria-label={nav.settings}
      aria-current={settingsActive ? "page" : "false"}
      onClick={() => openSettingsDialog()}
    >
      <span className="title-bar-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: iconSettings }} />
    </button>
  );

  if (useTabsChrome) {
    const tabsHostClass = "title-bar-tabs-host";
    return (
      <header className={`title-bar title-bar--tabs title-bar--${platform}`} aria-label={labels.ariaLabel}>
        <div className="title-bar-leading">{sidebarToggle}</div>
        <div className={tabsHostClass}>
          <TabBar refresh={refresh} embedded />
        </div>
        <div className="title-bar-drag" data-tauri-drag-region aria-hidden="true" />
        <div className="title-bar-actions">
          {settingsButton}
          {controls}
        </div>
      </header>
    );
  }

  return (
    <header className={`title-bar title-bar--${platform}`} aria-label={labels.ariaLabel}>
      <div className="title-bar-leading">{sidebarToggle}</div>
      <div className="title-bar-center" data-tauri-drag-region>
        <span className="title-bar-center-text">{center}</span>
      </div>
      <div className="title-bar-actions">
        {settingsButton}
        {controls}
      </div>
    </header>
  );
}
