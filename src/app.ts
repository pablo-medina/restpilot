import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  applicationDialog,
  bindDialogs,
  initDialogs,
  messageDialog,
  renderDialogLayer
} from "./components/dialogs";
import {
  bodySourceKey,
  escapeHtml,
  detectContentKind,
  formatResponseBody,
  highlightResponse,
  isLargeText,
  tryPrettifyJson
} from "./content-display";
import {
  applyCurlToRequest,
  bodyModeCurlLabel,
  curlPreviewPayload,
  looksLikeCurl,
  parseCurl,
  rawTypeCurlLabel,
  requestToCurl
} from "./curl";
import { mountHeadersTable } from "./headers-table";
import { getEditorRuntime, preloadEditorRuntime } from "./app/editor-runtime";
import { renderActivityBarMarkup, renderCollectionSidebarShell, renderFunctionsSidebarShell } from "./app/shell-ui";
import {
  iconChevronLeft,
  iconChevronRight,
  iconCopy,
  iconDuplicate,
  iconExport,
  iconFolderAdd,
  iconFunction,
  iconFunctionAdd,
  iconImport,
  iconRemove,
  iconRename,
  iconRequestAdd,
  iconMoon,
  iconSearch,
  iconSun
} from "./icons";

import { exportCollection, importCollection } from "./app/collection-io";
import { getLocale, setLocale, t } from "./i18n";
import { bindSettings, renderSettings, resetSettingsSessionState } from "./settings";
import {
  bindRequestPopoverTriggers,
  closeRequestPopovers,
  renderEnvironmentChipButton,
  renderVariablesPopoverButton,
  setRequestPopoverHooks,
  syncRequestPopover
} from "./request-popovers";
import { bindVariablesWorkspace, renderVariablesWorkspace } from "./variables-workspace";
import { environmentChipLabel, getEffectiveVariables, getActiveEnvironment, activeEnvironmentVariables } from "./app/environments";
import { buildRequestUrl, ingestUrlIntoRequest, migrateRequestQuery } from "./url-params";
import { resolvedOutboundUrl, normalizeRequestAuth, defaultRequestAuth } from "./app/request-auth";
import { hiddenClass } from "./ui/visibility";
import { bindAuthPanel, renderAuthPanel } from "./request-auth-panel";
import {
  removePopovers,
  renderPopoverShell,
  mountPopover,
  bindPopoverClose
} from "./components/popover";
import {
  applyVariables,
  displayRequestUrl,
  requestUsesSecretVariables,
  resolvedRequestUrl,
  shouldShowUrlPreview,
  variablesForCurl
} from "./variables";
import "./styles.css";
import {
  clampTabSize,
  defaultConfig,
  type ActivePanel,
  type ApiResponse,
  type AppFunction,
  type BodyMode,
  type FormPartType,
  type Pair,
  type RawType,
  type RequestAuth,
  type RequestTab,
  type ResponseTab,
  type SavedRequest,
  type TabState,
  type TreeItem,
  type Variable
} from "./types";
import { duplicateFolderItem, duplicateRequestItem } from "./app/collection-duplicate";
import {
  collectionSearchVisibleIds,
  folderExpandedForSearch
} from "./app/collection-search";
import { insertItemAt, moveDroppedItem, moveItemTo } from "./app/collection-store";
import { attachTabStripReorder } from "./app/tab-strip-reorder";
import { finishBoot } from "./app/boot-loader";
import { shouldOfferTreeRootDrop, treeRowAtPointer } from "./app/collection-tree-drag";
import { attachPointerReorder, type PointerReorderPlacement } from "./app/pointer-reorder";
import {
  applyUserSettings,
  loadStoredConfig,
  persistConfig,
  proxyPayload,
  scheduleSave
} from "./app/persistence";
import { resetAppStateToDefaults } from "./app/reset-app-state";
import { render, setRenderApp } from "./app/render";
import {
  blankRequest,
  buildFormPayload,
  buildRequestHeaders,
  networkPayload,
  withContentType
} from "./app/request-utils";
import {
  hasMissingMultipartFiles,
  missingMultipartFileNames
} from "./request-multipart";
import { bindGlobalShortcuts } from "./shortcuts";
import {
  contextMenuButton,
  copyResponseBodySelection,
  hasResponseBodySelection,
  renderTextContextMenuMarkup,
  resolveTextContextMenu,
  runTextMenuAction
} from "./app/context-menu";
import { menuShortcuts } from "./app/menu-shortcuts";
import {
  appRoot,
  childCount,
  childrenOf,
  collectChildren,
  escapeAttribute,
  formatBytes,
  getActiveRequest,
  getItem,
  getRequest,
  getRequestFrom,
  id,
  state
} from "./app/state";
import { HTTP_METHODS, methodDataAttribute } from "./http-methods";
import {
  bindWindowChrome,
  initWindowChrome,
  renderWindowChromeMarkup,
  renderWindowChromeTabsMarkup,
  syncMaximizeControl
} from "./window-chrome";

const STREAM_EVENT = "restpilot:request-stream";
let responseRenderFrame: number | undefined;

type StreamPayload = {
  request_id: string;
  chunk: string;
  done: boolean;
  status?: number;
  status_text?: string;
  headers?: Record<string, string>;
  duration_ms?: number;
  error?: string;
};

export async function startApp(
  configPromise: ReturnType<typeof loadStoredConfig> = loadStoredConfig()
) {
  initDialogs(render);
  ensureContextMenuHandlers();
  bindGlobalShortcuts({
    send: () => void trySendRequest(),
    closeTab: () => {
      if (state.activeTabId) closeTab(state.activeTabId);
    },
    focusUrl: () => focusRequestUrl()
  });
  document.addEventListener("keydown", (event) => {
    if (state.activePanel !== "functions" || !state.activeFunctionId) return;
    const isF9 = event.key === "F9";
    const isCtrlEnter = (event.ctrlKey || event.metaKey) && event.key === "Enter";
    if (isF9 || isCtrlEnter) {
      const inCodeMirror = Boolean((event.target as HTMLElement).closest(".cm-editor"));
      if (isCtrlEnter && inCodeMirror) return;
      event.preventDefault();
      const activeId = state.activeFunctionId;
      const func = state.functions.find((f) => f.id === activeId);
      if (func) {
        void testFunction(func);
      }
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.activeFunctionPopover) {
      event.stopPropagation();
      state.activeFunctionPopover = null;
      removePopovers();
    }
  });

  document.addEventListener("click", (event) => {
    if (!state.activeFunctionPopover) return;
    const target = event.target as HTMLElement;
    if (target.closest(".app-popover")) return;
    if (target.closest("#func-popover-params-btn") ||
        target.closest("#func-popover-headers-btn") ||
        target.closest("#func-popover-body-btn") ||
        target.closest("#func-popover-auth-btn")) {
      return;
    }
    state.activeFunctionPopover = null;
    removePopovers();
  }, true);

  setRenderApp(renderApp);
  setRequestPopoverHooks({
    onVariablesChanged: onEffectiveVariablesChanged,
    openVariablesPanel: openVariablesWorkspace
  });

  const editorsReady = preloadEditorRuntime();
  let configLoadFailed = false;

  try {
    const loaded = await configPromise;
    if (loaded) {
      const { config: migrated, persist } = loaded;
      Object.assign(state, {
        items: migrated.items,
        variables: migrated.variables ?? [],
        environments: migrated.environments ?? [],
        activeEnvironmentId: migrated.activeEnvironmentId ?? null,
        openTabs: (migrated.openTabs ?? []).filter((tabId) => Boolean(getRequestFrom(migrated.items, tabId))),
        activeTabId: "",
        settings: migrated.settings,
        functions: migrated.functions ?? [],
        activeFunctionId: migrated.activeFunctionId ?? null
      });
      state.activeTabId = state.openTabs.includes(migrated.activeTabId) ? migrated.activeTabId : (state.openTabs[0] ?? "");
      if (persist) scheduleSave();

    }
  } catch {
    configLoadFailed = true;
  }

  applyUserSettings(state.settings);
  await editorsReady;

  finishBoot();

  initWindowChrome();
  for (const id of state.openTabs) ensureTab(id);
  render();

  if (configLoadFailed) {
    const labels = t().messages;
    await messageDialog("warning", labels.configTitle, labels.configLoadFailed);
  }

  const request = getActiveRequest();
  const tab = request ? state.tabs[request.id] : null;
  if (request && tab) await mountWorkspaceDisplays(request, tab);
  focusUrlOnStartup();
}

function focusUrlOnStartup() {
  if (state.activePanel !== "request" || !getActiveRequest()) return;
  focusRequestUrl();
}

function renderShellChrome(labels: ReturnType<typeof t>) {
  return renderCollectionSidebarShell(labels, {
    activePanel: state.activePanel,
    collectionSidebarOpen: state.collectionSidebarOpen,
    collectionSearchQuery: state.collectionSearchQuery,
    treeHtml: renderExplorerTree(null, 0),
    escapeAttribute
  });
}

function openVariablesWorkspace(tab: "globals" | "environments" = "globals") {
  state.variablesWorkspaceTab = tab;
  if (tab === "environments" && !state.envManageSelectedId && state.environments.length) {
    state.envManageSelectedId = state.activeEnvironmentId ?? state.environments[0]?.id ?? null;
  }
  openPanel("variables");
}

function renderWorkspaceMarkup() {
  const request = getActiveRequest();
  const tab = request ? ensureTab(request.id) : null;
  if (state.activePanel === "variables") return renderVariablesWorkspace();
  if (state.activePanel === "settings") return renderSettings(state.settings);
  if (state.activePanel === "functions") {
    const activeId = state.activeFunctionId;
    const func = activeId ? state.functions.find((f) => f.id === activeId) : null;
    return func ? renderFunctionWorkspace(func) : renderEmpty();
  }
  if (request && tab) return renderRequest(request, tab);
  return renderEmpty();
}

function renderWorkspace(): any {
  const panel = document.querySelector<HTMLElement>(".workspace-body");
  if (!panel) {
    render();
    return Promise.resolve();
  }
  unmountTabDisplay(state.activeTabId);
  unmountFunctionEditors();
  panel.innerHTML = renderWorkspaceMarkup();
  const res = bindWorkspace();
  if (state.openRequestPopover) requestAnimationFrame(() => syncRequestPopover());
  return res || Promise.resolve();
}


function updateTabStripActive() {
  document.querySelectorAll<HTMLElement>("[data-open-tab]").forEach((element) => {
    const tabId = element.dataset.openTab ?? "";
    const active = tabId === state.activeTabId;
    element.classList.toggle("active", active);
    element.setAttribute("aria-selected", active ? "true" : "false");
  });
}

function updateActivityBarActive() {
  document.querySelectorAll<HTMLButtonElement>("[data-activity]").forEach((button) => {
    const activity = button.dataset.activity;
    if (activity === "theme") return;
    const active =
      activity === "request"
        ? state.activePanel === "request"
        : activity === "variables"
          ? state.activePanel === "variables"
          : activity === "functions"
            ? state.activePanel === "functions"
            : activity === "settings"
              ? state.activePanel === "settings"
              : false;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-current", active ? "page" : "false");
  });
  syncCollectionSidebarDom();
  updateThemeToggleIcon();
}

function syncAppFrameLayout() {
  const isRequest = state.activePanel === "request";
  const isFunctions = state.activePanel === "functions";
  const collectionCollapsed = (isRequest || isFunctions) && !state.collectionSidebarOpen;
  appRoot.classList.add("app-frame");
  appRoot.classList.toggle("app-frame--request", isRequest);
  appRoot.classList.toggle("app-frame--functions", isFunctions);
  appRoot.classList.toggle("is-collection-collapsed", collectionCollapsed);
}

function syncCollectionSidebarDom() {
  const sidebar = document.querySelector(".collection-sidebar");
  if (sidebar) {
    const open = state.collectionSidebarOpen;
    sidebar.classList.toggle("is-collapsed", !open);
    sidebar.setAttribute("aria-hidden", (state.activePanel !== "request" && state.activePanel !== "functions") || !open ? "true" : "false");
    const toggle = document.querySelector<HTMLButtonElement>("#toggle-collection-sidebar");
    if (toggle) {
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      const labels = t();
      toggle.title = labels.nav.hideCollection;
      toggle.setAttribute("aria-label", labels.nav.hideCollection);
    }
  }
  syncAppFrameLayout();
}


function updateThemeToggleIcon() {
  const button = document.querySelector<HTMLButtonElement>("#activity-theme-toggle");
  if (!button) return;
  const labels = t();
  const isDark = state.settings.theme === "dark";
  button.innerHTML = isDark ? iconSun : iconMoon;
  const label = isDark ? labels.nav.switchToLight : labels.nav.switchToDark;
  button.title = label;
  button.setAttribute("aria-label", label);
}

function toggleCollectionSidebar() {
  state.collectionSidebarOpen = !state.collectionSidebarOpen;
  if (document.querySelector(".collection-sidebar")) {
    syncCollectionSidebarDom();
    return;
  }
  render();
}

function toggleThemeFromActivityBar() {
  state.settings.theme = state.settings.theme === "dark" ? "light" : "dark";
  applyUserSettings(state.settings);
  scheduleSave();
  updateThemeToggleIcon();
  const themeSelect = document.querySelector<HTMLSelectElement>("#setting-theme");
  if (themeSelect) themeSelect.value = state.settings.theme;
  if (state.activePanel === "request") renderWorkspace();
}

/** Leave settings/variables and return to the request workspace. */
function focusRequestWorkspace(): boolean {
  if (state.activePanel === "request") return false;
  closeRequestPopovers();
  state.activePanel = "request";
  state.contextMenu = null;
  return true;
}

function removeStrayTabBars() {
  const host = document.querySelector(".title-bar-tabs-host");
  document.querySelectorAll<HTMLElement>(".tab-bar").forEach((bar) => {
    if (host?.contains(bar)) return;
    bar.remove();
  });
}

function applyOpenTabOrder(strip: HTMLElement, tabIds: readonly string[]) {
  for (const id of tabIds) {
    const el = strip.querySelector<HTMLElement>(
      `[data-open-tab="${typeof CSS !== "undefined" && "escape" in CSS ? CSS.escape(id) : id}"]`
    );
    if (el) strip.appendChild(el);
  }
}

function updateTabStripScroll() {
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

function refreshTabBar() {
  const request = getActiveRequest();
  const tab = request ? ensureTab(request.id) : null;
  const markup = state.activePanel === "request" ? renderTabBar(request, tab) : "";
  const tabsHost = document.querySelector<HTMLElement>(".title-bar-tabs-host");
  const workspace = document.querySelector<HTMLElement>(".workspace");

  removeStrayTabBars();

  if (tabsHost) {
    if (!markup) {
      tabsHost.innerHTML = "";
      tabsHost.classList.add("title-bar-tabs-host--empty");
      tabsHost.setAttribute("aria-hidden", "true");
    } else {
      tabsHost.classList.remove("title-bar-tabs-host--empty");
      tabsHost.removeAttribute("aria-hidden");
      tabsHost.innerHTML = markup;
    }
  } else if (workspace) {
    workspace.querySelector(".tab-bar")?.remove();
    if (!markup) {
      bindTabBarToolButtons();
      return;
    }
    workspace.querySelector(".workspace-body")?.insertAdjacentHTML("beforebegin", markup);
  } else {
    return;
  }

  bindTabStripScroll();
  bindTabBarToolButtons();
  requestAnimationFrame(() => {
    updateTabStripScroll();
    document
      .querySelector<HTMLElement>(".title-bar-tabs-host .request-tab.active")
      ?.scrollIntoView({ inline: "nearest", block: "nearest" });
  });
  if (state.openRequestPopover) {
    requestAnimationFrame(() => syncRequestPopover());
  }
}

function bindTabStripScroll() {
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

function bindTabBar() {
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
      closeTab(closeTarget.getAttribute("data-close-tab") ?? "");
      return;
    }
    const tabEl = (event.target as HTMLElement).closest<HTMLElement>("[data-open-tab]");
    if (tabEl) openRequest(tabEl.dataset.openTab ?? "");
  });

  document.addEventListener("auxclick", (event) => {
    if (event.button !== 1) return;
    const host = tabHost();
    const strip = host?.querySelector(".tab-strip");
    if (!strip?.contains(event.target as Node)) return;

    const tabEl = (event.target as HTMLElement).closest<HTMLElement>("[data-open-tab]");
    if (!tabEl || (event.target as HTMLElement).closest("[data-close-tab]")) return;
    event.preventDefault();
    closeTab(tabEl.dataset.openTab ?? "");
  });

  document.addEventListener("mousedown", (event) => {
    if (event.button !== 1) return;
    const host = tabHost();
    const strip = host?.querySelector(".tab-strip");
    if (!strip?.contains(event.target as Node)) return;

    const tabEl = (event.target as HTMLElement).closest<HTMLElement>("[data-open-tab]");
    if (!tabEl || (event.target as HTMLElement).closest("[data-close-tab]")) return;
    event.preventDefault();
    closeTab(tabEl.dataset.openTab ?? "");
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

function renderRequestActionsTrigger(streamActive: boolean) {
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

let requestActionsMenuBound = false;

function bindRequestActionsMenu() {
  if (requestActionsMenuBound) return;
  requestActionsMenuBound = true;

  document.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-request-actions-trigger]");
    if (!button) return;
    const request = getActiveRequest();
    if (!request) return;

    event.stopPropagation();
    if (state.contextMenu?.kind === "request-actions" && state.contextMenu.requestId === request.id) {
      closeContextMenu();
      return;
    }
    const rect = button.getBoundingClientRect();
    state.contextMenu = {
      kind: "request-actions",
      x: rect.right,
      y: rect.bottom + 4,
      requestId: request.id
    };
    syncContextMenu();
  });
}

function bindTabBarToolButtons() {
  bindRequestActionsMenu();
  bindRequestPopoverTriggers(onEffectiveVariablesChanged);
}

function updateTreeRowActive() {
  document.querySelectorAll<HTMLElement>(".tree-row[data-tree-id]").forEach((row) => {
    const treeId = row.dataset.treeId ?? "";
    row.classList.toggle("is-selected", treeId === state.selectedTreeId);
    row.classList.toggle("is-open-tab", row.dataset.kind === "request" && treeId === state.activeTabId);
  });
}

function treeRowClassName(item: TreeItem, editing: boolean) {
  const classes = ["tree-row"];
  if (editing) classes.push("is-editing");
  if (state.selectedTreeId === item.id) classes.push("is-selected");
  if (item.kind === "request" && state.activeTabId === item.id) classes.push("is-open-tab");
  return classes.join(" ");
}

function unmountTabDisplay(requestId: string | null | undefined) {
  if (!requestId) return;
  const tab = state.tabs[requestId];
  tab?.displayUnmount?.();
  if (tab) {
    tab.displayUnmount = undefined;
    tab.bodyEditorUnmount = undefined;
    tab.responseBodyUnmount = undefined;
    tab.headersTableUnmount = undefined;
    invalidateLineCache(tab);
  }
}

function invalidateLineCache(tab: TabState) {
  tab.bodyLinesKey = undefined;
  tab.bodyLineOffsets = undefined;
  tab.bodyLineScanLength = undefined;
  tab.responseDisplayKey = undefined;
  tab.responseDisplayBody = undefined;
}

function getResponseBodyForDisplay(tab: TabState, body: string, headers: Record<string, string>) {
  if (tab.streaming) return body;
  const cacheKey = `${bodySourceKey(body, headers)}:display`;
  if (tab.responseDisplayKey === cacheKey && tab.responseDisplayBody) return tab.responseDisplayBody;
  const display = formatResponseBody(body, headers);
  tab.responseDisplayKey = cacheKey;
  tab.responseDisplayBody = display;
  return display;
}

function responseViewerMode(body: string, headers: Record<string, string>): RawType {
  return detectContentKind(body, headers);
}

async function mountResponseBodyViewer(request: SavedRequest, tab: TabState) {
  tab.responseBodyUnmount?.();
  tab.responseBodyUnmount = undefined;

  const host = document.querySelector<HTMLElement>("[data-response-body-viewer]");
  if (!host || !tab.response || tab.selectedResponseTab !== "body") return;

  const editors = await getEditorRuntime();
  const body = tab.response.body;
  const headers = tab.response.headers;
  const displayBody = getResponseBodyForDisplay(tab, body, headers);
  tab.responseBodyUnmount = editors.mountReadonlyViewer(
    host,
    displayBody,
    responseViewerMode(body, headers),
    state.settings.tabSize
  );
}

function mountHeadersPanel(tab: TabState) {
  tab.headersTableUnmount?.();
  tab.headersTableUnmount = undefined;

  const host = document.querySelector<HTMLElement>("[data-headers-table]");
  if (!host || !tab.response || tab.selectedResponseTab !== "headers") return;

  const labels = t().request;
  const rows = Object.entries(tab.response.headers).map(([key, value]) => ({ key, value }));
  tab.headersTableUnmount = mountHeadersTable(host, rows, {
    search: labels.headersSearch,
    key: labels.headersKey,
    value: labels.headersValue,
    empty: labels.headersEmpty
  });
}

async function mountWorkspaceDisplays(request: SavedRequest, tab: TabState) {
  tab.bodyEditorUnmount?.();
  tab.responseBodyUnmount?.();
  tab.headersTableUnmount?.();
  tab.bodyEditorUnmount = undefined;
  tab.responseBodyUnmount = undefined;
  tab.headersTableUnmount = undefined;

  const editors = await getEditorRuntime();
  const editorHost = document.querySelector<HTMLElement>("[data-body-editor-host]");
  if (editorHost && request.bodyMode === "raw" && tab.selectedRequestTab === "body") {
    tab.bodyEditorUnmount = editors.mountBodyEditor(editorHost, request.body, {
      tabSize: state.settings.tabSize,
      rawType: request.rawType,
      autoPrettifyJson: state.settings.autoPrettifyJson,
      onChange: (value) => {
        request.body = value;
        scheduleSave();
      },
      onSend: () => void trySendRequest()
    });
  }

  await mountResponseBodyViewer(request, tab);
  mountHeadersPanel(tab);

  tab.displayUnmount = () => {
    tab.bodyEditorUnmount?.();
    tab.responseBodyUnmount?.();
    tab.headersTableUnmount?.();
    tab.bodyEditorUnmount = undefined;
    tab.responseBodyUnmount = undefined;
    tab.headersTableUnmount = undefined;
  };
}

function renderResponseHead(tab: TabState) {
  const labels = t().request;
  const response = tab.response!;
  const statusClass = response.status >= 200 && response.status < 300 ? "ok" : response.status >= 400 ? "bad" : "soft";
  const streamingBadge = tab.streaming ? `<span class="stream-badge">${labels.streaming}</span>` : "";
  return `
    <div class="response-head">
      <div class="status ${statusClass}">${response.status} ${escapeHtml(response.status_text)}</div>${streamingBadge}
      <div class="response-head-actions">
        <div class="metrics"><span>${response.duration_ms} ms</span><span>${formatBytes(response.body.length)}</span></div>
        <button
          class="icon-btn"
          data-copy-menu-trigger
          id="copy-response-menu"
          type="button"
          aria-label="${labels.copyResponseMenu}"
          aria-haspopup="menu"
          aria-expanded="false"
        >${iconCopy}</button>
      </div>
    </div>
  `;
}

async function refreshResponseBodyDisplay(request: SavedRequest, tab: TabState) {
  if (!tab.response) return;

  const body = tab.response.body;
  const headers = tab.response.headers;
  const displayBody = getResponseBodyForDisplay(tab, body, headers);

  const head = document.querySelector(".response-head");
  if (head) {
    head.outerHTML = renderResponseHead(tab);
    bindResponseCopyMenu(tab);
  }

  const streamHost = document.querySelector<HTMLElement>("[data-response-body-stream]");
  if (streamHost) {
    streamHost.textContent = displayBody;
    return;
  }

  const host = document.querySelector<HTMLElement>("[data-response-body-viewer]");
  if (!host) return;

  const editors = await getEditorRuntime();
  if (editors.setReadonlyViewerValue(host, displayBody)) return;
  await mountResponseBodyViewer(request, tab);
}

function activateRequestTab(requestId: string) {
  const previousId = state.activeTabId;
  const panelChanged = focusRequestWorkspace();
  state.activeTabId = requestId;
  state.selectedTreeId = requestId;
  ensureTab(requestId);
  if (previousId && previousId !== requestId) unmountTabDisplay(previousId);
  if (panelChanged) refreshTabBar();
  updateTabStripActive();
  updateTreeRowActive();
  updateActivityBarActive();
  renderWorkspace();
}

function resolveTitleBarCenter(): string {
  if (state.activePanel === "settings") return t().settings.title;
  if (state.activePanel === "variables") return t().nav.variables;
  if (state.activePanel === "functions") return "";
  const request = getActiveRequest();
  if (request?.title.trim()) return request.title.trim();
  return t().app.name;
}

function renderApp() {
  const request = getActiveRequest();
  const tab = request ? ensureTab(request.id) : null;
  const labels = t();
  const isRequest = state.activePanel === "request";

  unmountTabDisplay(state.activeTabId);
  unmountFunctionEditors();
  syncAppFrameLayout();

  const titleBar = isRequest
    ? renderWindowChromeTabsMarkup(renderTabBar(request, tab))
    : renderWindowChromeMarkup({ center: resolveTitleBarCenter() });

  const sidebar = isRequest
    ? renderShellChrome(labels)
    : state.activePanel === "functions"
      ? renderFunctionsSidebarShell(labels, {
          activePanel: state.activePanel,
          collectionSidebarOpen: state.collectionSidebarOpen,
          functionSearchQuery: state.functionSearchQuery,
          functionsHtml: renderFunctionsList(),
          escapeAttribute
        })
      : "";

  appRoot.innerHTML = `
      ${renderActivityBarMarkup(labels, state.activePanel, state.settings.theme)}
      ${titleBar}
      ${sidebar}
      <main class="shell shell--workspace-only">
        <section class="workspace">
          <div class="workspace-body">${renderWorkspaceMarkup()}</div>
        </section>
      </main>
    ${renderDialogLayer()}
  `;

  bindEvents();
  syncCollectionSidebarDom();
  syncContextMenu();
  if (state.openRequestPopover) syncRequestPopover();
  const active = getActiveRequest();
  const activeTab = active ? ensureTab(active.id) : null;
  if (active && activeTab) void mountWorkspaceDisplays(active, activeTab);
  
  if (state.activePanel === "functions") {
    const activeId = state.activeFunctionId;
    const func = activeId ? state.functions.find((f) => f.id === activeId) : null;
    if (func) void mountFunctionEditor(func);
  }
}


function buildContextMenuMarkup() {
  if (!state.contextMenu) return "";
  if (state.contextMenu.kind === "text") {
    return renderTextContextMenuMarkup(state.contextMenu);
  }
  if (state.contextMenu.kind === "functions-tree") {
    const labels = t().tree;
    const funcId = state.contextMenu.functionId;
    const func = funcId ? state.functions.find((f) => f.id === funcId) : null;
    return `
      <div class="context-menu" style="left:${state.contextMenu.x}px;top:${state.contextMenu.y}px">
        ${contextMenuButton("new-function", t().nav.newFunction)}
        ${
          func
            ? `<hr>${contextMenuButton("rename", labels.rename, { shortcut: menuShortcuts.rename() })}`
            : ""
        }
        ${
          func
            ? contextMenuButton("delete", labels.delete, { shortcut: menuShortcuts.delete(), danger: true })
            : ""
        }
      </div>
    `;
  }
  if (state.contextMenu.kind === "request-tab") {

    const labels = t();
    return `
      <div class="context-menu" style="left:${state.contextMenu.x}px;top:${state.contextMenu.y}px">
        ${contextMenuButton("close-tab", labels.contextMenu.closeTab, { shortcut: menuShortcuts.closeTab() })}
        ${state.openTabs.length > 1 ? contextMenuButton("close-other-tabs", labels.contextMenu.closeOtherTabs) : ""}
        ${contextMenuButton("close-all-tabs", labels.contextMenu.closeAllTabs)}
        <hr>
        ${contextMenuButton("duplicate", labels.request.duplicate)}
      </div>
    `;
  }
  if (state.contextMenu.kind === "response-copy") {
    const labels = t().request;
    const menuLabels = t().contextMenu;
    const copySelection =
      state.contextMenu.canCopySelection
        ? contextMenuButton("copy-response-selection", menuLabels.copySelection, {
            shortcut: menuShortcuts.copy()
          })
        : "";
    return `
      <div class="context-menu context-menu--anchor-end" style="left:${state.contextMenu.x}px;top:${state.contextMenu.y}px">
        ${copySelection}
        ${contextMenuButton("copy-response-body", labels.copyBody)}
        ${contextMenuButton("copy-response-headers", labels.copyHeaders)}
        ${contextMenuButton("copy-response-status", labels.copyStatus)}
      </div>
    `;
  }
  if (state.contextMenu.kind === "request-actions") {
    const labels = t().request;
    const request = getRequest(state.contextMenu.requestId);
    return `
      <div class="context-menu context-menu--anchor-end" style="left:${state.contextMenu.x}px;top:${state.contextMenu.y}px">
        ${contextMenuButton("duplicate", labels.duplicate)}
        ${contextMenuButton("clear", labels.clear)}
        <hr>
        ${contextMenuButton("toggle-stream", labels.streamResponse, { checked: request?.streamResponse ?? false })}
      </div>
    `;
  }
  const labels = t().tree;
  const item = state.contextMenu.itemId ? getItem(state.contextMenu.itemId) : null;
  return `
    <div class="context-menu" style="left:${state.contextMenu.x}px;top:${state.contextMenu.y}px">
      ${contextMenuButton("new-request", labels.newRequest)}
      ${contextMenuButton("new-folder", labels.newFolder)}
      ${
        item
          ? `<hr>${contextMenuButton("rename", labels.rename, { shortcut: menuShortcuts.rename() })}`
          : ""
      }
      ${item?.kind === "request" ? contextMenuButton("show", labels.show) : ""}
      ${item ? contextMenuButton("duplicate", labels.duplicate) : ""}
      ${item?.kind === "request" ? contextMenuButton("copy-curl", labels.copyCurl) : ""}
      ${
        item
          ? contextMenuButton("delete", labels.delete, { shortcut: menuShortcuts.delete(), danger: true })
          : ""
      }
    </div>
  `;
}

function syncContextMenu() {
  document.querySelector(".context-menu")?.remove();
  const markup = buildContextMenuMarkup();
  if (!markup) return;
  appRoot.insertAdjacentHTML("beforeend", markup);
  document
    .querySelector<HTMLButtonElement>("[data-copy-menu-trigger]")
    ?.setAttribute("aria-expanded", state.contextMenu?.kind === "response-copy" ? "true" : "false");
  document
    .querySelector<HTMLButtonElement>("[data-request-actions-trigger]")
    ?.setAttribute("aria-expanded", state.contextMenu?.kind === "request-actions" ? "true" : "false");
}


function renderTabBar(request: SavedRequest | undefined, tab: TabState | null | undefined) {
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

function renderTab(requestId: string) {
  const request = getRequest(requestId);
  if (!request) return "";
  return `
    <div class="request-tab ${state.activeTabId === requestId ? "active" : ""}" data-open-tab="${requestId}" role="tab" aria-selected="${state.activeTabId === requestId}" tabindex="0">
      <span class="tab-label">${escapeHtml(request.title)}</span>
      <button class="mini-btn tab-close field-remove-btn" data-close-tab="${requestId}" type="button" aria-label="${t().dialog.close}">×</button>
    </div>
  `;
}

function renderRequest(request: SavedRequest, tab: TabState) {
  const labels = t().request;
  const displayUrl = displayRequestUrl(request);
  const effectiveVariables = getEffectiveVariables();
  const previewVisible = shouldShowUrlPreview(request, effectiveVariables);
  const resolvedUrl = resolvedRequestUrl(request, effectiveVariables);
  return `
    <div class="request-editor">
    <section class="request-line">
      <select id="method" class="method-select"${methodDataAttribute(request.method)}>${HTTP_METHODS.map((method) => `<option value="${method}"${methodDataAttribute(method)} ${method === request.method ? "selected" : ""}>${method}</option>`).join("")}</select>
      <div class="url-send-field">
        <input id="url" class="url-send-input" value="${escapeAttribute(displayUrl)}" spellcheck="false" aria-label="${labels.resolvedUrl}" />
        ${
          tab.loading
            ? `<button id="cancel" class="url-send-btn url-send-btn--cancel danger-button" type="button"><span class="pulse"></span>${labels.cancel}</button>`
            : `<button id="send" class="url-send-btn" type="button">${labels.send}</button>`
        }
      </div>
    </section>
    <div class="url-preview-wrap${previewVisible ? "" : " is-hidden"}" id="url-preview-wrap" aria-live="polite">
      <span class="url-preview-label">${labels.resolvedUrl}</span>
      <code class="url-preview" id="url-preview">${escapeHtml(resolvedUrl)}</code>
    </div>
    <section class="editor-grid">
      <article class="request-card">
        <div class="tabs">
          <button class="${tab.selectedRequestTab === "params" ? "active" : ""}" data-request-tab="params" type="button">${labels.params}</button>
          <button class="${tab.selectedRequestTab === "auth" ? "active" : ""}" data-request-tab="auth" type="button">${labels.authTab}</button>
          <button class="${tab.selectedRequestTab === "headers" ? "active" : ""}" data-request-tab="headers" type="button">${labels.headers}</button>
          <button class="${tab.selectedRequestTab === "body" ? "active" : ""}" data-request-tab="body" type="button">${labels.body}</button>
        </div>
        ${renderRequestTabPanel(request, tab, labels)}
      </article>
      <article class="response-card">${renderResponse(tab)}</article>
    </section>
    </div>
  `;
}

function renderRequestTabPanel(
  request: SavedRequest,
  tab: TabState,
  labels: ReturnType<typeof t>["request"]
) {
  if (tab.selectedRequestTab === "auth") {
    return renderAuthPanel(request);
  }
  if (tab.selectedRequestTab === "params") {
    return `
      <div class="request-tab-panel">
        <div class="request-tab-toolbar">
          <button class="mini-btn" id="add-query" type="button" aria-label="${labels.addField}">+</button>
        </div>
        <div class="headers-list request-pairs-list">${request.queryParams.map((pair) => renderPair(pair, "query")).join("")}</div>
      </div>
    `;
  }
  if (tab.selectedRequestTab === "headers") {
    return `
      <div class="request-tab-panel">
        <div class="request-tab-toolbar">
          <button class="mini-btn" id="add-header" type="button" aria-label="${labels.addField}">+</button>
        </div>
        <div class="headers-list request-pairs-list">${request.headers.map((pair) => renderPair(pair, "header")).join("")}</div>
      </div>
    `;
  }
  return `
    <div class="request-tab-panel">
      <div class="body-toolbar">
        <div class="segmented body-mode-switch">
          <button class="${request.bodyMode === "raw" ? "active" : ""}" data-body-mode="raw" type="button">${labels.raw}</button>
          <button class="${request.bodyMode === "form" ? "active" : ""}" data-body-mode="form" type="button">${labels.form}</button>
          <button class="${request.bodyMode === "multipart" ? "active" : ""}" data-body-mode="multipart" type="button">${labels.multipart}</button>
          <button class="${request.bodyMode === "none" ? "active" : ""}" data-body-mode="none" type="button">${labels.none}</button>
        </div>
        ${renderBodyToolbarTrailing(request, labels)}
      </div>
      ${renderBodyEditor(request, labels)}
    </div>
  `;
}

function renderBodyToolbarTrailing(request: SavedRequest, labels: ReturnType<typeof t>["request"]) {
  if (request.bodyMode === "raw") {
    return `
      <label class="raw-type-select-wrap body-toolbar-trailing">
        <span class="raw-type-select-label">${labels.rawFormat}</span>
        <select id="raw-type" class="raw-type-select" aria-label="${labels.rawFormat}">
          <option value="text" ${request.rawType === "text" ? "selected" : ""}>${labels.rawText}</option>
          <option value="json" ${request.rawType === "json" ? "selected" : ""}>${labels.rawJson}</option>
          <option value="xml" ${request.rawType === "xml" ? "selected" : ""}>${labels.rawXml}</option>
        </select>
      </label>
    `;
  }
  return "";
}

function ensureFormRow(request: SavedRequest) {
  if (request.bodyMode !== "form" || request.form.length > 0) return;
  request.form.push({ id: id(), key: "", value: "", enabled: true, partType: "text" });
}

function renderBodyEditor(request: SavedRequest, labels: ReturnType<typeof t>["request"]) {
  if (request.bodyMode === "raw") {
    const modeClass =
      request.rawType === "json" ? "json-mode" : request.rawType === "xml" ? "xml-mode" : "text-mode";
    return `<div class="code-editor ${modeClass}" data-body-editor-host></div>`;
  }
  if (request.bodyMode === "none") {
    return "";
  }
  const isMultipart = request.bodyMode === "multipart";
  const rows = request.form
    .map((pair) => (isMultipart ? renderMultipartPair(pair) : renderPair(pair, "form")))
    .join("");
  const multipartHint = isMultipart
    ? `<p class="hint multipart-hint">${labels.multipartFilesHint}</p>`
    : "";
  const actions = isMultipart
    ? `<div class="form-actions"><button class="quiet-button add-form" id="add-form" type="button">${labels.addField}</button><button class="quiet-button add-form" id="add-multipart-file" type="button">${labels.addFile}</button></div>`
    : `<button class="quiet-button add-form" id="add-form" type="button">${labels.addField}</button>`;
  return `${multipartHint}<div class="headers-list form-list">${rows}</div>${actions}`;
}

function renderMultipartPair(pair: Pair) {
  const labels = t().request;
  const pairLabels = t().pairs;
  const partType = pair.partType === "file" ? "file" : "text";
  const valueField =
    partType === "file"
      ? `<label class="multipart-file-picker"><input class="form-file" data-form-id="${pair.id}" type="file" hidden /><span class="multipart-file-name">${escapeHtml(pair.fileName || labels.chooseFile)}</span></label>`
      : `<input class="form-value" value="${escapeAttribute(pair.value)}" placeholder="${pairLabels.value}" spellcheck="false" />`;
  return `
    <div class="pair-row multipart-row" data-form-id="${pair.id}">
      <input class="form-enabled" type="checkbox" ${pair.enabled ? "checked" : ""} />
      <input class="form-key" value="${escapeAttribute(pair.key)}" placeholder="Name" spellcheck="false" />
      <select class="form-part-type" data-form-id="${pair.id}">
        <option value="text" ${partType === "text" ? "selected" : ""}>${labels.partText}</option>
        <option value="file" ${partType === "file" ? "selected" : ""}>${labels.partFile}</option>
      </select>
      ${valueField}
      <button class="mini-btn field-remove-btn remove-form" type="button" aria-label="${t().tree.delete}">×</button>
    </div>
  `;
}

function renderPair(pair: Pair, scope: "header" | "form" | "query") {
  const labels = t().pairs;
  const keyPlaceholder =
    scope === "header" ? labels.header : scope === "query" ? labels.param : "Name";
  return `
    <div class="pair-row" data-${scope}-id="${pair.id}">
      <input class="${scope}-enabled" type="checkbox" ${pair.enabled ? "checked" : ""} />
      <input class="${scope}-key" value="${escapeAttribute(pair.key)}" placeholder="${keyPlaceholder}" spellcheck="false" />
      <input class="${scope}-value" value="${escapeAttribute(pair.value)}" placeholder="${labels.value}" spellcheck="false" />
      <button class="mini-btn field-remove-btn remove-${scope}" type="button" aria-label="${t().tree.delete}">×</button>
    </div>
  `;
}

function renderResponseBodyMarkup(body: string, headers: Record<string, string>, streaming = false) {
  if (streaming && !isLargeText(body)) {
    return `<pre class="response-body response-body-stream" data-response-body-stream></pre>`;
  }
  if (isLargeText(body)) {
    return `<div class="response-body response-body-viewer" data-response-body-viewer></div>`;
  }
  return `<pre class="response-body">${highlightResponse(body, headers)}</pre>`;
}

function renderResponseHeadersMarkup() {
  return `<div class="response-headers-panel" data-headers-table></div>`;
}

function renderResponse(tab: TabState) {
  const labels = t().request;
  if (tab.loading && !tab.response) {
    return `<div class="response-empty"><div class="loader"></div><h2>${labels.waitingTitle}</h2><p>${labels.waitingBody}</p></div>`;
  }
  if (tab.error && !tab.response) return `<div class="response-empty error"><h2>${labels.failedTitle}</h2><p>${escapeHtml(tab.error)}</p></div>`;
  if (!tab.response) return `<div class="response-empty"><h2>${labels.emptyTitle}</h2><p>${labels.emptyBody}</p></div>`;

  const response = tab.response;
  return `
    ${renderResponseHead(tab)}
    <div class="tabs">
      <button class="${tab.selectedResponseTab === "body" ? "active" : ""}" data-response-tab="body" type="button">${labels.body}</button>
      <button class="${tab.selectedResponseTab === "headers" ? "active" : ""}" data-response-tab="headers" type="button">${labels.responseHeaders}</button>
    </div>
    ${
      tab.selectedResponseTab === "body"
        ? renderResponseBodyMarkup(response.body, response.headers, tab.streaming)
        : renderResponseHeadersMarkup()
    }
  `;
}

function renderExplorerTree(parentId: string | null, depth: number): string {
  const labels = t().tree;
  const searchVisible = collectionSearchVisibleIds(state.items, state.collectionSearchQuery);
  return state.items
    .filter((item) => item.parentId === parentId)
    .filter((item) => !searchVisible || searchVisible.has(item.id))
    .map((item) => {
      const editing = state.editingTreeId === item.id;
      const expanded =
        item.kind === "folder" && folderExpandedForSearch(item, searchVisible, state.items);
      const children = item.kind === "folder" && item.expanded ? renderExplorerTree(item.id, depth + 1) : "";
      return `
        <div class="${treeRowClassName(item, editing)}" tabindex="0" data-tree-id="${item.id}" data-kind="${item.kind}" style="--depth:${depth}">
          <span class="tree-chevron">${item.kind === "folder" ? (expanded ? "v" : ">") : ""}</span>
          ${item.kind === "folder" ? `<span class="tree-item-icon folder-icon"></span>` : item.kind === "request" && !editing ? `<span class="tree-method"${methodDataAttribute(item.method)}>${item.method}</span>` : ""}
          <div class="tree-main">
            ${
              editing
                ? `<input class="tree-rename-input" value="${escapeAttribute(item.title)}" spellcheck="false" aria-label="${labels.rename}" />`
                : `<span class="tree-title">${escapeHtml(item.title)}</span>`
            }
          </div>
          ${
            editing
              ? ""
              : `<span class="tree-row-actions">
                  <button class="mini-btn tree-action-btn" data-tree-action="rename" data-tree-id="${item.id}" type="button" title="${labels.rename}" aria-label="${labels.rename}">${iconRename}</button>
                  <button class="mini-btn tree-action-btn" data-tree-action="duplicate" data-tree-id="${item.id}" type="button" title="${labels.duplicate}" aria-label="${labels.duplicate}">${iconDuplicate}</button>
                  <button class="mini-btn tree-action-btn danger" data-tree-action="delete" data-tree-id="${item.id}" type="button" title="${labels.delete}" aria-label="${labels.delete}">${iconRemove}</button>
                </span>`
          }
        </div>
        ${children}
      `;
    })
    .join("");
}

function renderEmpty() {
  const text = state.activePanel === "functions" ? t().functions.noFunctionSelected : t().request.noTab;
  return `<div class="empty-editor"><span>${text}</span></div>`;
}

function bindWorkspace() {
  const request = getActiveRequest();
  const tab = request ? ensureTab(request.id) : null;

  if (state.activePanel === "settings") {
    bindSettings(state.settings, onSettingsChanged, backToWorkspace, clearAllData);
    return;
  }

  if (state.activePanel === "variables") {
    bindVariablesWorkspace(onEffectiveVariablesChanged);
    return;
  }

  if (state.activePanel === "functions") {
    const activeId = state.activeFunctionId;
    const func = activeId ? state.functions.find((f) => f.id === activeId) : null;
    if (func) {
      bindFunctionWorkspace(func);
      return mountFunctionEditor(func);
    }
    return Promise.resolve();
  }

  if (!request || !tab) return;


  if (request.bodyMode === "form") ensureFormRow(request);

  const methodSelect = document.querySelector<HTMLSelectElement>("#method");
  methodSelect?.addEventListener("change", (event) => {
    const select = event.target as HTMLSelectElement;
    request.method = select.value;
    syncMethodSelectAppearance(select);
    scheduleSave();
  });
  if (methodSelect) syncMethodSelectAppearance(methodSelect);
  const urlInput = document.querySelector<HTMLInputElement>("#url");
  urlInput?.addEventListener("input", (event) => {
    ingestUrlIntoRequest(request, (event.target as HTMLInputElement).value, id);
    if (state.autoTitleFromUrlId === request.id) applyAutoTitleFromUrl(request);
    syncUrlInputFromRequest(request);
    updateUrlPreview(request);
    scheduleSave();
  });
  urlInput?.addEventListener("blur", () => {
    if (state.autoTitleFromUrlId === request.id) state.autoTitleFromUrlId = null;
  });
  urlInput?.addEventListener("paste", handleCurlPaste);
  urlInput?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    void trySendRequest();
  });
  document.querySelector("#send")?.addEventListener("click", () => void trySendRequest());
  document.querySelector("#cancel")?.addEventListener("click", cancelActiveRequest);
  document.querySelector("#add-query")?.addEventListener("click", (event) => {
    event.preventDefault();
    request.queryParams.push({ id: id(), key: "", value: "", enabled: true });
    syncUrlInputFromRequest(request);
    scheduleSave();
    renderWorkspace();
  });
  document.querySelector("#add-header")?.addEventListener("click", (event) => {
    event.preventDefault();
    request.headers.push({ id: id(), key: "", value: "", enabled: true });
    scheduleSave();
    renderWorkspace();
  });
  document.querySelectorAll<HTMLButtonElement>("[data-body-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      request.bodyMode = button.dataset.bodyMode as BodyMode;
      ensureFormRow(request);
      scheduleSave();
      renderWorkspace();
    });
  });
  document.querySelector<HTMLSelectElement>("#raw-type")?.addEventListener("change", (event) => {
    request.rawType = (event.target as HTMLSelectElement).value as RawType;
    scheduleSave();
    renderWorkspace();
  });
  document.querySelector<HTMLElement>("[data-body-editor-host]")?.addEventListener("paste", handleCurlPaste);
  document.querySelector("#add-form")?.addEventListener("click", () => {
    request.form.push({ id: id(), key: "", value: "", enabled: true, partType: "text" });
    scheduleSave();
    renderWorkspace();
  });
  document.querySelector("#add-multipart-file")?.addEventListener("click", () => {
    request.form.push({ id: id(), key: "", value: "", enabled: true, partType: "file", fileName: "" });
    scheduleSave();
    renderWorkspace();
  });
  if (tab.selectedRequestTab === "auth") {
    bindAuthPanel(request, () => {
      scheduleSave();
      updateUrlPreview(request);
    });
  }

  bindPairs(request.headers, "header");
  bindPairs(request.queryParams, "query", request);
  bindFormPairs(request);
  bindResponseCopyMenu(tab);
  bindRequestTabs(request.id);
  bindResponseTabs(request.id);
  void mountWorkspaceDisplays(request, tab);
  if (state.openRequestPopover) syncRequestPopover();
}

function syncMethodSelectAppearance(select: HTMLSelectElement) {
  if (select.value) select.dataset.method = select.value;
}

function bindCollectionSearch() {
  const input = document.querySelector<HTMLInputElement>("#collection-search");
  const clear = document.querySelector<HTMLButtonElement>("#collection-search-clear");
  const submit = document.querySelector<HTMLButtonElement>("#collection-search-submit");
  if (!input) return;

  const refocusSearch = () => {
    requestAnimationFrame(() => {
      const field = document.querySelector<HTMLInputElement>("#collection-search");
      if (!field) return;
      field.focus();
      const end = field.value.length;
      field.setSelectionRange(end, end);
    });
  };

  const syncClearVisibility = (value: string) => {
    clear?.classList.toggle("is-hidden", !value.trim());
  };

  const applySearch = () => {
    state.collectionSearchQuery = input.value;
    syncClearVisibility(input.value);
    render();
    refocusSearch();
  };

  input.addEventListener("input", () => {
    syncClearVisibility(input.value);
    state.collectionSearchQuery = input.value;
    render();
    refocusSearch();
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      applySearch();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      state.collectionSearchQuery = "";
      syncClearVisibility("");
      render();
      refocusSearch();
    }
  });

  submit?.addEventListener("click", (event) => {
    event.preventDefault();
    applySearch();
  });

  clear?.addEventListener("click", (event) => {
    event.preventDefault();
    state.collectionSearchQuery = "";
    input.value = "";
    syncClearVisibility("");
    render();
    refocusSearch();
  });
}

function bindEvents() {
  bindWindowChrome();
  void syncMaximizeControl();
  bindTree();
  bindDialogs();
  bindActivityBar();
  bindTabBar();
  bindTabStripScroll();
  bindCollectionSearch();
  bindFunctionsSearch();
  bindFunctions();

  document.querySelector("#export-collection")?.addEventListener("click", () => void exportCollection());
  document.querySelector("#import-collection")?.addEventListener("click", () => void importCollection());
  document.querySelector("#new-folder")?.addEventListener("click", () => createFolder(null));
  document.querySelector("#new-request")?.addEventListener("click", () => createRequest(null));
  document.querySelector("#new-function")?.addEventListener("click", () => createNewFunction());
  document.querySelector("#panel-back")?.addEventListener("click", backToWorkspace);
  bindTabBarToolButtons();
  bindWorkspace();
}

function bindActivityBar() {
  document.querySelectorAll<HTMLButtonElement>("[data-activity]").forEach((button) => {
    button.addEventListener("click", () => {
      const activity = button.dataset.activity;
      if (activity === "theme") {
        toggleThemeFromActivityBar();
        return;
      }
      if (activity === "request") {
        if (state.activePanel === "request") {
          toggleCollectionSidebar();
          return;
        }
        openPanel("request");
        return;
      }
      if (activity === "functions") {
        if (state.activePanel === "functions") {
          toggleCollectionSidebar();
          return;
        }
        openPanel("functions");
        return;
      }
      if (activity === "variables") openVariablesWorkspace("globals");
      if (activity === "settings") openPanel("settings");
    });
  });

  document.querySelector("#toggle-collection-sidebar")?.addEventListener("click", (event) => {
    event.stopPropagation();
    if (state.collectionSidebarOpen) toggleCollectionSidebar();
  });
}


function openPanel(panel: ActivePanel) {
  if (panel !== state.activePanel && (panel === "settings" || panel === "variables")) {
    state.previousPanel = state.activePanel;
  }
  closeRequestPopovers();
  state.activePanel = panel;
  state.contextMenu = null;
  render();
}

function backToWorkspace() {
  openPanel("request");
}

function onSettingsChanged() {
  const languageChanged = getLocale() !== state.settings.language;
  applyUserSettings(state.settings);
  scheduleSave();
  updateThemeToggleIcon();
  if (languageChanged) render();
  else if (state.activePanel === "request") renderWorkspace();
}

async function clearAllData() {
  const labels = t().settings;
  const answer = await messageDialog("confirmation", labels.clearDataTitle, labels.clearDataBody);
  if (answer !== "confirm") return;

  closeRequestPopovers();
  resetAppStateToDefaults(state);
  resetSettingsSessionState();
  applyUserSettings(state.settings);
  await persistConfig();
  render();
}

let toastTimeout: ReturnType<typeof setTimeout> | undefined;

function showToast(message: string) {
  if (toastTimeout) clearTimeout(toastTimeout);

  let toast = document.getElementById("app-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "app-toast";
    toast.className = "app-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("app-toast--visible");

  toastTimeout = setTimeout(() => {
    toast?.classList.remove("app-toast--visible");
    toastTimeout = setTimeout(() => toast?.remove(), 220);
  }, 2200);
}

function closeContextMenu() {
  if (!state.contextMenu) return;
  state.contextMenu = null;
  document.querySelector(".context-menu")?.remove();
  document.querySelector("[data-copy-menu-trigger]")?.setAttribute("aria-expanded", "false");
  document.querySelector("[data-request-actions-trigger]")?.setAttribute("aria-expanded", "false");
}

function contextMenuAnchor(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return {
    x: Math.min(Math.max(rect.left + 8, 8), window.innerWidth - 180),
    y: Math.min(rect.bottom + 4, window.innerHeight - 8)
  };
}

function resolveContextMenuTarget(focused: HTMLElement): HTMLElement {
  if (focused.closest(".context-menu, [data-copy-menu-trigger], [data-request-actions-trigger]")) return focused;

  if (state.activePanel === "functions" && focused.closest(".tree")) {
    return (
      focused.closest<HTMLElement>("[data-function-id]") ??
      (state.activeFunctionId
        ? (document.querySelector<HTMLElement>(`[data-function-id="${state.activeFunctionId}"]`) ?? undefined)
        : undefined) ??
      focused.closest<HTMLElement>(".tree") ??
      focused
    );
  }

  if (focused.closest(".tree")) {
    return (
      focused.closest<HTMLElement>("[data-tree-id]") ??
      (state.selectedTreeId
        ? (document.querySelector<HTMLElement>(`[data-tree-id="${state.selectedTreeId}"]`) ?? undefined)
        : undefined) ??
      focused.closest<HTMLElement>(".tree") ??
      focused
    );
  }

  const openTab = focused.closest<HTMLElement>("[data-open-tab]");
  if (openTab) return openTab;

  return focused;
}

function openContextMenuForTarget(target: HTMLElement, x: number, y: number) {
  if (target.closest(".context-menu, [data-copy-menu-trigger], [data-request-actions-trigger]")) return;

  if (state.activePanel === "functions" && target.closest(".tree")) {
    const row = target.closest<HTMLElement>("[data-function-id]");
    const functionId = row?.dataset.functionId ?? null;
    state.contextMenu = { kind: "functions-tree", x, y, functionId };
    if (functionId) selectFunction(functionId);
    syncContextMenu();
    return;
  }

  if (target.closest(".tree")) {
    const row = target.closest<HTMLElement>("[data-tree-id]");
    const itemId = row?.dataset.treeId ?? null;
    state.contextMenu = { kind: "tree", x, y, itemId };
    selectTreeItem(itemId, { render: true, focus: true });
    syncContextMenu();
    return;
  }

  const openTab = target.closest<HTMLElement>("[data-open-tab]");
  if (openTab?.dataset.openTab) {
    state.contextMenu = {
      kind: "request-tab",
      x,
      y,
      requestId: openTab.dataset.openTab
    };
    syncContextMenu();
    return;
  }

  const responseCard = target.closest(".response-card");
  if (responseCard) {
    const request = getActiveRequest();
    const tab = request ? state.tabs[request.id] : null;
    if (request && tab?.response) {
      const inBody = target.closest(
        ".response-body, [data-response-body-viewer], [data-response-body-stream]"
      );
      state.contextMenu = {
        kind: "response-copy",
        x,
        y,
        requestId: request.id,
        canCopySelection: inBody ? hasResponseBodySelection(target) : false
      };
      syncContextMenu();
      return;
    }
  }

  const textFlags = resolveTextContextMenu(target);
  if (textFlags) {
    state.contextMenu = { kind: "text", x, y, ...textFlags };
    syncContextMenu();
    return;
  }

  closeContextMenu();
}

function handleGlobalContextMenu(event: MouseEvent) {
  event.preventDefault();
  const target = event.target as HTMLElement;
  openContextMenuForTarget(target, event.clientX, event.clientY);
}

function isContextMenuKey(event: KeyboardEvent) {
  return event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey);
}

function handleContextMenuKey(event: KeyboardEvent) {
  if (!isContextMenuKey(event) || event.defaultPrevented || event.isComposing) return;
  if (document.querySelector(".app-dialog")) return;

  const focused =
    document.activeElement instanceof HTMLElement ? document.activeElement : (event.target as HTMLElement);
  if (!(focused instanceof HTMLElement)) return;

  event.preventDefault();
  event.stopPropagation();

  const target = resolveContextMenuTarget(focused);
  const { x, y } = contextMenuAnchor(
    target.closest<HTMLElement>("[data-tree-id], [data-open-tab], .tree, .response-card, .cm-editor, input, textarea") ??
      target
  );
  openContextMenuForTarget(target, x, y);
}

function ensureContextMenuHandlers() {
  const boundKey = "__restpilotContextMenuHandlers";
  if ((window as Window & { [boundKey]?: boolean })[boundKey]) return;
  (window as Window & { [boundKey]?: boolean })[boundKey] = true;

  document.addEventListener("contextmenu", handleGlobalContextMenu, true);
  document.addEventListener("keydown", handleContextMenuKey, true);

  document.addEventListener(
    "pointerdown",
    (event) => {
      if (!state.contextMenu) return;
      if ((event.target as HTMLElement).closest(".context-menu")) return;
      if ((event.target as HTMLElement).closest("[data-copy-menu-trigger], [data-request-actions-trigger]")) return;
      closeContextMenu();
    },
    true
  );

  document.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("[data-menu-action]");
    if (!button?.closest(".context-menu") || !state.contextMenu) return;
    event.stopPropagation();
    const menu = state.contextMenu;
    const action = button.dataset.menuAction ?? "";
    closeContextMenu();
    if (menu.kind === "functions-tree") {
      const funcId = menu.functionId;
      if (action === "new-function") createNewFunction();
      if (action === "rename" && funcId) startFuncRename(funcId);
      if (action === "delete" && funcId) void deleteFunction(funcId);
      return;
    }
    if (menu.kind === "tree") {
      const itemId = menu.itemId;
      if (action === "new-request") createRequest(parentIdForTreeCreate(itemId));

      if (action === "new-folder") createFolder(parentIdForTreeCreate(itemId));
      if (action === "rename" && itemId) startTreeRename(itemId);
      if (action === "show" && itemId && getRequest(itemId)) openRequest(itemId);
      if (action === "duplicate" && itemId) duplicateItem(itemId);
      if (action === "copy-curl" && itemId) void copyRequestAsCurl(itemId);
      if (action === "delete" && itemId) deleteItem(itemId);
      return;
    }
    if (menu.kind === "text") {
      void runTextMenuAction(action);
      return;
    }
    if (menu.kind === "request-tab") {
      if (action === "close-tab") closeTab(menu.requestId);
      if (action === "close-other-tabs") closeOtherTabs(menu.requestId);
      if (action === "close-all-tabs") closeAllTabs();
      if (action === "duplicate") duplicateItem(menu.requestId);
      return;
    }
    if (menu.kind === "response-copy") {
      const request = getRequest(menu.requestId);
      const tab = state.tabs[menu.requestId];
      if (!request || !tab) return;
      if (action === "copy-response-selection") void copyResponseBodySelection();
      if (action === "copy-response-body") void copyResponseBody(request, tab);
      if (action === "copy-response-headers") void copyResponseHeaders(tab);
      if (action === "copy-response-status") void copyResponseStatus(tab);
      return;
    }
    if (menu.kind === "request-actions") {
      const request = getRequest(menu.requestId);
      const tab = state.tabs[menu.requestId];
      if (!request || !tab) return;
      if (action === "duplicate") duplicateItem(menu.requestId);
      if (action === "clear") {
        clearRequestResponse(request, tab);
        scheduleSave();
        render();
      }
      if (action === "toggle-stream") {
        request.streamResponse = !request.streamResponse;
        scheduleSave();
        refreshTabBar();
      }
    }
  });
}

function bindTree() {
  const tree = document.querySelector<HTMLElement>(".tree");
  tree?.addEventListener("keydown", async (event) => {
    if (state.editingTreeId) {
      if (event.key === "Enter") {
        event.preventDefault();
        commitTreeRename(state.editingTreeId);
      }
      if (event.key === "Escape") {
        event.preventDefault();
        cancelTreeRename();
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      selectAdjacentTreeItem(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      selectAdjacentTreeItem(-1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      const first = visibleTreeItems()[0];
      if (first) selectTreeItem(first.id, { render: true, focus: true });
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      const visible = visibleTreeItems();
      const last = visible[visible.length - 1];
      if (last) selectTreeItem(last.id, { render: true, focus: true });
      return;
    }

    const selected = state.selectedTreeId ? getItem(state.selectedTreeId) : null;
    if (!selected) return;

    if (event.key === "F2") {
      event.preventDefault();
      startTreeRename(selected.id);
      return;
    }
    if (event.key === "Delete") {
      event.preventDefault();
      await deleteItem(selected.id);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      activateTreeItem(selected.id);
      return;
    }
    if (event.key === "ArrowRight" && selected.kind === "folder") {
      event.preventDefault();
      if (!selected.expanded) {
        selected.expanded = true;
        scheduleSave();
        render();
      }
      return;
    }
    if (event.key === "ArrowLeft" && selected.kind === "folder") {
      event.preventDefault();
      if (selected.expanded) {
        selected.expanded = false;
        scheduleSave();
        render();
      } else if (selected.parentId) {
        selectTreeItem(selected.parentId, { render: true, focus: true });
      }
    }
  });
  const treeDropHost = tree?.closest<HTMLElement>(".collection-sidebar-panel") ?? tree;
  if (tree && treeDropHost && tree.dataset.pointerReorderBound !== "true") {
    tree.dataset.pointerReorderBound = "true";
    const clearTreeDropRoot = () => {
      tree.classList.remove("drop-root");
      treeDropHost.classList.remove("is-drop-root-target");
    };
    attachPointerReorder({
      container: treeDropHost,
      itemSelector: ".tree-row[data-tree-id]",
      ignoreSelector: "[data-tree-action], .tree-rename-input",
      getItemId: (element) => element.dataset.treeId ?? "",
      resolvePlacement: (target, event, sourceId) => dropPlacementFor(target, event, sourceId),
      resolveTarget: (event) => treeRowAtPointer(tree, event.clientX, event.clientY),
      shouldOfferRootDrop: (event) =>
        shouldOfferTreeRootDrop(tree, treeDropHost, event.clientX, event.clientY),
      onOverContainer: () => {
        tree.classList.add("drop-root");
        treeDropHost.classList.add("is-drop-root-target");
      },
      onLeaveContainer: clearTreeDropRoot,
      onCommitToRoot: (sourceId) => {
        clearTreeDropRoot();
        moveItemTo(sourceId, null, state.items.filter((item) => item.parentId === null).length);
      },
      onCommit: (sourceId, targetId, placement) => {
        clearTreeDropRoot();
        const target = getItem(targetId);
        if (!target) return;
        if (placement === "inside") {
          moveDroppedItem(sourceId, target, "inside");
          return;
        }
        moveDroppedItem(sourceId, target, placement);
      }
    });
  }

  document.querySelectorAll<HTMLElement>(".tree-row[data-tree-id]").forEach((row) => {
    const item = getItem(row.dataset.treeId ?? "");
    if (!item) return;

    row.querySelector<HTMLInputElement>(".tree-rename-input")?.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        commitTreeRename(item.id);
      }
      if (event.key === "Escape") {
        event.preventDefault();
        cancelTreeRename();
      }
    });
    row.querySelector<HTMLInputElement>(".tree-rename-input")?.addEventListener("blur", () => {
      if (state.editingTreeId === item.id) commitTreeRename(item.id);
    });

    row.querySelectorAll<HTMLButtonElement>("[data-tree-action]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const action = button.dataset.treeAction ?? "";
        const targetId = button.dataset.treeId ?? item.id;
        if (action === "rename") startTreeRename(targetId);
        if (action === "duplicate") duplicateItem(targetId);
        if (action === "delete") {
          void deleteItem(targetId);
        }
      });
    });

    row.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).closest("[data-tree-action], .tree-rename-input")) return;
      closeContextMenu();
      if (
        item.kind === "request" &&
        state.settings.clickToSelect &&
        state.openTabs.includes(item.id)
      ) {
        activateRequestTab(item.id);
        return;
      }
      selectTreeItem(item.id, { render: true, focus: true });
    });
    row.addEventListener("dblclick", (event) => {
      if ((event.target as HTMLElement).closest("[data-tree-action], .tree-rename-input")) return;
      activateTreeItem(item.id);
    });
  });

  focusTreeSelection();
}

function visibleTreeItems(): TreeItem[] {
  const result: TreeItem[] = [];
  const searchVisible = collectionSearchVisibleIds(state.items, state.collectionSearchQuery);
  const walk = (parentId: string | null) => {
    for (const item of childrenOf(parentId)) {
      if (searchVisible && !searchVisible.has(item.id)) continue;
      result.push(item);
      if (item.kind === "folder" && folderExpandedForSearch(item, searchVisible, state.items)) {
        walk(item.id);
      }
    }
  };
  walk(null);
  return result;
}

function selectTreeItem(itemId: string | null, options: { render?: boolean; focus?: boolean } = {}) {
  if (itemId) focusRequestWorkspace();
  state.selectedTreeId = itemId;
  if (options.render) {
    render();
    if (options.focus) focusTreeSelection();
  }
}

function selectAdjacentTreeItem(direction: 1 | -1) {
  const visible = visibleTreeItems();
  if (!visible.length) return;
  const currentIndex = state.selectedTreeId ? visible.findIndex((item) => item.id === state.selectedTreeId) : -1;
  let nextIndex = currentIndex < 0 ? (direction > 0 ? 0 : visible.length - 1) : currentIndex + direction;
  nextIndex = Math.max(0, Math.min(nextIndex, visible.length - 1));
  selectTreeItem(visible[nextIndex].id, { render: true, focus: true });
}

function startTreeRename(itemId: string) {
  const item = getItem(itemId);
  if (!item) return;
  state.editingTreeId = itemId;
  state.selectedTreeId = itemId;
  state.contextMenu = null;
  render();
  focusTreeRenameInput(itemId);
}

function commitTreeRename(itemId: string) {
  const item = getItem(itemId);
  const input = document.querySelector<HTMLInputElement>(`.tree-row[data-tree-id="${itemId}"] .tree-rename-input`);
  const nextTitle = input?.value.trim() ?? item?.title ?? "";
  state.editingTreeId = null;
  if (!item) {
    render();
    return;
  }
  if (nextTitle) item.title = nextTitle;
  scheduleSave();
  render();
  focusTreeSelection();
}

function cancelTreeRename() {
  const editingId = state.editingTreeId;
  if (editingId) {
    const item = getRequest(editingId);
    if (item && item.title === "New request" && !item.url.trim()) {
      state.items = state.items.filter((entry) => entry.id !== editingId);
      state.openTabs = state.openTabs.filter((id) => id !== editingId);
      delete state.tabs[editingId];
      if (state.activeTabId === editingId) state.activeTabId = state.openTabs[0] ?? "";
      if (state.selectedTreeId === editingId) state.selectedTreeId = null;
      scheduleSave();
    }
  }
  state.editingTreeId = null;
  render();
  focusTreeSelection();
}

function focusTreeRenameInput(itemId: string) {
  const input = document.querySelector<HTMLInputElement>(`.tree-row[data-tree-id="${itemId}"] .tree-rename-input`);
  if (!input) return;
  input.focus();
  input.select();
}

function focusTreeSelection() {
  if (state.editingTreeId) {
    focusTreeRenameInput(state.editingTreeId);
    return;
  }
  if (state.selectedTreeId) {
    const row = document.querySelector<HTMLElement>(`.tree-row[data-tree-id="${state.selectedTreeId}"]`);
    if (row) {
      row.focus();
      return;
    }
  }
  document.querySelector<HTMLElement>(".tree")?.focus();
}

function pickTreeFocusAfterDelete(itemId: string): string | null {
  const item = getItem(itemId);
  if (!item) return state.selectedTreeId;

  const siblings = childrenOf(item.parentId);
  const index = siblings.findIndex((sibling) => sibling.id === itemId);
  const remaining = siblings.filter((sibling) => sibling.id !== itemId);

  if (remaining.length > 0) {
    if (index < remaining.length) return remaining[index].id;
    return remaining[remaining.length - 1].id;
  }

  if (item.parentId) return item.parentId;

  const visible = visibleTreeItems().filter((entry) => entry.id !== itemId && !collectChildren(itemId).includes(entry.id));
  return visible[0]?.id ?? null;
}

function dropPlacementFor(row: HTMLElement, event: PointerEvent, sourceId: string): PointerReorderPlacement {
  const item = getItem(row.dataset.treeId ?? "");
  const source = getItem(sourceId);
  if (!item || !source) return "after";

  const rect = row.getBoundingClientRect();
  const y = event.clientY - rect.top;
  const third = rect.height / 3;

  if (item.kind === "folder" && source.id !== item.id && !collectChildren(source.id).includes(item.id)) {
    if (y < third) return "before";
    if (y > rect.height - third) return "after";
    return "inside";
  }

  if (y < rect.height / 2) return "before";
  return "after";
}

function activateTreeItem(itemId: string) {
  const item = getItem(itemId);
  if (!item) return;
  focusRequestWorkspace();
  if (item.kind === "folder") {
    item.expanded = !item.expanded;
  } else {
    openRequest(item.id);
  }
  scheduleSave();
  render();
}

function bindFormPairs(request: SavedRequest) {
  bindPairs(request.form, "form");
  if (request.bodyMode !== "multipart") return;

  document.querySelectorAll<HTMLSelectElement>(".form-part-type").forEach((select) => {
    const pair = request.form.find((item) => item.id === select.dataset.formId);
    if (!pair) return;
    select.addEventListener("change", () => {
      pair.partType = select.value === "file" ? "file" : "text";
      if (pair.partType === "text") {
        pair.fileName = undefined;
        pair.value = "";
      }
      scheduleSave();
      render();
    });
  });

  document.querySelectorAll<HTMLInputElement>(".form-file").forEach((input) => {
    const pair = request.form.find((item) => item.id === input.dataset.formId);
    if (!pair) return;
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result ?? "");
        pair.value = dataUrl.includes(",") ? dataUrl.split(",")[1] ?? "" : dataUrl;
        pair.fileName = file.name;
        pair.partType = "file";
        scheduleSave();
        render();
      };
      reader.readAsDataURL(file);
    });
  });
}

function bindPairs(list: Pair[], scope: "header" | "form" | "query", request?: SavedRequest) {
  const rerender = scope === "form" || scope === "query" ? () => renderWorkspace() : () => render();

  document.querySelectorAll<HTMLElement>(`[data-${scope}-id]`).forEach((row) => {
    const pair = list.find((item) => item.id === row.getAttribute(`data-${scope}-id`));
    if (!pair) return;
    const onQueryChange = () => {
      if (!request) return;
      syncUrlInputFromRequest(request);
      updateUrlPreview(request);
    };
    row.querySelector<HTMLInputElement>(`.${scope}-enabled`)?.addEventListener("change", (event) => {
      pair.enabled = (event.target as HTMLInputElement).checked;
      if (scope === "query") onQueryChange();
      scheduleSave();
    });
    row.querySelector<HTMLInputElement>(`.${scope}-key`)?.addEventListener("input", (event) => {
      pair.key = (event.target as HTMLInputElement).value;
      if (scope === "query") onQueryChange();
      scheduleSave();
    });
    row.querySelector<HTMLInputElement>(`.${scope}-value`)?.addEventListener("input", (event) => {
      pair.value = (event.target as HTMLInputElement).value;
      if (scope === "query") onQueryChange();
      scheduleSave();
    });
    row.querySelector(`.remove-${scope}`)?.addEventListener("click", () => {
      const index = list.findIndex((item) => item.id === pair.id);
      if (index >= 0) list.splice(index, 1);
      if (scope === "query") onQueryChange();
      scheduleSave();
      rerender();
    });
  });
}

function syncUrlInputFromRequest(request: SavedRequest) {
  const urlInput = document.querySelector<HTMLInputElement>("#url");
  if (!urlInput || document.activeElement === urlInput) return;
  urlInput.value = displayRequestUrl(request);
}

function onEffectiveVariablesChanged() {
  const request = getActiveRequest();
  if (request) updateUrlPreview(request);
  const chipLabel = document.querySelector(".env-chip-label");
  if (chipLabel) chipLabel.textContent = environmentChipLabel();
  document.querySelector("#request-env-btn")?.setAttribute("title", environmentChipLabel());
  if (state.openRequestPopover === "environment") syncRequestPopover();
}

function updateUrlPreview(request: SavedRequest) {
  const wrap = document.querySelector("#url-preview-wrap");
  const preview = document.querySelector("#url-preview");
  if (!wrap || !preview) return;
  const effectiveVariables = getEffectiveVariables();
  const visible = shouldShowUrlPreview(request, effectiveVariables);
  wrap.classList.toggle("is-hidden", !visible);
  preview.textContent = resolvedRequestUrl(request, effectiveVariables);
}

function bindResponseCopyMenu(tab: TabState) {
  const button = document.querySelector<HTMLButtonElement>("#copy-response-menu");
  button?.addEventListener("click", (event) => {
    event.stopPropagation();
    if (state.contextMenu?.kind === "response-copy" && state.contextMenu.requestId === tab.requestId) {
      closeContextMenu();
      return;
    }
    const rect = button.getBoundingClientRect();
    state.contextMenu = {
      kind: "response-copy",
      x: rect.right,
      y: rect.bottom + 4,
      requestId: tab.requestId,
      canCopySelection: hasResponseBodySelection()
    };
    syncContextMenu();
  });
}

async function copyResponseStatus(tab: TabState) {
  if (!tab.response) return;
  const line = `${tab.response.status} ${tab.response.status_text} · ${tab.response.duration_ms} ms`;
  await copyText(line);
}

async function trySendRequest() {
  if (state.activePanel !== "request") return;
  const request = getActiveRequest();
  if (!request) return;
  const tab = ensureTab(request.id);
  if (tab.loading) return;

  if (request.bodyMode === "multipart" && hasMissingMultipartFiles(request)) {
    const labels = t().request;
    const names = missingMultipartFileNames(request).join(", ");
    await messageDialog("warning", labels.multipartFilesMissingTitle, labels.multipartFilesMissingBody.replace("{names}", names));
    return;
  }

  await sendRequest();
}

async function copyResponseBody(request: SavedRequest, tab: TabState) {
  if (!tab.response) return;
  const body = getResponseBodyForDisplay(tab, tab.response.body, tab.response.headers);
  await copyText(body);
}

async function copyResponseHeaders(tab: TabState) {
  if (!tab.response) return;
  const text = Object.entries(tab.response.headers)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
  await copyText(text);
}

async function copyText(text: string) {
  const labels = t().messages;
  try {
    await navigator.clipboard.writeText(text);
    showToast(labels.copySuccess);
  } catch {
    await messageDialog("error", labels.copyCurlTitle, labels.copyFailed);
  }
}

function maybePrettifyRequestJson(request: SavedRequest) {
  if (!state.settings.autoPrettifyJson || request.bodyMode !== "raw" || request.rawType !== "json") return;
  const pretty = tryPrettifyJson(request.body);
  if (pretty) request.body = pretty;
}

function handleStreamEvent(
  payload: StreamPayload,
  runId: string,
  tab: TabState,
  onFinished?: () => void
) {
  if (payload.request_id !== runId) return;

  if (payload.error) {
    tab.error = payload.error;
    tab.streaming = false;
    scheduleResponseRender();
    onFinished?.();
    return;
  }

  if (payload.status !== undefined && payload.headers) {
    tab.response = {
      status: payload.status,
      status_text: payload.status_text ?? "",
      duration_ms: payload.duration_ms ?? 0,
      headers: payload.headers,
      body: tab.response?.body ?? ""
    };
    tab.loading = false;
    tab.streaming = !payload.done;
    tab.error = null;
  }

  if (payload.chunk) {
    if (!tab.response) {
      tab.response = { status: 0, status_text: "", duration_ms: 0, headers: {}, body: "" };
      tab.loading = false;
      tab.streaming = true;
    }
    tab.response.body += payload.chunk;
  }

  if (payload.done) {
    tab.streaming = false;
    if (tab.response && payload.duration_ms !== undefined) tab.response.duration_ms = payload.duration_ms;
    invalidateLineCache(tab);
    onFinished?.();
  }

  scheduleResponseRender();
}

function scheduleResponseRender() {
  if (responseRenderFrame) return;
  responseRenderFrame = requestAnimationFrame(() => {
    responseRenderFrame = undefined;
    const request = getActiveRequest();
    if (!request) return;
    const tab = state.tabs[request.id];
    if (!tab?.response) return;
    const card = document.querySelector(".response-card");
    if (!card) return;

    const canPatchBody =
      tab.selectedResponseTab === "body" &&
      card.querySelector("[data-response-body-viewer], [data-response-body-stream]");

    if (canPatchBody) {
      void refreshResponseBodyDisplay(request, tab);
      return;
    }

    card.innerHTML = renderResponse(tab);
    bindResponseTabs(request.id);
    void mountWorkspaceDisplays(request, tab);
  });
}

function bindRequestTabs(requestId: string) {
  const tab = state.tabs[requestId];
  if (!tab) return;
  document.querySelectorAll<HTMLButtonElement>(".request-card [data-request-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      tab.selectedRequestTab = button.dataset.requestTab as RequestTab;
      renderWorkspace();
    });
  });
}

function bindResponseTabs(requestId: string) {
  const tab = state.tabs[requestId];
  if (!tab) return;
  document.querySelectorAll<HTMLButtonElement>(".response-card [data-response-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      tab.selectedResponseTab = button.dataset.responseTab as ResponseTab;
      renderWorkspace();
    });
  });
}

async function sendRequest() {
  const request = getActiveRequest();
  if (!request) return;
  const tab = ensureTab(request.id);
  const runId = id();
  let unlisten: UnlistenFn | undefined;
  let finishStream: (() => void) | undefined;

  tab.loading = true;
  tab.streaming = false;
  tab.requestRunId = runId;
  tab.error = null;
  tab.response = null;
  render();

  try {
    const effectiveVariables = getEffectiveVariables();
    const headers = withContentType(request, buildRequestHeaders(request));

    const streamFinished = request.streamResponse
      ? new Promise<void>((resolve) => {
          finishStream = resolve;
        })
      : null;

    if (request.streamResponse) {
      unlisten = await listen<StreamPayload>(STREAM_EVENT, (event) => {
        handleStreamEvent(event.payload, runId, tab, finishStream);
      });
    }

    const payload = {
      request: {
        id: runId,
        method: request.method,
        url: resolvedOutboundUrl(request, effectiveVariables).trim(),
        headers,
        body_mode: request.bodyMode,
        raw_type: request.rawType,
        body: request.bodyMode === "raw" ? applyVariables(request.body, effectiveVariables) : "",
        form: buildFormPayload(request),
        stream: request.streamResponse
      },
      proxy: proxyPayload(state.settings.proxy),
      network: networkPayload(state.settings, request.streamResponse)
    };

    if (request.streamResponse) {
      await invoke("send_request", { payload });
      if (streamFinished) await streamFinished;
    } else {
      tab.response = await invoke<ApiResponse>("send_request", { payload });
    }

    tab.error = null;
    if (tab.response) {
      request.lastResponse = tab.response;
      request.lastError = null;
      scheduleSave();
    }
  } catch (error) {
    tab.error = error instanceof Error ? error.message : String(error);
    request.lastError = tab.error;
    scheduleSave();
  } finally {
    unlisten?.();
    tab.loading = false;
    tab.streaming = false;
    tab.requestRunId = null;
    render();
  }
}

async function cancelActiveRequest() {
  const request = getActiveRequest();
  const tab = request ? ensureTab(request.id) : null;
  if (!tab?.requestRunId) return;
  await invoke("cancel_request", { id: tab.requestRunId });
}

async function handleCurlPaste(event: ClipboardEvent) {
  const text = event.clipboardData?.getData("text") ?? "";
  if (!looksLikeCurl(text)) return;
  event.preventDefault();
  const parsed = parseCurl(text, id);
  const labels = t().messages;
  if (!parsed) {
    await messageDialog("error", labels.importCurlTitle, labels.importCurlFailed);
    return;
  }
  state.pendingCurl = parsed;
  const result = await applicationDialog({
    title: labels.importCurlTitle,
    body: labels.importCurlBody,
    mode: "curl-preview",
    resizable: true,
    previewHtml: renderCurlPreview(parsed)
  });
  const importAction = typeof result === "string" ? result : result.action;
  if (importAction === "import") {
    const current = getActiveRequest();
    if (current) {
      applyCurlToRequest(current, parsed);
      maybePrettifyRequestJson(current);
    }
    scheduleSave();
    render();
  }
  state.pendingCurl = null;
}

function renderCurlPreview(request: SavedRequest) {
  const modeLabel = bodyModeCurlLabel(request.bodyMode);
  const typeLabel = request.bodyMode === "raw" ? rawTypeCurlLabel(request.rawType) : "";
  return `
    <div class="curl-preview">
      <div class="curl-preview-summary">
        <div class="curl-preview-line"><b>${escapeHtml(request.method)}</b><span>${escapeHtml(displayRequestUrl(request))}</span></div>
        <div class="curl-preview-meta">${escapeHtml(typeLabel ? `${modeLabel} · ${typeLabel}` : modeLabel)}</div>
      </div>
      <pre>${escapeHtml(curlPreviewPayload(request))}</pre>
    </div>
  `;
}

async function copyRequestAsCurl(requestId: string) {
  const request = getRequest(requestId);
  if (!request) return;
  const variables = getEffectiveVariables();
  const labels = t().messages;
  if (requestUsesSecretVariables(request, variables)) {
    const answer = await messageDialog("confirmation", labels.copyCurlSecretsTitle, labels.copyCurlSecretsBody);
    if (answer !== "confirm") return;
  }
  const curl = requestToCurl(request, variablesForCurl(variables, true));
  try {
    await navigator.clipboard.writeText(curl);
    showToast(labels.copyCurlSuccess);
  } catch {
    await messageDialog("error", labels.copyCurlTitle, labels.copyCurlFailed);
  }
}

function parentIdForTreeCreate(contextItemId: string | null | undefined): string | null {
  if (!contextItemId) return null;
  const item = getItem(contextItemId);
  if (!item) return null;
  if (item.kind === "folder") return item.id;
  return item.parentId;
}

function createFolder(parentId: string | null = null) {
  focusRequestWorkspace();
  const folder: TreeItem = { id: id(), kind: "folder", parentId, title: "New folder", expanded: true };
  insertItemAt(folder, parentId, childCount(parentId));
  scheduleSave();
  startTreeRename(folder.id);
}

function createRequest(parentId: string | null = null) {
  const request = blankRequest(parentId);
  insertItemAt(request, parentId, childCount(parentId));
  state.autoTitleFromUrlId = request.id;
  openRequest(request.id);
  requestAnimationFrame(() => focusRequestUrl());
}

function focusRequestUrl() {
  const urlInput = document.querySelector<HTMLInputElement>("#url");
  if (!urlInput) return;
  urlInput.focus();
  urlInput.select();
}

function applyAutoTitleFromUrl(request: SavedRequest) {
  const derived = titleFromUrl(displayRequestUrl(request));
  if (!derived) return;
  request.title = derived;
  syncRequestTitle(request.id);
}

function titleFromUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    const withProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(withProtocol);
    const path = parsed.pathname.replace(/\/+$/, "");
    const segments = path.split("/").filter(Boolean);
    if (segments.length) return decodeURIComponent(segments[segments.length - 1]).slice(0, 80);
    const host = parsed.hostname.replace(/^www\./i, "");
    return host || null;
  } catch {
    const fallback = trimmed.split(/[/?#]/).filter(Boolean).pop();
    return fallback ? decodeURIComponent(fallback).slice(0, 80) : null;
  }
}

function duplicateItem(itemId: string) {
  const source = getItem(itemId);
  if (!source) return;

  const duplicateNaming = state.settings.duplicateNaming;
  let focusId = itemId;

  if (source.kind === "folder") {
    focusId = duplicateFolderItem(source, state.items, duplicateNaming);
  } else {
    const siblings = childrenOf(source.parentId);
    const insertIndex = siblings.findIndex((item) => item.id === source.id) + 1;
    focusId = duplicateRequestItem(source, state.items, duplicateNaming, insertIndex);
    openRequest(focusId);
  }

  state.selectedTreeId = focusId;
  scheduleSave();
  render();
  requestAnimationFrame(() => focusTreeSelection());
}

async function deleteItem(itemId: string) {
  const item = getItem(itemId);
  if (!item) return;
  const labels = t().messages;
  const answer = await messageDialog("confirmation", labels.deleteTitle, labels.deleteBody.replace("{name}", item.title));
  if (answer !== "confirm") {
    requestAnimationFrame(() => focusTreeSelection());
    return;
  }

  const ids = collectChildren(itemId);
  const nextFocus = pickTreeFocusAfterDelete(itemId);

  state.items = state.items.filter((entry) => !ids.includes(entry.id));
  state.openTabs = state.openTabs.filter((id) => !ids.includes(id));
  for (const idToDelete of ids) delete state.tabs[idToDelete];
  state.activeTabId = state.openTabs.includes(state.activeTabId) ? state.activeTabId : (state.openTabs[0] ?? "");
  if (state.editingTreeId && ids.includes(state.editingTreeId)) state.editingTreeId = null;
  if (state.autoTitleFromUrlId && ids.includes(state.autoTitleFromUrlId)) state.autoTitleFromUrlId = null;
  if (!state.selectedTreeId || ids.includes(state.selectedTreeId)) {
    state.selectedTreeId = nextFocus;
  }

  scheduleSave();
  render();
  requestAnimationFrame(() => focusTreeSelection());
}

function openRequest(requestId: string) {
  if (!getRequest(requestId)) return;
  if (state.autoTitleFromUrlId && state.autoTitleFromUrlId !== requestId) state.autoTitleFromUrlId = null;
  const panelChanged = focusRequestWorkspace();
  const isNewTab = !state.openTabs.includes(requestId);
  if (isNewTab) {
    state.openTabs.push(requestId);
    refreshTabBar();
  } else if (panelChanged) {
    refreshTabBar();
  }
  ensureTab(requestId);
  scheduleSave();

  if (isNewTab) {
    state.activeTabId = requestId;
    state.selectedTreeId = requestId;
    render();
    return;
  }

  if (document.querySelector(".workspace-body .request-editor")) {
    activateRequestTab(requestId);
    return;
  }

  state.activeTabId = requestId;
  state.selectedTreeId = requestId;
  render();
}

function afterOpenTabsChanged() {
  scheduleSave();
  refreshTabBar();

  if (state.activePanel === "request" && document.querySelector(".workspace-body")) {
    renderWorkspace();
    updateTreeRowActive();
    return;
  }

  render();
}

function closeTab(requestId: string) {
  if (!requestId || !state.openTabs.includes(requestId)) return;

  unmountTabDisplay(requestId);
  delete state.tabs[requestId];

  const closedIndex = state.openTabs.indexOf(requestId);
  state.openTabs = state.openTabs.filter((id) => id !== requestId);

  if (state.activeTabId === requestId) {
    const nextIndex = Math.min(closedIndex, Math.max(0, state.openTabs.length - 1));
    state.activeTabId = state.openTabs[nextIndex] ?? "";
    if (state.activeTabId) state.selectedTreeId = state.activeTabId;
  }

  afterOpenTabsChanged();
}

function closeOtherTabs(keepId: string) {
  if (!state.openTabs.includes(keepId)) return;

  for (const id of state.openTabs) {
    if (id === keepId) continue;
    unmountTabDisplay(id);
    delete state.tabs[id];
  }

  state.openTabs = [keepId];
  state.activeTabId = keepId;
  state.selectedTreeId = keepId;
  afterOpenTabsChanged();
}

function closeAllTabs() {
  for (const id of state.openTabs) {
    unmountTabDisplay(id);
    delete state.tabs[id];
  }

  state.openTabs = [];
  state.activeTabId = "";
  afterOpenTabsChanged();
}

function ensureTab(requestId: string) {
  const request = getRequest(requestId);
  if (!state.tabs[requestId]) {
    state.tabs[requestId] = {
      requestId,
      response: request?.lastResponse ?? null,
      error: request?.lastError ?? null,
      loading: false,
      streaming: false,
      requestRunId: null,
      selectedResponseTab: "body",
      selectedRequestTab: "body"
    };
  }
  const tab = state.tabs[requestId];
  if (!tab.selectedRequestTab) tab.selectedRequestTab = "body";
  return tab;
}

function clearRequestResponse(request: SavedRequest, tab: TabState) {
  tab.response = null;
  tab.error = null;
  request.lastResponse = null;
  request.lastError = null;
}

function syncRequestTitle(requestId: string) {
  const request = getRequest(requestId);
  if (!request) return;
  const row = document.querySelector(`[data-tree-id="${requestId}"] .tree-title`);
  if (row) row.textContent = request.title;
  const tabLabel = document.querySelector(`[data-open-tab="${requestId}"] .tab-label`);
  if (tabLabel) tabLabel.textContent = request.title;
}

let functionEditorUnmount: (() => void) | undefined;

let functionBodyEditorUnmount: (() => void) | undefined;
let functionExtractorEditorUnmount: (() => void) | undefined;

function unmountFunctionEditors() {
  functionBodyEditorUnmount?.();
  functionBodyEditorUnmount = undefined;
  functionExtractorEditorUnmount?.();
  functionExtractorEditorUnmount = undefined;
}

async function mountFunctionEditor(func: AppFunction) {
  unmountFunctionEditors();

  const editors = await getEditorRuntime();

  // 1. Mount Body Editor (if bodyMode === "raw")
  const bodyHost = document.getElementById("function-body-editor");
  if (bodyHost && func.bodyMode === "raw") {
    functionBodyEditorUnmount = editors.mountBodyEditor(bodyHost, func.body, {
      tabSize: state.settings.tabSize,
      rawType: func.rawType,
      onChange: (value) => {
        func.body = value;
        scheduleSave();
      },
      onSend: () => {
        void testFunction(func);
      }
    });
  }

  // 2. Mount Extractor Editor (JavaScript editor)
  const extractorHost = document.getElementById("function-extractor-editor");
  if (extractorHost) {
    functionExtractorEditorUnmount = editors.mountBodyEditor(extractorHost, func.extractorCode, {
      tabSize: state.settings.tabSize,
      rawType: "javascript",
      onChange: (value) => {
        func.extractorCode = value;
        scheduleSave();
      },
      onSend: () => {
        void testFunction(func);
      }
    });
  }
}

function renderFuncPair(pair: Pair, scope: "query" | "header" | "form") {
  const labels = t().pairs;
  const keyPlaceholder =
    scope === "header" ? labels.header : scope === "query" ? labels.param : "Name";
  return `
    <div class="pair-row" data-func-${scope}-id="${pair.id}">
      <input class="func-${scope}-enabled" type="checkbox" ${pair.enabled ? "checked" : ""} />
      <input class="func-${scope}-key" value="${escapeAttribute(pair.key)}" placeholder="${keyPlaceholder}" spellcheck="false" />
      <input class="func-${scope}-value" value="${escapeAttribute(pair.value)}" placeholder="${labels.value}" spellcheck="false" />
      <button class="mini-btn field-remove-btn remove-func-${scope}" type="button" aria-label="${t().tree.delete}">×</button>
    </div>
  `;
}

function renderFuncMultipartPair(pair: Pair) {
  const labels = t().request;
  const pairLabels = t().pairs;
  const partType = pair.partType === "file" ? "file" : "text";
  const valueField =
    partType === "file"
      ? `<label class="multipart-file-picker"><input class="func-form-file" data-func-form-id="${pair.id}" type="file" hidden /><span class="multipart-file-name">${escapeHtml(pair.fileName || labels.chooseFile)}</span></label>`
      : `<input class="func-form-value" value="${escapeAttribute(pair.value)}" placeholder="${pairLabels.value}" spellcheck="false" style="padding: 4px 8px; font-size: 13px;" />`;
  return `
    <div class="pair-row multipart-row" data-func-form-id="${pair.id}">
      <input class="func-form-enabled" type="checkbox" ${pair.enabled ? "checked" : ""} />
      <input class="func-form-key" value="${escapeAttribute(pair.key)}" placeholder="Name" spellcheck="false" />
      <select class="func-form-part-type" data-func-form-id="${pair.id}">
        <option value="text" ${partType === "text" ? "selected" : ""}>${labels.partText}</option>
        <option value="file" ${partType === "file" ? "selected" : ""}>${labels.partFile}</option>
      </select>
      ${valueField}
      <button class="mini-btn field-remove-btn remove-func-form" type="button" aria-label="${t().tree.delete}">×</button>
    </div>
  `;
}

function renderFuncBodyToolbarTrailing(func: AppFunction, labels: ReturnType<typeof t>["request"]) {
  if (func.bodyMode === "raw") {
    return `
      <label class="raw-type-select-wrap body-toolbar-trailing" style="margin-left: auto;">
        <span class="raw-type-select-label" style="font-size: 11px;">${labels.rawFormat}</span>
        <select id="func-raw-type" class="raw-type-select" aria-label="${labels.rawFormat}" style="font-size: 11px; padding: 2px 4px;">
          <option value="text" ${func.rawType === "text" ? "selected" : ""}>${labels.rawText}</option>
          <option value="json" ${func.rawType === "json" ? "selected" : ""}>${labels.rawJson}</option>
          <option value="xml" ${func.rawType === "xml" ? "selected" : ""}>${labels.rawXml}</option>
        </select>
      </label>
    `;
  }
  return "";
}

function renderFuncBodyEditor(func: AppFunction, labels: ReturnType<typeof t>["request"]) {
  if (func.bodyMode === "raw") {
    const modeClass =
      func.rawType === "json" ? "json-mode" : func.rawType === "xml" ? "xml-mode" : "text-mode";
    return `<div class="code-editor ${modeClass}" id="function-body-editor" data-body-editor-host="true" style="flex: 1; border: 1px solid var(--rp-border); border-radius: var(--rp-radius); overflow: hidden; min-height: 120px;"></div>`;
  }
  if (func.bodyMode === "none") {
    return `
      <div class="flex items-center justify-center flex-1" style="color: var(--rp-text-muted); font-size: 13px; border: 1px dashed var(--rp-border); border-radius: var(--rp-radius); min-height: 120px;">
        ${labels.none}
      </div>
    `;
  }
  const isMultipart = func.bodyMode === "multipart";
  const rows = func.form
    .map((pair) => (isMultipart ? renderFuncMultipartPair(pair) : renderFuncPair(pair, "form")))
    .join("");
  const multipartHint = isMultipart
    ? `<p class="hint multipart-hint">${labels.multipartFilesHint}</p>`
    : "";
  const actions = isMultipart
    ? `<div class="form-actions" style="margin-top: 8px; display: flex; gap: 8px;"><button class="quiet-button add-form" id="func-add-form" type="button" style="padding: 4px 8px; font-size: 12px;">${labels.addField}</button><button class="quiet-button add-form" id="func-add-multipart-file" type="button" style="padding: 4px 8px; font-size: 12px;">${labels.addFile}</button></div>`
    : `<div class="form-actions" style="margin-top: 8px;"><button class="quiet-button add-form" id="func-add-form" type="button" style="padding: 4px 8px; font-size: 12px;">${labels.addField}</button></div>`;
  return `
    <div class="flex flex-col flex-1 min-h-0 overflow-y-auto" style="border: 1px solid var(--rp-border); border-radius: var(--rp-radius); background: var(--rp-surface); padding: 8px;">
      ${multipartHint}
      <div class="headers-list form-list" style="margin-bottom: 8px; display: flex; flex-direction: column; gap: 4px;">${rows}</div>
      ${actions}
    </div>
  `;
}

function renderFuncAuthPanel(func: AppFunction) {
  const labels = t().request.auth;
  const auth = normalizeRequestAuth(func.auth);

  return `
    <div class="request-tab-panel request-auth-panel flex flex-col flex-1" style="padding: 0; align-content: start; align-items: start; display: grid; gap: 12px;">
      <label class="auth-field" style="display: flex; flex-direction: column; gap: 4px; width: 100%;">
        <span class="auth-field-label" style="font-size: 12px; font-weight: 600; color: var(--rp-text-muted);">${labels.type}</span>
        <select id="func-auth-type" data-func-auth-field="type" style="padding: 6px 12px; border-radius: 4px; border: 1px solid var(--rp-border); background: var(--rp-surface); font-weight: 500;">
          <option value="none" ${auth.type === "none" ? "selected" : ""}>${labels.typeNone}</option>
          <option value="bearer" ${auth.type === "bearer" ? "selected" : ""}>${labels.typeBearer}</option>
          <option value="basic" ${auth.type === "basic" ? "selected" : ""}>${labels.typeBasic}</option>
          <option value="apikey" ${auth.type === "apikey" ? "selected" : ""}>${labels.typeApiKey}</option>
        </select>
      </label>
      <div class="auth-fields${hiddenClass(auth.type !== "bearer")}" data-func-auth-panel="bearer" style="width: 100%;">
        <label class="auth-field" style="display: flex; flex-direction: column; gap: 4px; width: 100%;">
          <span class="auth-field-label" style="font-size: 12px; font-weight: 600; color: var(--rp-text-muted);">${labels.bearerToken}</span>
          <input id="func-auth-bearer-token" type="password" value="${escapeAttribute(auth.bearerToken ?? "")}" placeholder="${labels.bearerPlaceholder}" spellcheck="false" autocomplete="off" class="url-send-input" style="padding: 6px 12px;" />
        </label>
      </div>
      <div class="auth-fields${hiddenClass(auth.type !== "basic")}" data-func-auth-panel="basic" style="display: flex; flex-direction: column; gap: 12px; width: 100%;">
        <label class="auth-field" style="display: flex; flex-direction: column; gap: 4px; width: 100%;">
          <span class="auth-field-label" style="font-size: 12px; font-weight: 600; color: var(--rp-text-muted);">${labels.basicUsername}</span>
          <input id="func-auth-basic-username" value="${escapeAttribute(auth.basicUsername ?? "")}" placeholder="${labels.basicUsernamePlaceholder}" spellcheck="false" autocomplete="username" class="url-send-input" style="padding: 6px 12px;" />
        </label>
        <label class="auth-field" style="display: flex; flex-direction: column; gap: 4px; width: 100%;">
          <span class="auth-field-label" style="font-size: 12px; font-weight: 600; color: var(--rp-text-muted);">${labels.basicPassword}</span>
          <input id="func-auth-basic-password" type="password" value="${escapeAttribute(auth.basicPassword ?? "")}" placeholder="${labels.basicPasswordPlaceholder}" spellcheck="false" autocomplete="current-password" class="url-send-input" style="padding: 6px 12px;" />
        </label>
      </div>
      <div class="auth-fields${hiddenClass(auth.type !== "apikey")}" data-func-auth-panel="apikey" style="display: flex; flex-direction: column; gap: 12px; width: 100%;">
        <label class="auth-field" style="display: flex; flex-direction: column; gap: 4px; width: 100%;">
          <span class="auth-field-label" style="font-size: 12px; font-weight: 600; color: var(--rp-text-muted);">${labels.apiKeyName}</span>
          <input id="func-auth-api-key-name" value="${escapeAttribute(auth.apiKeyName ?? "")}" placeholder="${labels.apiKeyNamePlaceholder}" spellcheck="false" autocomplete="off" class="url-send-input" style="padding: 6px 12px;" />
        </label>
        <label class="auth-field" style="display: flex; flex-direction: column; gap: 4px; width: 100%;">
          <span class="auth-field-label" style="font-size: 12px; font-weight: 600; color: var(--rp-text-muted);">${labels.apiKeyValue}</span>
          <input id="func-auth-api-key-value" type="password" value="${escapeAttribute(auth.apiKeyValue ?? "")}" placeholder="${labels.apiKeyValuePlaceholder}" spellcheck="false" autocomplete="off" class="url-send-input" style="padding: 6px 12px;" />
        </label>
        <div class="auth-field" style="display: flex; flex-direction: column; gap: 4px; width: 100%;">
          <span class="auth-field-label" style="font-size: 12px; font-weight: 600; color: var(--rp-text-muted);">${labels.apiKeyIn}</span>
          <div class="segmented func-auth-key-location" style="width: fit-content;">
            <button type="button" class="${auth.apiKeyIn !== "query" ? "active" : ""}" data-func-auth-key-in="header">${labels.apiKeyHeader}</button>
            <button type="button" class="${auth.apiKeyIn === "query" ? "active" : ""}" data-func-auth-key-in="query">${labels.apiKeyQuery}</button>
          </div>
        </div>
      </div>
      <p class="auth-hint" style="font-size: 11px; color: var(--rp-text-muted); margin-top: 8px;">${labels.hint}</p>
    </div>
  `;
}

function bindFuncAuthPanel(func: AppFunction, onChange: () => void) {
  func.auth = normalizeRequestAuth(func.auth);

  const readFuncAuthFromForm = (): RequestAuth => {
    const type = (document.querySelector<HTMLSelectElement>("#func-auth-type")?.value ?? "none") as RequestAuth["type"];
    if (type === "bearer") {
      return {
        type,
        bearerToken: document.querySelector<HTMLInputElement>("#func-auth-bearer-token")?.value ?? ""
      };
    }
    if (type === "basic") {
      return {
        type,
        basicUsername: document.querySelector<HTMLInputElement>("#func-auth-basic-username")?.value ?? "",
        basicPassword: document.querySelector<HTMLInputElement>("#func-auth-basic-password")?.value ?? ""
      };
    }
    if (type === "apikey") {
      const active = document.querySelector<HTMLButtonElement>("[data-func-auth-key-in].active");
      return {
        type,
        apiKeyName: document.querySelector<HTMLInputElement>("#func-auth-api-key-name")?.value ?? "",
        apiKeyValue: document.querySelector<HTMLInputElement>("#func-auth-api-key-value")?.value ?? "",
        apiKeyIn: active?.dataset.funcAuthKeyIn === "query" ? "query" : "header"
      };
    }
    return defaultRequestAuth();
  };

  const persist = () => {
    func.auth = normalizeRequestAuth(readFuncAuthFromForm());
    onChange();
  };

  document.querySelector<HTMLSelectElement>("#func-auth-type")?.addEventListener("change", (event) => {
    const type = (event.target as HTMLSelectElement).value as RequestAuth["type"];
    document.querySelectorAll<HTMLElement>("[data-func-auth-panel]").forEach((panel) => {
      panel.classList.toggle("is-hidden", panel.dataset.funcAuthPanel !== type);
    });
    persist();
  });

  document.querySelectorAll("#func-auth-type ~ div input, [data-func-auth-panel] input").forEach((input) => {
    input.addEventListener("input", persist);
  });

  document.querySelectorAll<HTMLButtonElement>("[data-func-auth-key-in]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll<HTMLButtonElement>("[data-func-auth-key-in]").forEach((entry) => {
        entry.classList.toggle("active", entry === button);
      });
      persist();
    });
  });
}

function renderFunctionWorkspace(func: AppFunction) {
  const labels = t().request;
  const funcLabels = t().functions;

  // Render Console Output Panels
  const res = func.lastTestResult;

  // 1. Raw Response Panel (Left Panel bottom)
  let rawResponsePanel = "";
  if (state.activeFunctionConsoleLoading) {
    rawResponsePanel = `
      <div class="flex flex-col items-center justify-center flex-1" style="color: var(--rp-text-muted); font-size: 13px; height: 180px; min-height: 180px; border: 1px solid var(--rp-border); border-radius: var(--rp-radius); background: var(--rp-surface);">
        <span class="send-icon-spin" style="margin-bottom: 8px; width: 16px; height: 16px; border: 2px solid var(--rp-text-muted); border-right-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite; display: inline-block;"></span>
        ${funcLabels.testing}
      </div>
    `;
  } else if (!res) {
    rawResponsePanel = `
      <div class="flex items-center justify-center flex-1" style="color: var(--rp-text-muted); font-size: 13px; text-align: center; padding: 24px; height: 180px; min-height: 180px; border: 1px dashed var(--rp-border); border-radius: var(--rp-radius); background: var(--rp-surface);">
        No response body yet.
      </div>
    `;
  } else {
    rawResponsePanel = `
      <div class="flex flex-col flex-1 min-h-0" style="padding: 12px; border: 1px solid var(--rp-border); border-radius: var(--rp-radius); background: var(--rp-surface); font-family: monospace; font-size: 13px; overflow-y: auto; text-align: left; height: 180px; min-height: 180px;">
        <pre style="margin: 0; white-space: pre-wrap; word-break: break-all; color: var(--rp-text-muted);">${escapeHtml(res.responseBody || "No response body.")}</pre>
      </div>
    `;
  }

  // 2. Extracted Outcome Panel (Right Panel bottom)
  let extractedOutcomePanel = "";
  if (state.activeFunctionConsoleLoading) {
    extractedOutcomePanel = `
      <div class="flex flex-col items-center justify-center flex-1" style="color: var(--rp-text-muted); font-size: 13px; height: 180px; min-height: 180px; border: 1px solid var(--rp-border); border-radius: var(--rp-radius); background: var(--rp-surface);">
        <span class="send-icon-spin" style="margin-bottom: 8px; width: 16px; height: 16px; border: 2px solid var(--rp-text-muted); border-right-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite; display: inline-block;"></span>
        ${funcLabels.testing}
      </div>
    `;
  } else if (!res) {
    extractedOutcomePanel = `
      <div class="flex items-center justify-center flex-1" style="color: var(--rp-text-muted); font-size: 13px; text-align: center; padding: 24px; height: 180px; min-height: 180px; border: 1px dashed var(--rp-border); border-radius: var(--rp-radius); background: var(--rp-surface);">
        ${funcLabels.emptyTestResult}
      </div>
    `;
  } else if (res.success) {
    let formattedVal = "";
    try {
      formattedVal = typeof res.extractedValue === "object" ? JSON.stringify(res.extractedValue, null, 2) : String(res.extractedValue);
    } catch {
      formattedVal = String(res.extractedValue);
    }
    extractedOutcomePanel = `
      <div class="flex flex-col flex-1 min-h-0" style="padding: 12px; border: 1px solid var(--rp-border); border-radius: var(--rp-radius); background: var(--rp-surface); font-family: monospace; font-size: 13px; overflow-y: auto; text-align: left; height: 180px; min-height: 180px;">
        <div style="margin-bottom: 8px; font-weight: 600; color: #4b8b3b; display: flex; align-items: center; gap: 6px;">
          <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #4b8b3b;"></span>
          ${funcLabels.success}
        </div>
        <pre style="margin: 0; white-space: pre-wrap; word-break: break-all; color: var(--rp-text);">${escapeHtml(formattedVal)}</pre>
      </div>
    `;
  } else {
    extractedOutcomePanel = `
      <div class="flex flex-col flex-1 min-h-0" style="padding: 12px; border: 1px solid #b54a3a33; border-radius: var(--rp-radius); background: #b54a3a0a; font-family: monospace; font-size: 13px; overflow-y: auto; text-align: left; height: 180px; min-height: 180px;">
        <div style="margin-bottom: 8px; font-weight: 600; color: #b54a3a; display: flex; align-items: center; gap: 6px;">
          <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #b54a3a;"></span>
          ${funcLabels.failure}
        </div>
        <pre style="margin: 0; white-space: pre-wrap; color: #b54a3a;">${escapeHtml(res.error || "Unknown error occurred.")}</pre>
      </div>
    `;
  }

  return `
    <div class="request-editor" style="height: 100%; display: flex; flex-direction: column;">
      <div class="editor-grid" style="grid-template-columns: 1fr 1fr; gap: 16px; flex: 1; min-height: 0; height: 100%;">
        
        <!-- Left Panel: HTTP Request Builder & Raw Response Body -->
        <div class="request-card flex flex-col h-full" style="padding: var(--workspace-panel-inset-block) var(--workspace-panel-inset-inline); min-height: 0; overflow: hidden; display: flex; flex-direction: column;">
          
          <!-- Header -->
          <div class="flex-shrink-0" style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--rp-border);">
            <span style="font-weight: 600; font-size: 13px; color: var(--rp-text);">${funcLabels.functionType}: HTTP Request</span>
          </div>

          <!-- URL Bar -->
          <div class="url-send-row flex-shrink-0" style="margin-bottom: 12px; display: flex; gap: 8px; width: 100%;">
            <select id="func-method" class="url-method-select" aria-label="HTTP Method" style="font-weight: 700; width: 100px; padding: 6px 12px; border-radius: 4px; border: 1px solid var(--rp-border); background: var(--rp-surface);">
              <option value="GET" ${func.method === "GET" ? "selected" : ""}>GET</option>
              <option value="POST" ${func.method === "POST" ? "selected" : ""}>POST</option>
              <option value="PUT" ${func.method === "PUT" ? "selected" : ""}>PUT</option>
              <option value="DELETE" ${func.method === "DELETE" ? "selected" : ""}>DELETE</option>
              <option value="PATCH" ${func.method === "PATCH" ? "selected" : ""}>PATCH</option>
              <option value="OPTIONS" ${func.method === "OPTIONS" ? "selected" : ""}>OPTIONS</option>
              <option value="HEAD" ${func.method === "HEAD" ? "selected" : ""}>HEAD</option>
            </select>
            <input
              id="func-url"
              class="url-send-input"
              value="${escapeAttribute(func.url)}"
              placeholder="https://api.example.com/endpoint"
              spellcheck="false"
              autocomplete="off"
              style="flex: 1; min-width: 0; padding: 6px 12px; border-radius: 4px; border: 1px solid var(--rp-border); background: var(--rp-surface);"
            />
          </div>

          <!-- Popover Badge Buttons Row (Guaranteed horizontal stack with flex row) -->
          <div style="display: flex; flex-direction: row; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; width: 100%;" class="flex-shrink-0">
            <button type="button" class="segmented-btn" id="func-popover-params-btn" style="padding: 4px 10px; font-size: 12px; border-radius: 4px; border: 1px solid var(--rp-border); background: var(--rp-surface); cursor: pointer; display: inline-flex; align-items: center; flex-direction: row; gap: 4px;">
              ${labels.params} <span class="badge" style="background: var(--rp-border); padding: 1px 5px; border-radius: 10px; font-size: 10px; font-weight: 700; margin-left: 6px;">${func.queryParams.length}</span>
            </button>
            <button type="button" class="segmented-btn" id="func-popover-headers-btn" style="padding: 4px 10px; font-size: 12px; border-radius: 4px; border: 1px solid var(--rp-border); background: var(--rp-surface); cursor: pointer; display: inline-flex; align-items: center; flex-direction: row; gap: 4px;">
              ${labels.headers} <span class="badge" style="background: var(--rp-border); padding: 1px 5px; border-radius: 10px; font-size: 10px; font-weight: 700; margin-left: 6px;">${func.headers.length}</span>
            </button>
            <button type="button" class="segmented-btn" id="func-popover-body-btn" style="padding: 4px 10px; font-size: 12px; border-radius: 4px; border: 1px solid var(--rp-border); background: var(--rp-surface); cursor: pointer; display: inline-flex; align-items: center; flex-direction: row; gap: 4px;">
              ${labels.body} <span class="badge" style="background: var(--rp-border); padding: 1px 5px; border-radius: 10px; font-size: 10px; font-weight: 700; margin-left: 6px;">${func.bodyMode === "none" ? "none" : func.rawType}</span>
            </button>
            <button type="button" class="segmented-btn" id="func-popover-auth-btn" style="padding: 4px 10px; font-size: 12px; border-radius: 4px; border: 1px solid var(--rp-border); background: var(--rp-surface); cursor: pointer; display: inline-flex; align-items: center; flex-direction: row; gap: 4px;">
              ${labels.authTab} <span class="badge" style="background: var(--rp-border); padding: 1px 5px; border-radius: 10px; font-size: 10px; font-weight: 700; margin-left: 6px;">${func.auth.type}</span>
            </button>
          </div>

          <!-- Summary Dashboard -->
          <div class="flex-1 min-h-0 overflow-y-auto" style="display: flex; flex-direction: column; gap: 16px; margin-top: 4px; padding-top: 4px; margin-bottom: 8px;">
            <!-- Active Parameters Summary -->
            <div style="background: var(--rp-surface-low); border: 1px solid var(--rp-border); border-radius: 6px; padding: 12px; display: flex; flex-direction: column; gap: 8px;">
              <span style="font-weight: 700; font-size: 11px; text-transform: uppercase; color: var(--rp-text-muted); letter-spacing: 0.05em;">Query Parameters</span>
              <div id="func-summary-query-params" style="display: flex; flex-direction: column; gap: 4px;">
                ${func.queryParams.filter(p => p.enabled && p.key.trim()).length === 0
                  ? `<span style="font-size: 12px; color: var(--rp-text-muted); font-style: italic;">No active parameters</span>`
                  : func.queryParams.filter(p => p.enabled && p.key.trim()).map(p => `
                    <div class="flex items-center justify-between" style="font-size: 12px; font-family: monospace;">
                      <span style="color: var(--rp-text-primary); font-weight: 600;">${escapeHtml(p.key)}</span>
                      <span style="color: var(--rp-text-muted);">${escapeHtml(p.value)}</span>
                    </div>
                  `).join("")
                }
              </div>
            </div>

            <!-- Active Headers Summary -->
            <div style="background: var(--rp-surface-low); border: 1px solid var(--rp-border); border-radius: 6px; padding: 12px; display: flex; flex-direction: column; gap: 8px;">
              <span style="font-weight: 700; font-size: 11px; text-transform: uppercase; color: var(--rp-text-muted); letter-spacing: 0.05em;">Request Headers</span>
              <div id="func-summary-headers" style="display: flex; flex-direction: column; gap: 4px;">
                ${func.headers.filter(h => h.enabled && h.key.trim()).length === 0
                  ? `<span style="font-size: 12px; color: var(--rp-text-muted); font-style: italic;">No active headers</span>`
                  : func.headers.filter(h => h.enabled && h.key.trim()).map(h => `
                    <div class="flex items-center justify-between" style="font-size: 12px; font-family: monospace;">
                      <span style="color: var(--rp-text-primary); font-weight: 600;">${escapeHtml(h.key)}</span>
                      <span style="color: var(--rp-text-muted);">${escapeHtml(h.value)}</span>
                    </div>
                  `).join("")
                }
              </div>
            </div>

            <!-- Body and Auth Summary -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div style="background: var(--rp-surface-low); border: 1px solid var(--rp-border); border-radius: 6px; padding: 12px; display: flex; flex-direction: column; gap: 4px;">
                <span style="font-weight: 700; font-size: 11px; text-transform: uppercase; color: var(--rp-text-muted); letter-spacing: 0.05em;">Body Mode</span>
                <span id="func-summary-body-mode" style="font-size: 13px; font-weight: 600; color: var(--rp-text-primary);">${func.bodyMode === "none" ? "None" : func.rawType.toUpperCase()}</span>
              </div>
              <div style="background: var(--rp-surface-low); border: 1px solid var(--rp-border); border-radius: 6px; padding: 12px; display: flex; flex-direction: column; gap: 4px;">
                <span style="font-weight: 700; font-size: 11px; text-transform: uppercase; color: var(--rp-text-muted); letter-spacing: 0.05em;">Auth Type</span>
                <span id="func-summary-auth-type" style="font-size: 13px; font-weight: 600; color: var(--rp-text-primary);">${func.auth.type === "none" ? "No Auth" : func.auth.type.toUpperCase()}</span>
              </div>
            </div>
          </div>

          <!-- Divider & Raw Response Title -->
          <div class="flex-shrink-0" style="margin-top: 16px; margin-bottom: 8px; border-top: 1px solid var(--rp-border); padding-top: 16px; display: flex; align-items: center; justify-content: space-between;">
            <span style="font-weight: 700; font-size: 11px; text-transform: uppercase; color: var(--rp-text-muted); letter-spacing: 0.05em;">Raw Response Body</span>
            ${res ? `<span style="font-size: 11px; font-weight: 600; color: #4b8b3b; font-family: monospace;">HTTP ${res.responseStatus}</span>` : ""}
          </div>

          <!-- Raw Response Content -->
          <div class="flex-shrink-0 flex flex-col" style="height: 180px; min-height: 180px; display: flex; flex-direction: column;">
            ${rawResponsePanel}
          </div>
        </div>

        <!-- Right Panel: Extractor Script with green Play action in header -->
        <div class="request-card flex flex-col h-full" style="padding: var(--workspace-panel-inset-block) var(--workspace-panel-inset-inline); min-height: 0; overflow: hidden; display: flex; flex-direction: column;">
          
          <!-- Header -->
          <div class="flex-shrink-0" style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--rp-border); display: flex; align-items: center; justify-content: space-between; height: 28px;">
            <span style="font-weight: 600; font-size: 13px; color: var(--rp-text);">${funcLabels.extractorCode} (JavaScript)</span>
            <button class="quiet-button ${state.activeFunctionConsoleLoading ? "is-loading" : ""}" id="test-function-btn" type="button" title="${funcLabels.testFunction}" style="display: flex; align-items: center; justify-content: center; background: transparent; border: none; cursor: pointer; color: #2ecc71; padding: 4px; border-radius: 4px; transition: background 0.2s; min-width: unset; height: 28px; width: 28px;" onmouseover="this.style.background='rgba(46, 204, 113, 0.1)'" onmouseout="this.style.background='transparent'">
              <span class="send-icon-spin" style="display: ${state.activeFunctionConsoleLoading ? "inline-block" : "none"}; width: 14px; height: 14px; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite;"></span>
              <svg style="display: ${state.activeFunctionConsoleLoading ? "none" : "block"}; width: 18px; height: 18px;" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </button>
          </div>

          <!-- CodeMirror JS Editor Container -->
          <div class="flex-1 min-h-0 flex flex-col" style="position: relative; display: flex; flex-direction: column; height: 100%; margin-bottom: 8px;">
            <div
              id="function-extractor-editor"
              data-body-editor-host="true"
              style="flex: 1; min-height: 0; border: 1px solid var(--rp-border); border-radius: var(--rp-radius); overflow: hidden; height: 100%;"
            ></div>
          </div>

          <!-- Extracted Outcome Title -->
          <div class="flex-shrink-0" style="margin-top: 16px; margin-bottom: 8px; border-top: 1px solid var(--rp-border); padding-top: 16px; display: flex; align-items: center;">
            <span style="font-weight: 700; font-size: 11px; text-transform: uppercase; color: var(--rp-text-muted); letter-spacing: 0.05em;">Extracted Outcome</span>
          </div>

          <!-- Extracted Outcome Content -->
          <div class="flex-shrink-0 flex flex-col" style="height: 180px; min-height: 180px; display: flex; flex-direction: column;">
            ${extractedOutcomePanel}
          </div>
        </div>

      </div>
    </div>
  `;
}

function bindFunctionWorkspace(func: AppFunction) {
  // A. Handle Method and URL changes
  const methodSelect = document.querySelector<HTMLSelectElement>("#func-method");
  if (methodSelect) {
    methodSelect.addEventListener("change", () => {
      func.method = methodSelect.value;
      scheduleSave();
    });
  }

  const urlInput = document.querySelector<HTMLInputElement>("#func-url");
  if (urlInput) {
    urlInput.addEventListener("input", () => {
      func.url = urlInput.value;
      scheduleSave();
    });
  }

  // B. Handle Popover Badge Buttons Clicking
  ["params", "headers", "body", "auth"].forEach((kind: any) => {
    const btn = document.getElementById(`func-popover-${kind}-btn`);
    btn?.addEventListener("click", (event) => {
      event.stopPropagation();
      if (state.activeFunctionPopover === kind) {
        state.activeFunctionPopover = null;
        removePopovers();
      } else {
        state.activeFunctionPopover = kind;
        syncFunctionPopover();
      }
    });
  });

  // C. Handle Tab Switcher for Console Output (Right Panel)
  document.querySelectorAll<HTMLButtonElement>("[data-func-console-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const targetTab = button.dataset.funcConsoleTab as any;
      state.activeFunctionConsoleTab = targetTab;
      renderWorkspace();
    });
  });

  // I. Test Function button trigger
  const testBtn = document.querySelector<HTMLButtonElement>("#test-function-btn");
  if (testBtn) {
    testBtn.addEventListener("click", () => {
      void testFunction(func);
    });
  }
}

function updateFunctionSummaryDashboard(func: AppFunction) {
  // Update query params count badge
  const paramsBtn = document.getElementById("func-popover-params-btn");
  if (paramsBtn) {
    const badge = paramsBtn.querySelector(".badge");
    if (badge) badge.textContent = String(func.queryParams.length);
  }

  // Update headers count badge
  const headersBtn = document.getElementById("func-popover-headers-btn");
  if (headersBtn) {
    const badge = headersBtn.querySelector(".badge");
    if (badge) badge.textContent = String(func.headers.length);
  }

  // Update body mode badge
  const bodyBtn = document.getElementById("func-popover-body-btn");
  if (bodyBtn) {
    const badge = bodyBtn.querySelector(".badge");
    if (badge) badge.textContent = func.bodyMode === "none" ? "none" : func.rawType;
  }

  // Update auth badge
  const authBtn = document.getElementById("func-popover-auth-btn");
  if (authBtn) {
    const badge = authBtn.querySelector(".badge");
    if (badge) badge.textContent = func.auth.type;
  }

  // Update Query Params Summary container
  const querySummary = document.getElementById("func-summary-query-params");
  if (querySummary) {
    const activeParams = func.queryParams.filter(p => p.enabled && p.key.trim());
    querySummary.innerHTML = activeParams.length === 0
      ? `<span style="font-size: 12px; color: var(--rp-text-muted); font-style: italic;">No active parameters</span>`
      : activeParams.map(p => `
        <div class="flex items-center justify-between" style="font-size: 12px; font-family: monospace;">
          <span style="color: var(--rp-text-primary); font-weight: 600;">${escapeHtml(p.key)}</span>
          <span style="color: var(--rp-text-muted);">${escapeHtml(p.value)}</span>
        </div>
      `).join("");
  }

  // Update Headers Summary container
  const headersSummary = document.getElementById("func-summary-headers");
  if (headersSummary) {
    const activeHeaders = func.headers.filter(h => h.enabled && h.key.trim());
    headersSummary.innerHTML = activeHeaders.length === 0
      ? `<span style="font-size: 12px; color: var(--rp-text-muted); font-style: italic;">No active headers</span>`
      : activeHeaders.map(h => `
        <div class="flex items-center justify-between" style="font-size: 12px; font-family: monospace;">
          <span style="color: var(--rp-text-primary); font-weight: 600;">${escapeHtml(h.key)}</span>
          <span style="color: var(--rp-text-muted);">${escapeHtml(h.value)}</span>
        </div>
      `).join("");
  }

  // Update Body Mode Summary text
  const bodySummary = document.getElementById("func-summary-body-mode");
  if (bodySummary) {
    bodySummary.textContent = func.bodyMode === "none" ? "None" : func.rawType.toUpperCase();
  }

  // Update Auth Type Summary text
  const authSummary = document.getElementById("func-summary-auth-type");
  if (authSummary) {
    authSummary.textContent = func.auth.type === "none" ? "No Auth" : func.auth.type.toUpperCase();
  }
}

function syncFunctionPopover() {
  removePopovers();
  const kind = state.activeFunctionPopover;
  if (!kind || state.activePanel !== "functions" || !state.activeFunctionId) return;

  const func = state.functions.find(f => f.id === state.activeFunctionId);
  if (!func) return;

  const btnId = `func-popover-${kind}-btn`;
  const anchor = document.getElementById(btnId);
  if (!anchor) {
    state.activeFunctionPopover = null;
    return;
  }

  const labels = t().request;
  let title = "";
  let bodyHtml = "";

  if (kind === "params") {
    title = labels.params;
    bodyHtml = `
      <div class="request-tab-panel flex flex-col flex-1 min-h-0" style="padding: 0; width: 100%; height: 100%; display: flex; flex-direction: column;">
        <div class="request-tab-toolbar flex-shrink-0" style="margin-bottom: 8px; display: flex; justify-content: flex-end;">
          <button class="mini-btn" id="func-add-query" type="button" aria-label="${labels.addField}">+</button>
        </div>
        <div class="headers-list request-pairs-list flex-1 overflow-y-auto" style="min-height: 0; display: flex; flex-direction: column; gap: 4px;">
          ${func.queryParams.length === 0 
            ? `<div style="padding: 16px; text-align: center; color: var(--rp-text-muted); font-size: 12px; font-style: italic;">No parameters</div>`
            : func.queryParams.map((pair) => renderFuncPair(pair, "query")).join("")
          }
        </div>
      </div>
    `;
  } else if (kind === "headers") {
    title = labels.headers;
    bodyHtml = `
      <div class="request-tab-panel flex flex-col flex-1 min-h-0" style="padding: 0; width: 100%; height: 100%; display: flex; flex-direction: column;">
        <div class="request-tab-toolbar flex-shrink-0" style="margin-bottom: 8px; display: flex; justify-content: flex-end;">
          <button class="mini-btn" id="func-add-header" type="button" aria-label="${labels.addField}">+</button>
        </div>
        <div class="headers-list request-pairs-list flex-1 overflow-y-auto" style="min-height: 0; display: flex; flex-direction: column; gap: 4px;">
          ${func.headers.length === 0 
            ? `<div style="padding: 16px; text-align: center; color: var(--rp-text-muted); font-size: 12px; font-style: italic;">No headers</div>`
            : func.headers.map((pair) => renderFuncPair(pair, "header")).join("")
          }
        </div>
      </div>
    `;
  } else if (kind === "body") {
    title = labels.body;
    bodyHtml = `
      <div class="request-tab-panel flex flex-col flex-1 min-h-0" style="padding: 0; width: 100%; height: 100%; display: flex; flex-direction: column;">
        <div class="body-toolbar flex-shrink-0" style="margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
          <div class="segmented body-mode-switch" style="display: flex; gap: 2px;">
            <button class="${func.bodyMode === "raw" ? "active" : ""}" data-func-body-mode="raw" type="button" style="padding: 3px 8px; font-size: 11px;">${labels.raw}</button>
            <button class="${func.bodyMode === "form" ? "active" : ""}" data-func-body-mode="form" type="button" style="padding: 3px 8px; font-size: 11px;">${labels.form}</button>
            <button class="${func.bodyMode === "multipart" ? "active" : ""}" data-func-body-mode="multipart" type="button" style="padding: 3px 8px; font-size: 11px;">${labels.multipart}</button>
            <button class="${func.bodyMode === "none" ? "active" : ""}" data-func-body-mode="none" type="button" style="padding: 3px 8px; font-size: 11px;">${labels.none}</button>
          </div>
          ${renderFuncBodyToolbarTrailing(func, labels)}
        </div>
        <div class="flex-1 min-h-0 flex flex-col" style="position: relative; min-height: 150px; display: flex; flex-direction: column;">
          ${renderFuncBodyEditor(func, labels)}
        </div>
      </div>
    `;
  } else if (kind === "auth") {
    title = labels.authTab;
    bodyHtml = `
      <div class="request-tab-panel flex flex-col flex-1 min-h-0" style="padding: 0; width: 100%; height: 100%; display: flex; flex-direction: column;">
        ${renderFuncAuthPanel(func)}
      </div>
    `;
  }

  const html = renderPopoverShell({
    className: `func-${kind}-popover`,
    title,
    bodyHtml,
    resizable: true
  });

  const popover = mountPopover(html, anchor);
  anchor.setAttribute("aria-expanded", "true");
  anchor.classList.add("is-active");

  bindPopoverClose(popover, () => {
    state.activeFunctionPopover = null;
    removePopovers();
    anchor.setAttribute("aria-expanded", "false");
    anchor.classList.remove("is-active");
  });

  bindFuncPopoverEvents(popover, func, kind);
}

function bindFuncPopoverEvents(popover: HTMLElement, func: AppFunction, kind: "params" | "headers" | "body" | "auth") {
  const labels = t().request;
  const onChange = () => {
    scheduleSave();
    updateFunctionSummaryDashboard(func);
  };

  if (kind === "params") {
    const addQueryBtn = popover.querySelector<HTMLButtonElement>("#func-add-query");
    if (addQueryBtn) {
      addQueryBtn.addEventListener("click", () => {
        func.queryParams.push({ id: id(), key: "", value: "", enabled: true });
        onChange();
        syncFunctionPopover();
      });
    }

    popover.querySelectorAll<HTMLInputElement>(".func-query-enabled").forEach((checkbox) => {
      const row = checkbox.closest<HTMLElement>("[data-func-query-id]");
      const paramId = row?.dataset.funcQueryId;
      checkbox.addEventListener("change", () => {
        const param = func.queryParams.find((p) => p.id === paramId);
        if (param) {
          param.enabled = checkbox.checked;
          onChange();
        }
      });
    });

    popover.querySelectorAll<HTMLInputElement>(".func-query-key").forEach((input) => {
      const row = input.closest<HTMLElement>("[data-func-query-id]");
      const paramId = row?.dataset.funcQueryId;
      input.addEventListener("input", () => {
        const param = func.queryParams.find((p) => p.id === paramId);
        if (param) {
          param.key = input.value;
          onChange();
        }
      });
    });

    popover.querySelectorAll<HTMLInputElement>(".func-query-value").forEach((input) => {
      const row = input.closest<HTMLElement>("[data-func-query-id]");
      const paramId = row?.dataset.funcQueryId;
      input.addEventListener("input", () => {
        const param = func.queryParams.find((p) => p.id === paramId);
        if (param) {
          param.value = input.value;
          onChange();
        }
      });
    });

    popover.querySelectorAll<HTMLButtonElement>(".remove-func-query").forEach((btn) => {
      const row = btn.closest<HTMLElement>("[data-func-query-id]");
      const paramId = row?.dataset.funcQueryId;
      btn.addEventListener("click", () => {
        func.queryParams = func.queryParams.filter((p) => p.id !== paramId);
        onChange();
        syncFunctionPopover();
      });
    });
  }

  if (kind === "headers") {
    const addHeaderBtn = popover.querySelector<HTMLButtonElement>("#func-add-header");
    if (addHeaderBtn) {
      addHeaderBtn.addEventListener("click", () => {
        func.headers.push({ id: id(), key: "", value: "", enabled: true });
        onChange();
        syncFunctionPopover();
      });
    }

    popover.querySelectorAll<HTMLInputElement>(".func-header-enabled").forEach((checkbox) => {
      const row = checkbox.closest<HTMLElement>("[data-func-header-id]");
      const headerId = row?.dataset.funcHeaderId;
      checkbox.addEventListener("change", () => {
        const head = func.headers.find((h) => h.id === headerId);
        if (head) {
          head.enabled = checkbox.checked;
          onChange();
        }
      });
    });

    popover.querySelectorAll<HTMLInputElement>(".func-header-key").forEach((input) => {
      const row = input.closest<HTMLElement>("[data-func-header-id]");
      const headerId = row?.dataset.funcHeaderId;
      input.addEventListener("input", () => {
        const head = func.headers.find((h) => h.id === headerId);
        if (head) {
          head.key = input.value;
          onChange();
        }
      });
    });

    popover.querySelectorAll<HTMLInputElement>(".func-header-value").forEach((input) => {
      const row = input.closest<HTMLElement>("[data-func-header-id]");
      const headerId = row?.dataset.funcHeaderId;
      input.addEventListener("input", () => {
        const head = func.headers.find((h) => h.id === headerId);
        if (head) {
          head.value = input.value;
          onChange();
        }
      });
    });

    popover.querySelectorAll<HTMLButtonElement>(".remove-func-header").forEach((btn) => {
      const row = btn.closest<HTMLElement>("[data-func-header-id]");
      const headerId = row?.dataset.funcHeaderId;
      btn.addEventListener("click", () => {
        func.headers = func.headers.filter((h) => h.id !== headerId);
        onChange();
        syncFunctionPopover();
      });
    });
  }

  if (kind === "body") {
    popover.querySelectorAll<HTMLButtonElement>("[data-func-body-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        func.bodyMode = btn.dataset.funcBodyMode as any;
        if (func.bodyMode === "form" && func.form.length === 0) {
          func.form.push({ id: id(), key: "", value: "", enabled: true });
        }
        onChange();
        syncFunctionPopover();
      });
    });

    const rawTypeSelect = popover.querySelector<HTMLSelectElement>("#func-raw-type");
    if (rawTypeSelect) {
      rawTypeSelect.addEventListener("change", () => {
        func.rawType = rawTypeSelect.value as any;
        onChange();
        syncFunctionPopover();
      });
    }

    const addFormBtn = popover.querySelector<HTMLButtonElement>("#func-add-form");
    if (addFormBtn) {
      addFormBtn.addEventListener("click", () => {
        func.form.push({ id: id(), key: "", value: "", enabled: true });
        onChange();
        syncFunctionPopover();
      });
    }

    const addMultipartBtn = popover.querySelector<HTMLButtonElement>("#func-add-multipart-file");
    if (addMultipartBtn) {
      addMultipartBtn.addEventListener("click", () => {
        func.form.push({ id: id(), key: "", value: "", enabled: true, partType: "file", fileName: "" });
        onChange();
        syncFunctionPopover();
      });
    }

    popover.querySelectorAll<HTMLInputElement>(".func-form-enabled").forEach((checkbox) => {
      const row = checkbox.closest<HTMLElement>("[data-func-form-id]");
      const formId = row?.dataset.funcFormId;
      checkbox.addEventListener("change", () => {
        const field = func.form.find((f) => f.id === formId);
        if (field) {
          field.enabled = checkbox.checked;
          onChange();
        }
      });
    });

    popover.querySelectorAll<HTMLInputElement>(".func-form-key").forEach((input) => {
      const row = input.closest<HTMLElement>("[data-func-form-id]");
      const formId = row?.dataset.funcFormId;
      input.addEventListener("input", () => {
        const field = func.form.find((f) => f.id === formId);
        if (field) {
          field.key = input.value;
          onChange();
        }
      });
    });

    popover.querySelectorAll<HTMLInputElement>(".func-form-value").forEach((input) => {
      const row = input.closest<HTMLElement>("[data-func-form-id]");
      const formId = row?.dataset.funcFormId;
      input.addEventListener("input", () => {
        const field = func.form.find((f) => f.id === formId);
        if (field) {
          field.value = input.value;
          onChange();
        }
      });
    });

    popover.querySelectorAll<HTMLSelectElement>(".func-form-part-type").forEach((select) => {
      const formId = select.dataset.funcFormId;
      select.addEventListener("change", () => {
        const field = func.form.find((f) => f.id === formId);
        if (field) {
          field.partType = select.value as any;
          if (field.partType === "file") {
            field.fileName = "";
            field.value = "";
          }
          onChange();
          syncFunctionPopover();
        }
      });
    });

    popover.querySelectorAll<HTMLButtonElement>(".remove-func-form").forEach((btn) => {
      const row = btn.closest<HTMLElement>("[data-func-form-id]");
      const formId = row?.dataset.funcFormId;
      btn.addEventListener("click", () => {
        func.form = func.form.filter((f) => f.id !== formId);
        onChange();
        syncFunctionPopover();
      });
    });

    // Mount CodeMirror inside body popover if mode === raw
    const bodyHost = popover.querySelector<HTMLElement>("#function-body-editor");
    if (bodyHost && func.bodyMode === "raw") {
      void getEditorRuntime().then((editors) => {
        // Clean up previous unmount listener
        functionBodyEditorUnmount?.();
        functionBodyEditorUnmount = editors.mountBodyEditor(bodyHost, func.body, {
          tabSize: state.settings.tabSize,
          rawType: func.rawType,
          onChange: (value) => {
            func.body = value;
            onChange();
          },
          onSend: () => {
            void testFunction(func);
          }
        });
      });
    }
  }

  if (kind === "auth") {
    bindFuncAuthPanel(func, () => {
      onChange();
    });
  }
}

async function testFunction(func: AppFunction) {
  if (state.activeFunctionConsoleLoading) return;

  // Save focus, selection range, and scroll position
  let focusKind: "extractor" | "body" | null = null;
  let selectionRange: any = null;
  let scrollTopValue = 0;

  const extractorHost = document.getElementById("function-extractor-editor");
  const bodyHost = document.getElementById("function-body-editor");

  const extractorView = extractorHost ? (extractorHost as any).__cmView : null;
  const bodyView = bodyHost ? (bodyHost as any).__cmView : null;

  if (extractorView && extractorView.hasFocus) {
    focusKind = "extractor";
    selectionRange = extractorView.state.selection;
    scrollTopValue = extractorView.scrollDOM?.scrollTop ?? 0;
  } else if (bodyView && bodyView.hasFocus) {
    focusKind = "body";
    selectionRange = bodyView.state.selection;
    scrollTopValue = bodyView.scrollDOM?.scrollTop ?? 0;
  }

  state.activeFunctionConsoleLoading = true;
  await renderWorkspace();

  try {
    // 1. Prepare and compile request details
    // We can simulate an outbound SavedRequest from the AppFunction
    const fakeRequest: SavedRequest = {
      id: func.id,
      kind: "request",
      parentId: null,
      title: func.name,
      method: func.method,
      url: func.url,
      queryParams: func.queryParams,
      headers: func.headers,
      bodyMode: func.bodyMode,
      rawType: func.rawType,
      body: func.body,
      form: func.form,
      auth: func.auth,
      streamResponse: false,
      lastResponse: null,
      lastError: null
    };

    // Use RestPilot's standard resolvers for variables and headers!
    const effectiveVariables = getEffectiveVariables();
    const headers = withContentType(fakeRequest, buildRequestHeaders(fakeRequest));
    const resolvedUrl = resolvedOutboundUrl(fakeRequest, effectiveVariables).trim();

    const payload = {
      request: {
        id: func.id,
        method: func.method,
        url: resolvedUrl,
        headers,
        body_mode: func.bodyMode,
        raw_type: func.rawType,
        body: func.bodyMode === "raw" ? applyVariables(func.body, effectiveVariables) : "",
        form: buildFormPayload(fakeRequest),
        stream: false
      },
      proxy: proxyPayload(state.settings.proxy),
      network: networkPayload(state.settings, false)
    };

    // 2. Dispatch to Tauri backend
    const response = await invoke<ApiResponse>("send_request", { payload });

    // 3. Evaluate the JavaScript Extractor Code inside a safe Function context
    const codeToEval = func.extractorCode;
    let parsedBody = response.body;
    if (typeof response.body === "string") {
      try {
        parsedBody = JSON.parse(response.body);
      } catch {
        // stay as string
      }
    }

    const extractorFunc = new Function("__rawResponse__", "__parsedBody__", `
      "use strict";
      const response = {
        status: __rawResponse__.status,
        statusText: __rawResponse__.status_text,
        headers: __rawResponse__.headers,
        body: __parsedBody__
      };
      
      try {
        ${codeToEval}
      } catch(e) {
        throw new Error("Extractor error: " + e.message);
      }
    `);

    const extractedResult = extractorFunc(response, parsedBody);

    // Update func.lastTestResult
    func.lastTestResult = {
      success: true,
      extractedValue: extractedResult,
      responseStatus: response.status,
      responseBody: response.body
    };
  } catch (error: any) {
    func.lastTestResult = {
      success: false,
      error: error.message || String(error)
    };
  } finally {
    state.activeFunctionConsoleLoading = false;
    await renderWorkspace();

    // Restore focus, selection and scroll position
    if (focusKind === "extractor") {
      const newExtractorHost = document.getElementById("function-extractor-editor");
      const newExtractorView = newExtractorHost ? (newExtractorHost as any).__cmView : null;
      if (newExtractorView) {
        newExtractorView.focus();
        if (selectionRange) {
          newExtractorView.dispatch({ selection: selectionRange });
        }
        if (scrollTopValue > 0 && newExtractorView.scrollDOM) {
          newExtractorView.scrollDOM.scrollTop = scrollTopValue;
        }
      }
    } else if (focusKind === "body") {
      // Re-open body popover
      state.activeFunctionPopover = "body";
      syncFunctionPopover();

      const newBodyHost = document.getElementById("function-body-editor");
      const newBodyView = newBodyHost ? (newBodyHost as any).__cmView : null;
      if (newBodyView) {
        newBodyView.focus();
        if (selectionRange) {
          newBodyView.dispatch({ selection: selectionRange });
        }
        if (scrollTopValue > 0 && newBodyView.scrollDOM) {
          newBodyView.scrollDOM.scrollTop = scrollTopValue;
        }
      }
    }
  }
}

function renderFunctionsList(): string {
  const labels = t().tree;
  const query = state.functionSearchQuery.toLowerCase().trim();
  const filtered = state.functions.filter((func) =>
    func.name.toLowerCase().includes(query)
  );

  if (!filtered.length) {
    return `<div class="tree-empty" style="padding: 8px 12px; color: var(--rp-text-muted); font-size: 13px;">${t().functions.noFunctionSelected}</div>`;
  }

  return filtered
    .map((func) => {
      const active = func.id === state.activeFunctionId;
      const editing = func.id === state.editingFunctionId;
      const classes = ["tree-row", "tree-row--request"];
      if (active) classes.push("is-selected");
      if (editing) classes.push("is-editing");

      const isPlayLoading = state.activeSidebarFunctionPlayLoading === func.id;

      return `
        <div class="${classes.join(" ")}" tabindex="0" data-function-id="${func.id}" style="--depth:0">
          <span class="tree-chevron"></span>
          <span class="tree-item-icon" style="color: var(--rp-text-muted); display: flex; align-items: center;">${iconFunction}</span>
          <div class="tree-main">
            ${
              editing
                ? `<input class="tree-rename-input function-rename-input" value="${escapeAttribute(func.name)}" spellcheck="false" aria-label="${labels.rename}" />`
                : `<span class="tree-title">${escapeHtml(func.name)}</span>`
            }
          </div>
          ${
            editing
              ? ""
              : `<span class="tree-row-actions">
                  <button class="mini-btn tree-action-btn" data-func-action="play" data-func-id="${func.id}" type="button" title="Run & Save Variable" aria-label="Run & Save Variable" style="color: #2ecc71; display: inline-flex; align-items: center; justify-content: center; position: relative;">
                    ${isPlayLoading
                      ? `<span class="send-icon-spin" style="width: 10px; height: 10px; border: 1.5px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite; display: inline-block;"></span>`
                      : `<svg style="width: 12px; height: 12px;" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`
                    }
                  </button>
                  <button class="mini-btn tree-action-btn" data-func-action="rename" data-func-id="${func.id}" type="button" title="${labels.rename}" aria-label="${labels.rename}">${iconRename}</button>
                  <button class="mini-btn tree-action-btn danger" data-func-action="delete" data-func-id="${func.id}" type="button" title="${labels.delete}" aria-label="${labels.delete}">${iconRemove}</button>
                </span>`
          }
        </div>
      `;
    })
    .join("");
}

function bindFunctions() {
  if (state.activePanel !== "functions") return;

  document.querySelectorAll<HTMLElement>(".tree-row[data-function-id]").forEach((row) => {
    const funcId = row.dataset.functionId ?? "";
    
    row.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      if (target.closest("[data-func-action]") || target.closest(".function-rename-input")) return;
      selectFunction(funcId);
    });

    row.addEventListener("dblclick", (event) => {
      event.stopPropagation();
      startFuncRename(funcId);
    });

    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        const target = event.target as HTMLElement;
        if (target.closest("[data-func-action]") || target.closest(".function-rename-input")) return;
        selectFunction(funcId);
      }
    });

    const renameInput = row.querySelector<HTMLInputElement>(".function-rename-input");
    if (renameInput) {
      renameInput.focus();
      renameInput.select();
      renameInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          commitFuncRename(funcId);
        } else if (event.key === "Escape") {
          cancelFuncRename();
        }
      });
      renameInput.addEventListener("blur", () => {
        commitFuncRename(funcId);
      });
    }
  });

  document.querySelectorAll<HTMLButtonElement>("[data-func-action]").forEach((button) => {
    const action = button.dataset.funcAction;
    const funcId = button.dataset.funcId ?? "";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (action === "rename") {
        startFuncRename(funcId);
      } else if (action === "delete") {
        void deleteFunction(funcId);
      } else if (action === "play") {
        void runSidebarFunction(funcId, button);
      }
    });
  });

  const nameEditorInput = document.querySelector<HTMLInputElement>("#function-editor-name");
  if (nameEditorInput) {
    nameEditorInput.addEventListener("input", () => {
      const activeId = state.activeFunctionId;
      if (activeId) {
        const func = state.functions.find((f) => f.id === activeId);
        if (func) {
          func.name = nameEditorInput.value;
          const sidebarRow = document.querySelector(`.tree-row[data-function-id="${activeId}"] .tree-title`);
          if (sidebarRow) sidebarRow.textContent = nameEditorInput.value;
          scheduleSave();
        }
      }
    });
  }
}

function bindFunctionsSearch() {
  const searchInput = document.querySelector<HTMLInputElement>("#function-search");
  if (!searchInput) return;

  searchInput.addEventListener("input", () => {
    state.functionSearchQuery = searchInput.value;
    const clearBtn = document.querySelector("#function-search-clear");
    if (clearBtn) {
      clearBtn.classList.toggle("is-hidden", !searchInput.value.trim());
    }
    const list = document.querySelector(".collection-sidebar-panel .tree");
    if (list) {
      list.innerHTML = renderFunctionsList();
      bindFunctions();
    }
  });

  document.querySelector("#function-search-clear")?.addEventListener("click", () => {
    state.functionSearchQuery = "";
    searchInput.value = "";
    searchInput.focus();
    const clearBtn = document.querySelector("#function-search-clear");
    if (clearBtn) clearBtn.classList.add("is-hidden");
    const list = document.querySelector(".collection-sidebar-panel .tree");
    if (list) {
      list.innerHTML = renderFunctionsList();
      bindFunctions();
    }
  });
}

function startFuncRename(funcId: string) {
  state.editingFunctionId = funcId;
  state.activeFunctionId = funcId;
  render();
  focusFuncRenameInput(funcId);
}

function commitFuncRename(funcId: string) {
  const func = state.functions.find((f) => f.id === funcId);
  const input = document.querySelector<HTMLInputElement>(`.tree-row[data-function-id="${funcId}"] .function-rename-input`);
  const nextName = input?.value.trim() ?? func?.name ?? "";
  state.editingFunctionId = null;
  if (!func) {
    render();
    return;
  }
  if (nextName) func.name = nextName;
  scheduleSave();
  render();
  focusFuncSelection();
}

function cancelFuncRename() {
  const editingId = state.editingFunctionId;
  if (editingId) {
    const func = state.functions.find((f) => f.id === editingId);
    if (func && func.name === "New function" && !func.code.trim()) {
      state.functions = state.functions.filter((f) => f.id !== editingId);
      if (state.activeFunctionId === editingId) state.activeFunctionId = state.functions[0]?.id ?? null;
      scheduleSave();
    }
  }
  state.editingFunctionId = null;
  render();
  focusFuncSelection();
}

function focusFuncRenameInput(funcId: string) {
  const input = document.querySelector<HTMLInputElement>(`.tree-row[data-function-id="${funcId}"] .function-rename-input`);
  if (!input) return;
  input.focus();
  input.select();
}

function focusFuncSelection() {
  if (state.editingFunctionId) {
    focusFuncRenameInput(state.editingFunctionId);
    return;
  }
  if (state.activeFunctionId) {
    const row = document.querySelector<HTMLElement>(`.tree-row[data-function-id="${state.activeFunctionId}"]`);
    row?.focus();
  }
}

function selectFunction(funcId: string | null) {
  state.activeFunctionId = funcId;
  state.editingFunctionId = null;
  scheduleSave();
  render();
}

function createNewFunction() {
  const newFunc: AppFunction = {
    id: id(),
    name: "New function",
    code: "",
    functionType: "http",
    method: "GET",
    url: "https://jsonplaceholder.typicode.com/todos/1",
    queryParams: [],
    headers: [],
    bodyMode: "none",
    rawType: "json",
    body: "",
    form: [],
    auth: { type: "none" },
    extractorCode: `// Extract data from the response\nif (response.status === 200) {\n  return response.body.title;\n}\nreturn undefined;\n`,
    lastTestResult: null
  };
  state.functions.push(newFunc);
  state.activeFunctionId = newFunc.id;
  scheduleSave();
  startFuncRename(newFunc.id);
}

async function deleteFunction(funcId: string) {
  const func = state.functions.find((f) => f.id === funcId);
  if (!func) return;
  const confirmed = await messageDialog("confirmation", t().tree.delete, `Are you sure you want to delete ${func.name}?`);
  if (!confirmed) return;

  state.functions = state.functions.filter((f) => f.id !== funcId);
  if (state.activeFunctionId === funcId) {
    state.activeFunctionId = state.functions[0]?.id ?? null;
  }
  scheduleSave();
  render();
}

async function runSidebarFunction(funcId: string, anchorButton: HTMLButtonElement) {
  if (state.activeSidebarFunctionPlayLoading) return;

  const func = state.functions.find((f) => f.id === funcId);
  if (!func) return;

  state.activeSidebarFunctionPlayLoading = funcId;
  // Trigger immediate render to show the loading spinner on the tree row
  const sidebarList = document.querySelector(".collection-sidebar-panel .tree");
  if (sidebarList) {
    sidebarList.innerHTML = renderFunctionsList();
    bindFunctions();
  }

  try {
    const fakeRequest: SavedRequest = {
      id: func.id,
      kind: "request",
      parentId: null,
      title: func.name,
      method: func.method,
      url: func.url,
      queryParams: func.queryParams,
      headers: func.headers,
      bodyMode: func.bodyMode,
      rawType: func.rawType,
      body: func.body,
      form: func.form,
      auth: func.auth,
      streamResponse: false,
      lastResponse: null,
      lastError: null
    };

    const effectiveVariables = getEffectiveVariables();
    const headers = withContentType(fakeRequest, buildRequestHeaders(fakeRequest));
    const resolvedUrl = resolvedOutboundUrl(fakeRequest, effectiveVariables).trim();

    const payload = {
      request: {
        id: func.id,
        method: func.method,
        url: resolvedUrl,
        headers,
        body_mode: func.bodyMode,
        raw_type: func.rawType,
        body: func.bodyMode === "raw" ? applyVariables(func.body, effectiveVariables) : "",
        form: buildFormPayload(fakeRequest),
        stream: false
      },
      proxy: proxyPayload(state.settings.proxy),
      network: networkPayload(state.settings, false)
    };

    const response = await invoke<ApiResponse>("send_request", { payload });

    const codeToEval = func.extractorCode;
    let parsedBody = response.body;
    if (typeof response.body === "string") {
      try {
        parsedBody = JSON.parse(response.body);
      } catch {
        // stay as string
      }
    }

    const extractorFunc = new Function("__rawResponse__", "__parsedBody__", `
      "use strict";
      const response = {
        status: __rawResponse__.status,
        statusText: __rawResponse__.status_text,
        headers: __rawResponse__.headers,
        body: __parsedBody__
      };
      
      try {
        ${codeToEval}
      } catch(e) {
        throw new Error("Extractor error: " + e.message);
      }
    `);

    const extractedResult = extractorFunc(response, parsedBody);

    // Save to test result for the main view too, so they are in sync!
    func.lastTestResult = {
      success: true,
      extractedValue: extractedResult,
      responseStatus: response.status,
      responseBody: response.body
    };

    // Render workspace only if we are currently looking at this active function
    if (state.activeFunctionId === funcId) {
      await renderWorkspace();
    }

    // Now, show popover
    const popoverHtml = renderSidebarFunctionResultPopover(func, true, extractedResult);
    const popover = mountPopover(popoverHtml, anchorButton);
    bindPopoverClose(popover, () => {
      removePopovers();
    });
    bindSidebarFunctionResultPopover(popover, func, true, extractedResult);

  } catch (error: any) {
    const errorMsg = error.message || String(error);
    func.lastTestResult = {
      success: false,
      error: errorMsg
    };

    if (state.activeFunctionId === funcId) {
      await renderWorkspace();
    }

    // Show failure popover
    const popoverHtml = renderSidebarFunctionResultPopover(func, false, null, errorMsg);
    const popover = mountPopover(popoverHtml, anchorButton);
    bindPopoverClose(popover, () => {
      removePopovers();
    });
    bindSidebarFunctionResultPopover(popover, func, false, null);

  } finally {
    state.activeSidebarFunctionPlayLoading = null;
    // Re-render functions list to restore Play button icon
    const sidebarList = document.querySelector(".collection-sidebar-panel .tree");
    if (sidebarList) {
      sidebarList.innerHTML = renderFunctionsList();
      bindFunctions();
    }
  }
}

function renderSidebarFunctionResultPopover(func: AppFunction, success: boolean, value: any, error?: string): string {
  const activeEnv = getActiveEnvironment();
  
  let outcomeHtml = "";
  if (success) {
    let formattedVal = "";
    try {
      formattedVal = typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
    } catch {
      formattedVal = String(value);
    }
    outcomeHtml = `
      <div style="margin-bottom: 12px; font-family: monospace; font-size: 13px; text-align: left;">
        <div style="font-weight: 600; color: #4b8b3b; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
          <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #4b8b3b;"></span>
          Extracted Value
        </div>
        <pre style="margin: 0; padding: 8px; background: var(--rp-surface-low); border: 1px solid var(--rp-border); border-radius: 4px; max-height: 80px; overflow-y: auto; white-space: pre-wrap; word-break: break-all; color: var(--rp-text);">${escapeHtml(formattedVal)}</pre>
      </div>
    `;
  } else {
    outcomeHtml = `
      <div style="margin-bottom: 12px; font-family: monospace; font-size: 13px; text-align: left;">
        <div style="font-weight: 600; color: #b54a3a; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
          <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #b54a3a;"></span>
          Execution Failure
        </div>
        <pre style="margin: 0; padding: 8px; background: #b54a3a0a; border: 1px solid #b54a3a33; border-radius: 4px; max-height: 80px; overflow-y: auto; white-space: pre-wrap; color: #b54a3a;">${escapeHtml(error || "Unknown error")}</pre>
      </div>
    `;
  }

  let bodyHtml = outcomeHtml;

  if (success) {
    bodyHtml += `
      <div style="display: flex; flex-direction: column; gap: 8px; flex: 1; min-height: 0;">
        <div style="font-weight: 700; font-size: 11px; text-transform: uppercase; color: var(--rp-text-muted); letter-spacing: 0.05em; margin-top: 4px;">Inject into Variable</div>
        
        <!-- Mini-Search input -->
        <div style="position: relative; display: flex; align-items: center; width: 100%;">
          <input
            id="var-popover-search"
            placeholder="Search variables..."
            spellcheck="false"
            style="width: 100%; padding: 6px 10px; font-size: 12px; border-radius: 4px; border: 1px solid var(--rp-border); background: var(--rp-surface);"
          />
        </div>

        <!-- Scrollable Variables List -->
        <div id="var-popover-list" style="flex: 1; min-height: 100px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; border: 1px solid var(--rp-border); border-radius: 4px; padding: 6px; background: var(--rp-surface-low);">
          <!-- Dynamic -->
        </div>

        <!-- Create New Variable Inline Form -->
        <div style="border-top: 1px solid var(--rp-border); padding-top: 8px; display: flex; flex-direction: column; gap: 6px; margin-top: 4px;">
          <div style="font-weight: 700; font-size: 10px; text-transform: uppercase; color: var(--rp-text-muted); letter-spacing: 0.05em;">Or Create New Variable</div>
          <div style="display: flex; gap: 6px; width: 100%;">
            <input
              id="var-popover-new-name"
              placeholder="Variable name..."
              spellcheck="false"
              style="flex: 1; min-width: 0; padding: 4px 8px; font-size: 12px; border-radius: 4px; border: 1px solid var(--rp-border); background: var(--rp-surface);"
            />
            ${activeEnv ? `
              <select id="var-popover-new-scope" style="font-size: 11px; padding: 4px; border-radius: 4px; border: 1px solid var(--rp-border); background: var(--rp-surface);">
                <option value="global">Global</option>
                <option value="env">${activeEnv.name}</option>
              </select>
            ` : ""}
            <button id="var-popover-new-submit" class="segmented-btn" type="button" style="padding: 4px 10px; font-size: 12px; border-radius: 4px; border: 1px solid var(--rp-border); background: var(--rp-surface); cursor: pointer; white-space: nowrap;">
              Create
            </button>
          </div>
        </div>
      </div>
    `;
  }

  return renderPopoverShell({
    title: `${func.name} - Result`,
    bodyHtml,
    resizable: success
  });
}

function bindSidebarFunctionResultPopover(popover: HTMLElement, func: AppFunction, success: boolean, value: any) {
  if (!success) return;

  const searchInput = popover.querySelector<HTMLInputElement>("#var-popover-search");
  const listContainer = popover.querySelector<HTMLElement>("#var-popover-list");
  const newNameInput = popover.querySelector<HTMLInputElement>("#var-popover-new-name");
  const newScopeSelect = popover.querySelector<HTMLSelectElement>("#var-popover-new-scope");
  const newSubmitBtn = popover.querySelector<HTMLButtonElement>("#var-popover-new-submit");

  if (!listContainer) return;

  const activeEnv = getActiveEnvironment();
  
  // Combine all variables for search
  const allVars = [
    ...state.variables.map((v: Variable) => ({ ...v, scope: "global", envName: undefined as string | undefined })),
    ...activeEnvironmentVariables().map((v: Variable) => ({ ...v, scope: "env", envName: activeEnv?.name as string | undefined }))
  ];

  function renderList(query: string) {
    const filtered = allVars.filter(v => 
      v.name.toLowerCase().includes(query.toLowerCase())
    );

    const itemsHtml = filtered.map(v => {
      const scopeBadge = v.scope === "env" 
        ? `<span style="background: rgba(46, 204, 113, 0.15); color: #2ecc71; padding: 1px 5px; border-radius: 10px; font-size: 9px; font-weight: 700; margin-left: 6px;">Env: ${escapeHtml(v.envName ?? "")}</span>` 
        : `<span style="background: rgba(52, 152, 219, 0.15); color: #3498db; padding: 1px 5px; border-radius: 10px; font-size: 9px; font-weight: 700; margin-left: 6px;">Global</span>`;
      
      let displayValue = v.value;
      if (v.secret) {
        displayValue = "••••••••";
      }

      return `
        <button class="var-popover-item" data-var-id="${v.id}" data-var-scope="${v.scope}" type="button" style="text-align: left; background: transparent; border: none; padding: 6px 8px; border-radius: 4px; cursor: pointer; font-size: 12px; color: var(--rp-text); width: 100%; display: flex; align-items: center; justify-content: space-between; transition: background 0.15s;" onmouseover="this.style.background='rgba(0,0,0,0.05)'" onmouseout="this.style.background='transparent'">
          <span style="font-family: monospace; font-weight: 600;">\${${escapeHtml(v.name || "unnamed")}}</span>
          <div style="display: flex; align-items: center; gap: 4px;">
            <span style="color: var(--rp-text-muted); font-size: 11px; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(displayValue || "")}</span>
            ${scopeBadge}
          </div>
        </button>
      `;
    }).join("");

    listContainer!.innerHTML = itemsHtml || `<div style="text-align: center; padding: 12px; font-size: 12px; color: var(--rp-text-muted); font-style: italic;">No variables found</div>`;

    // Bind item click listeners
    listContainer!.querySelectorAll<HTMLButtonElement>(".var-popover-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        const varId = btn.dataset.varId;
        const varScope = btn.dataset.varScope;

        if (varScope === "global") {
          const v = state.variables.find((item: Variable) => item.id === varId);
          if (v) {
            v.value = typeof value === "object" ? JSON.stringify(value) : String(value);
            v.enabled = true;
          }
        } else if (varScope === "env" && activeEnv) {
          const v = activeEnv.variables.find((item: Variable) => item.id === varId);
          if (v) {
            v.value = typeof value === "object" ? JSON.stringify(value) : String(value);
            v.enabled = true;
          }
        }

        scheduleSave();
        removePopovers();
        void messageDialog("information", "Variable Saved", `Successfully saved result into variable.`);
        void renderWorkspace();
      });
    });
  }

  // Initial render
  renderList("");

  // Search input event
  searchInput?.addEventListener("input", () => {
    renderList(searchInput.value.trim());
  });

  // Submit Handler for New Variable
  function handleCreateNew() {
    const varName = newNameInput?.value.trim() ?? "";
    if (!varName) return;

    const valStr = typeof value === "object" ? JSON.stringify(value) : String(value);
    const newVar = { id: id(), name: varName, value: valStr, enabled: true };

    const scope = newScopeSelect?.value ?? "global";
    if (scope === "global") {
      state.variables.push(newVar);
    } else if (scope === "env" && activeEnv) {
      activeEnv.variables.push(newVar);
    }

    scheduleSave();
    removePopovers();
    void messageDialog("information", "Variable Created", `Variable \${${varName}} has been successfully created and saved.`);
    void renderWorkspace();
  }

  newSubmitBtn?.addEventListener("click", handleCreateNew);
  newNameInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      handleCreateNew();
    }
  });
}

