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
import {
  clampTabSize,
  mountBodyEditor,
  mountReadonlyViewer,
  setReadonlyViewerValue,
  type ViewerMode
} from "./large-text-editor";
import {
  iconChevronLeft,
  iconChevronRight,
  iconCopy,
  iconDuplicate,
  iconExport,
  iconFolderAdd,
  iconImport,
  iconRemove,
  iconRename,
  iconRequestAdd,
  iconSearch
} from "./icons";
import { exportCollection, importCollection } from "./app/collection-io";
import { brandLogo } from "./logo";
import { getLocale, setLocale, t } from "./i18n";
import { bindSettings, renderSettings } from "./settings";
import {
  bindRequestPopoverTriggers,
  closeRequestPopovers,
  renderEnvironmentChipButton,
  renderVariablesPopoverButton,
  setRequestPopoverHooks,
  syncRequestPopover
} from "./request-popovers";
import { bindVariablesWorkspace, renderVariablesWorkspace } from "./variables-workspace";
import { environmentChipLabel, getEffectiveVariables } from "./app/environments";
import { buildRequestUrl, ingestUrlIntoRequest, migrateRequestQuery } from "./url-params";
import { resolvedOutboundUrl } from "./app/request-auth";
import { bindAuthPanel, renderAuthPanel } from "./request-auth-panel";
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
  defaultConfig,
  type ActivePanel,
  type ApiResponse,
  type BodyMode,
  type FormPartType,
  type Pair,
  type RawType,
  type RequestTab,
  type ResponseTab,
  type SavedRequest,
  type TabState,
  type TreeItem
} from "./types";
import { duplicateFolderItem, duplicateRequestItem } from "./app/collection-duplicate";
import {
  collectionSearchVisibleIds,
  folderExpandedForSearch
} from "./app/collection-search";
import { insertItemAt, moveDroppedItem, moveItemTo } from "./app/collection-store";
import {
  applyUserSettings,
  loadStoredConfig,
  persistConfig,
  proxyPayload,
  scheduleSave
} from "./app/persistence";
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
  selectedFolderId,
  state
} from "./app/state";
import { HTTP_METHODS, methodDataAttribute } from "./http-methods";

const STREAM_EVENT = "restpilot:request-stream";
let draggedTreeId: string | null = null;
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

initDialogs(render);
ensureContextMenuHandlers();
bindGlobalShortcuts({
  send: () => void trySendRequest(),
  closeTab: () => {
    if (state.activeTabId) closeTab(state.activeTabId);
  },
  focusUrl: () => focusRequestUrl()
});
setRenderApp(renderApp);
setRequestPopoverHooks({
  onVariablesChanged: onEffectiveVariablesChanged,
  openVariablesPanel: openVariablesWorkspace
});
boot();

async function boot() {
  try {
    const loaded = await loadStoredConfig();
    if (loaded) {
      const { config: migrated, persist } = loaded;
      Object.assign(state, {
        items: migrated.items,
        variables: migrated.variables ?? [],
        environments: migrated.environments ?? [],
        activeEnvironmentId: migrated.activeEnvironmentId ?? null,
        openTabs: (migrated.openTabs ?? []).filter((tabId) => Boolean(getRequestFrom(migrated.items, tabId))),
        activeTabId: "",
        settings: migrated.settings
      });
      state.activeTabId = state.openTabs.includes(migrated.activeTabId) ? migrated.activeTabId : (state.openTabs[0] ?? "");
      if (persist) scheduleSave();
    }
  } catch {
    const labels = t().messages;
    await messageDialog("warning", labels.configTitle, labels.configLoadFailed);
  }

  applyUserSettings(state.settings);
  for (const id of state.openTabs) ensureTab(id);
  render();
  requestAnimationFrame(() => focusUrlOnStartup());
}

function focusUrlOnStartup() {
  if (state.activePanel !== "request" || !getActiveRequest()) return;
  focusRequestUrl();
}

function renderRailNav(labels: ReturnType<typeof t>) {
  return `
    <div class="rail-stack">
      <section class="rail-collection">
        <div class="explorer-head">
          <strong class="explorer-title">${labels.nav.collection}</strong>
          <div class="rail-actions">
            <button class="mini-btn tool-icon" id="export-collection" type="button" title="${labels.collection.exportCollection}" aria-label="${labels.collection.exportCollection}">${iconExport}</button>
            <button class="mini-btn tool-icon" id="import-collection" type="button" title="${labels.collection.importCollection}" aria-label="${labels.collection.importCollection}">${iconImport}</button>
            <button class="mini-btn tool-icon" id="new-folder" type="button" title="${labels.nav.newFolder}" aria-label="${labels.nav.newFolder}">${iconFolderAdd}</button>
            <button class="mini-btn tool-icon" id="new-request" type="button" title="${labels.nav.newRequest}" aria-label="${labels.nav.newRequest}">${iconRequestAdd}</button>
          </div>
        </div>
        <label class="collection-search">
          <span class="sr-only">${labels.collection.search}</span>
          <div class="collection-search-field">
            <input
              id="collection-search"
              type="search"
              value="${escapeAttribute(state.collectionSearchQuery)}"
              placeholder="${labels.collection.searchPlaceholder}"
              spellcheck="false"
              autocomplete="off"
            />
            <button
              class="mini-btn collection-search-clear${state.collectionSearchQuery.trim() ? "" : " is-hidden"}"
              id="collection-search-clear"
              type="button"
              title="${labels.collection.searchClear}"
              aria-label="${labels.collection.searchClear}"
            >×</button>
            <button
              class="mini-btn collection-search-submit"
              id="collection-search-submit"
              type="button"
              title="${labels.collection.search}"
              aria-label="${labels.collection.search}"
            >${iconSearch}</button>
          </div>
        </label>
        <section class="tree" tabindex="0" aria-label="${labels.nav.collection}">${renderExplorerTree(null, 0)}</section>
      </section>
      <nav class="rail-nav">
        <button class="rail-link${state.activePanel === "variables" ? " active" : ""}" type="button" data-rail-nav="variables">${labels.nav.variables}</button>
        <button class="rail-link${state.activePanel === "settings" ? " active" : ""}" type="button" data-rail-nav="settings">${labels.nav.settings}</button>
      </nav>
    </div>
  `;
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
  if (request && tab) return renderRequest(request, tab);
  return renderEmpty();
}

function renderWorkspace() {
  const panel = document.querySelector<HTMLElement>(".workspace-body");
  if (!panel) {
    render();
    return;
  }
  unmountTabDisplay(state.activeTabId);
  panel.innerHTML = renderWorkspaceMarkup();
  bindWorkspace();
  if (state.openRequestPopover) requestAnimationFrame(() => syncRequestPopover());
}

function updateTabStripActive() {
  document.querySelectorAll<HTMLElement>("[data-open-tab]").forEach((element) => {
    const tabId = element.dataset.openTab ?? "";
    const active = tabId === state.activeTabId;
    element.classList.toggle("active", active);
    element.setAttribute("aria-selected", active ? "true" : "false");
  });
}

function updateRailNavActive() {
  document.querySelectorAll<HTMLButtonElement>("[data-rail-nav]").forEach((button) => {
    const nav = button.dataset.railNav;
    const active =
      nav === "variables" ? state.activePanel === "variables" : nav === "settings" ? state.activePanel === "settings" : false;
    button.classList.toggle("active", active);
  });
}

/** Leave settings/variables and return to the request workspace. */
function focusRequestWorkspace(): boolean {
  if (state.activePanel === "request") return false;
  closeRequestPopovers();
  state.activePanel = "request";
  state.contextMenu = null;
  return true;
}

function refreshTabBar() {
  const workspace = document.querySelector<HTMLElement>(".workspace");
  if (!workspace) return;

  const request = getActiveRequest();
  const tab = request ? ensureTab(request.id) : null;
  const markup = state.activePanel === "request" ? renderTabBar(request, tab) : "";
  const existing = workspace.querySelector(".tab-bar");

  if (!markup) {
    existing?.remove();
    return;
  }

  if (existing) existing.outerHTML = markup;
  else workspace.querySelector(".workspace-body")?.insertAdjacentHTML("beforebegin", markup);

  bindTabBar();
  bindTabStripScroll();
  bindTabBarToolButtons();
  if (state.openRequestPopover) {
    requestAnimationFrame(() => syncRequestPopover());
  }
}

function bindTabStripScroll() {
  const wrap = document.querySelector<HTMLElement>(".tab-strip-wrap");
  if (!wrap || wrap.dataset.scrollBound === "true") return;

  const viewport = wrap.querySelector<HTMLElement>(".tab-strip-viewport");
  const strip = wrap.querySelector<HTMLElement>(".tab-strip");
  const back = wrap.querySelector<HTMLButtonElement>(".tab-scroll-back");
  const forward = wrap.querySelector<HTMLButtonElement>(".tab-scroll-forward");
  if (!viewport || !strip || !back || !forward) return;

  wrap.dataset.scrollBound = "true";

  const update = () => {
    const overflow = strip.scrollWidth > viewport.clientWidth + 1;
    const atStart = viewport.scrollLeft <= 1;
    const atEnd = viewport.scrollLeft + viewport.clientWidth >= viewport.scrollWidth - 1;
    wrap.classList.toggle("has-overflow", overflow);
    back.classList.toggle("is-hidden", !overflow || atStart);
    forward.classList.toggle("is-hidden", !overflow || atEnd);
  };

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

  viewport.addEventListener("scroll", update, { passive: true });
  const observer = new ResizeObserver(update);
  observer.observe(viewport);
  observer.observe(strip);
  requestAnimationFrame(update);

  strip.querySelector<HTMLElement>(".request-tab.active")?.scrollIntoView({ inline: "nearest", block: "nearest" });
}

function bindTabBar() {
  const strip = document.querySelector<HTMLElement>(".tab-strip");
  if (!strip || strip.dataset.bound === "true") return;
  strip.dataset.bound = "true";

  strip.addEventListener("click", (event) => {
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

  strip.addEventListener("auxclick", (event) => {
    if (event.button !== 1) return;
    const tabEl = (event.target as HTMLElement).closest<HTMLElement>("[data-open-tab]");
    if (!tabEl || (event.target as HTMLElement).closest("[data-close-tab]")) return;
    event.preventDefault();
    closeTab(tabEl.dataset.openTab ?? "");
  });

  strip.addEventListener("mousedown", (event) => {
    if (event.button !== 1) return;
    const tabEl = (event.target as HTMLElement).closest<HTMLElement>("[data-open-tab]");
    if (!tabEl || (event.target as HTMLElement).closest("[data-close-tab]")) return;
    event.preventDefault();
    closeTab(tabEl.dataset.openTab ?? "");
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

function responseViewerMode(body: string, headers: Record<string, string>): ViewerMode {
  return detectContentKind(body, headers);
}

function mountResponseBodyViewer(request: SavedRequest, tab: TabState) {
  tab.responseBodyUnmount?.();
  tab.responseBodyUnmount = undefined;

  const host = document.querySelector<HTMLElement>("[data-response-body-viewer]");
  if (!host || !tab.response || tab.selectedResponseTab !== "body") return;

  const body = tab.response.body;
  const headers = tab.response.headers;
  const displayBody = getResponseBodyForDisplay(tab, body, headers);
  tab.responseBodyUnmount = mountReadonlyViewer(
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

function mountWorkspaceDisplays(request: SavedRequest, tab: TabState) {
  tab.bodyEditorUnmount?.();
  tab.responseBodyUnmount?.();
  tab.headersTableUnmount?.();
  tab.bodyEditorUnmount = undefined;
  tab.responseBodyUnmount = undefined;
  tab.headersTableUnmount = undefined;

  const editorHost = document.querySelector<HTMLElement>("[data-body-editor-host]");
  if (editorHost && request.bodyMode === "raw" && tab.selectedRequestTab === "body") {
    tab.bodyEditorUnmount = mountBodyEditor(editorHost, request.body, {
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

  mountResponseBodyViewer(request, tab);
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

function refreshResponseBodyDisplay(request: SavedRequest, tab: TabState) {
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

  if (setReadonlyViewerValue(host, displayBody)) return;
  mountResponseBodyViewer(request, tab);
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
  updateRailNavActive();
  renderWorkspace();
}

function renderApp() {
  const request = getActiveRequest();
  const tab = request ? ensureTab(request.id) : null;
  const labels = t();

  unmountTabDisplay(state.activeTabId);

  appRoot.innerHTML = `
    <main class="shell">
      <aside class="rail">
        <div class="brand">
          ${brandLogo}
          <span class="brand-name">${labels.app.name}</span>
        </div>
        ${renderRailNav(labels)}
      </aside>
      <section class="workspace">
        ${state.activePanel === "request" ? renderTabBar(request, tab) : ""}
        <div class="workspace-body">${renderWorkspaceMarkup()}</div>
      </section>
    </main>
    ${renderDialogLayer()}
  `;

  bindEvents();
  syncContextMenu();
  if (state.openRequestPopover) syncRequestPopover();
  const active = getActiveRequest();
  const activeTab = active ? ensureTab(active.id) : null;
  if (active && activeTab) mountWorkspaceDisplays(active, activeTab);
}

function buildContextMenuMarkup() {
  if (!state.contextMenu) return "";
  if (state.contextMenu.kind === "text") {
    return renderTextContextMenuMarkup(state.contextMenu);
  }
  if (state.contextMenu.kind === "request-tab") {
    const labels = t();
    return `
      <div class="context-menu" style="left:${state.contextMenu.x}px;top:${state.contextMenu.y}px">
        ${contextMenuButton("close-tab", labels.contextMenu.closeTab, { shortcut: menuShortcuts.closeTab() })}
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
      <button class="mini-btn tab-close" data-close-tab="${requestId}" type="button" aria-label="${t().dialog.close}">×</button>
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
        <div class="segmented">
          <button class="${request.bodyMode === "raw" ? "active" : ""}" data-body-mode="raw" type="button">${labels.raw}</button>
          <button class="${request.bodyMode === "form" ? "active" : ""}" data-body-mode="form" type="button">${labels.form}</button>
          <button class="${request.bodyMode === "multipart" ? "active" : ""}" data-body-mode="multipart" type="button">${labels.multipart}</button>
          <button class="${request.bodyMode === "none" ? "active" : ""}" data-body-mode="none" type="button">${labels.none}</button>
        </div>
        ${
          request.bodyMode === "raw"
            ? `<div class="segmented raw-type-switch">
                <button class="${request.rawType === "text" ? "active" : ""}" data-raw-type="text" type="button">${labels.rawText}</button>
                <button class="${request.rawType === "json" ? "active" : ""}" data-raw-type="json" type="button">${labels.rawJson}</button>
                <button class="${request.rawType === "xml" ? "active" : ""}" data-raw-type="xml" type="button">${labels.rawXml}</button>
              </div>`
            : ""
        }
        <span class="hint">${bodyModeHint(request)}</span>
      </div>
      ${renderBodyEditor(request, labels)}
    </div>
  `;
}

function bodyModeHint(request: SavedRequest) {
  const labels = t().request;
  if (request.bodyMode === "form") return labels.formHint;
  if (request.bodyMode === "multipart") return labels.multipartHint;
  if (request.bodyMode === "none") return labels.noneHint;
  if (request.rawType === "xml") return labels.rawXmlHint;
  if (request.rawType === "text") return labels.rawTextHint;
  return labels.rawJsonHint;
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
    return `<p class="hint body-none-hint">${labels.noneHint}</p>`;
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
      <button class="mini-btn remove-form" type="button" aria-label="${t().tree.delete}">×</button>
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
      <button class="mini-btn remove-${scope}" type="button" aria-label="${t().tree.delete}">×</button>
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
        <div class="${treeRowClassName(item, editing)}" draggable="${editing ? "false" : "true"}" tabindex="0" data-tree-id="${item.id}" data-kind="${item.kind}" style="--depth:${depth}">
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
  return `<div class="empty-editor"><span>${t().request.noTab}</span></div>`;
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
  document.querySelectorAll<HTMLButtonElement>("[data-raw-type]").forEach((button) => {
    button.addEventListener("click", () => {
      request.rawType = button.dataset.rawType as RawType;
      scheduleSave();
      renderWorkspace();
    });
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
  mountWorkspaceDisplays(request, tab);
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
  bindTree();
  bindDialogs();
  bindRailNav();
  bindTabBar();
  bindTabStripScroll();
  bindCollectionSearch();

  document.querySelector("#export-collection")?.addEventListener("click", () => void exportCollection());
  document.querySelector("#import-collection")?.addEventListener("click", () => void importCollection());
  document.querySelector("#new-folder")?.addEventListener("click", createFolder);
  document.querySelector("#new-request")?.addEventListener("click", createRequest);
  document.querySelector("#panel-back")?.addEventListener("click", backToWorkspace);
  bindTabBarToolButtons();
  bindWorkspace();
}

function bindRailNav() {
  document.querySelector<HTMLButtonElement>('[data-rail-nav="variables"]')?.addEventListener("click", () => {
    openVariablesWorkspace("globals");
  });

  document.querySelector<HTMLButtonElement>('[data-rail-nav="settings"]')?.addEventListener("click", () => {
    openPanel("settings");
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
  if (languageChanged) render();
  else if (state.activePanel === "request") renderWorkspace();
}

async function clearAllData() {
  const labels = t().settings;
  const answer = await messageDialog("confirmation", labels.clearDataTitle, labels.clearDataBody);
  if (answer !== "confirm") return;

  const settings = state.settings;
  const fresh = defaultConfig();
  state.items = fresh.items;
  state.variables = fresh.variables;
  state.environments = fresh.environments;
  state.activeEnvironmentId = fresh.activeEnvironmentId;
  state.openRequestPopover = null;
  state.envManageSelectedId = null;
  state.openTabs = fresh.openTabs;
  state.activeTabId = fresh.activeTabId;
  state.settings = settings;
  state.tabs = {};
  state.selectedTreeId = null;
  state.editingTreeId = null;
  state.autoTitleFromUrlId = null;
  state.contextMenu = null;
  state.activePanel = "request";
  state.previousPanel = "request";
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
    if (menu.kind === "tree") {
      const itemId = menu.itemId;
      if (action === "new-request") createRequest();
      if (action === "new-folder") createFolder();
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
  tree?.addEventListener("dragover", (event) => {
    if ((event.target as HTMLElement).closest("[data-tree-id]")) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    clearDropState();
    tree.classList.add("drop-root");
  });
  tree?.addEventListener("dragleave", (event) => {
    if (!tree.contains(event.relatedTarget as Node | null)) tree.classList.remove("drop-root");
  });
  tree?.addEventListener("drop", (event) => {
    if ((event.target as HTMLElement).closest("[data-tree-id]")) return;
    event.preventDefault();
    tree.classList.remove("drop-root");
    const sourceId = readDraggedId(event);
    if (!sourceId) return;
    moveItemTo(sourceId, null, state.items.filter((item) => item.parentId === null).length);
  });

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
    row.addEventListener("dragstart", (event) => {
      draggedTreeId = item.id;
      row.classList.add("dragging");
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", item.id);
        event.dataTransfer.setData("application/x-restpilot-item", item.id);
      }
    });
    row.addEventListener("dragend", () => {
      draggedTreeId = null;
      clearDropState();
    });
    row.addEventListener("dragover", (event) => {
      const sourceId = readDraggedId(event) || draggedTreeId;
      if (!sourceId || sourceId === item.id) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      clearDropState(row);
      row.classList.add(dropClassFor(row, event, sourceId));
    });
    row.addEventListener("dragleave", () => row.classList.remove("drop-before", "drop-after", "drop-into", "drop-near"));
    row.addEventListener("drop", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const sourceId = readDraggedId(event);
      if (!sourceId || sourceId === item.id) return;
      const placement = dropPlacementFor(row, event, sourceId);
      clearDropState();
      moveDroppedItem(sourceId, item, placement);
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

function dropClassFor(row: HTMLElement, event: DragEvent, sourceId: string) {
  const placement = dropPlacementFor(row, event, sourceId);
  if (placement === "before") return "drop-before";
  if (placement === "after") return "drop-after";
  return "drop-into";
}

function dropPlacementFor(row: HTMLElement, event: DragEvent, sourceId: string): "before" | "after" | "inside" {
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

function readDraggedId(event: DragEvent) {
  return event.dataTransfer?.getData("application/x-restpilot-item") || event.dataTransfer?.getData("text/plain") || draggedTreeId || "";
}

function clearDropState(except?: HTMLElement) {
  document.querySelector(".tree")?.classList.remove("drop-root");
  document.querySelectorAll<HTMLElement>(".tree-row.drop-before, .tree-row.drop-after, .tree-row.drop-into, .tree-row.drop-near, .tree-row.dragging").forEach((row) => {
    if (row !== except) row.classList.remove("drop-before", "drop-after", "drop-into", "drop-near", "dragging");
  });
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
      refreshResponseBodyDisplay(request, tab);
      return;
    }

    card.innerHTML = renderResponse(tab);
    bindResponseTabs(request.id);
    mountWorkspaceDisplays(request, tab);
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

function createFolder() {
  focusRequestWorkspace();
  const parentId = selectedFolderId();
  const folder: TreeItem = { id: id(), kind: "folder", parentId, title: "New folder", expanded: true };
  insertItemAt(folder, parentId, childCount(parentId));
  scheduleSave();
  startTreeRename(folder.id);
}

function createRequest() {
  const parentId = selectedFolderId();
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

  scheduleSave();
  refreshTabBar();

  if (state.activePanel === "request" && document.querySelector(".workspace-body")) {
    renderWorkspace();
    updateTreeRowActive();
    return;
  }

  render();
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
