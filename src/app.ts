import {
  initDialogs,
  messageDialog
} from "./components/dialogs";
import { escapeHtml } from "./lib/content-display";
import { requestToCurl } from "./lib/curl";
import { preloadEditorRuntime } from "./app/editor-runtime";
import { getLocale, t } from "./i18n";
import {
  resetSettingsSessionState
} from "./lib/settings";
import {
  closeRequestPopovers,
  setRequestPopoverHooks,
  syncRequestPopover
} from "./ui/request-popovers";
import { environmentChipLabel, getEffectiveVariables } from "./app/environments";
import { displayRequestUrl } from "./lib/variables";
import { removePopovers } from "./components/popover";
import { refreshRequestWorkspace, unmountRequestTabEditors } from "./app/request-workspace";
import { bindFunctionResultDialogs } from "./app/function-result-dialog-bind";
import { bumpRenderGeneration } from "./react/render-bridge";
import { pushToast } from "./react/components/index";
import { isAppActionTarget } from "./react/lib/app-action-targets";
import { registerContextMenuBridge } from "./react/lib/context-menu-bridge";
import { bindOverlayBindings } from "./react/lib/overlay-bindings";
import { syncAppFrameLayout } from "./react/lib/sync-app-frame";
import { trySendRequest as sendActiveRequest } from "./react/lib/request-send";
import { openSettingsDialog as openReactSettingsDialog } from "./react/lib/settings-dialog";
import {
  focusTreeSelection,
  focusTreeRenameInput
} from "./react/lib/collection-tree-actions";
import {
  selectFunctionInSidebar
} from "./react/lib/function-actions";
import { runFunctionExtractor } from "./react/lib/function-runtime";
import { requestUsesSecretVariables, variablesForCurl } from "./lib/variables";
import "./styles.css";
import {
  type ActivePanel,
  type SavedRequest,
  type TabState
} from "./types";
import { COLLECTION_ROOT_PARENT_ID } from "./app/collection-parent";
import {
  buildSiblingNameConflict,
  type SiblingNameConflict,
  uniquifySiblingTitle
} from "./app/collection-sibling-names";
import { finishBoot } from "./app/boot-loader";
import { visibleTreeItems } from "./ui/collection-tree";
import { initResponsePanel } from "./ui/response-panel";
import {
  applyUserSettings,
  loadStoredConfig,
  persistConfig,
  scheduleSave
} from "./app/persistence";
import { resetAppStateToDefaults } from "./app/reset-app-state";
import { render, setRenderApp } from "./app/render";
import {
  hasResponseBodySelection,
  resolveTextContextMenu
} from "./app/context-menu";
import {
  getActiveRequest,
  getItem,
  getRequest,
  getRequestFrom,
  id,
  state
} from "./app/state";
import { initWindowChrome } from "./ui/window-chrome";

export async function startApp(
  configPromise: ReturnType<typeof loadStoredConfig> = loadStoredConfig()
) {
  registerContextMenuBridge({
    sync: syncContextMenu,
    close: closeContextMenu
  });
  initDialogs(render);
  initResponsePanel({
    closeContextMenu,
    syncContextMenu
  });
  setRenderApp(renderApp);
  setRequestPopoverHooks({
    onVariablesChanged: onEffectiveVariablesChanged
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
        activeFunctionId: null
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
  bindEvents();

  if (configLoadFailed) {
    const labels = t().messages;
    await messageDialog("warning", labels.configTitle, labels.configLoadFailed);
  }

  focusUrlOnStartup();
}

function focusUrlOnStartup() {
  if (state.activePanel !== "request" || !getActiveRequest()) return;
  focusRequestUrl();
}

// (updateTabStripActive extracted to src/ui/tabs-bar.ts)

function focusRequestWorkspace(): boolean {
  if (state.activePanel === "request") return false;
  closeRequestPopovers();
  state.activePanel = "request";
  state.contextMenu = null;
  return true;
}

// (removeStrayTabBars, applyOpenTabOrder, updateTabStripScroll extracted to src/ui/tabs-bar.ts)

// (treeRowClassName extracted to src/ui/collection-tree.ts)

function activateRequestTab(requestId: string) {
  const previousId = state.activeTabId;
  const panelChanged = focusRequestWorkspace();
  state.activeTabId = requestId;
  state.selectedTreeId = requestId;
  ensureTab(requestId);
  if (previousId && previousId !== requestId) unmountRequestTabEditors(previousId);
  scheduleSave();
  if (panelChanged) render();
  else bumpRenderGeneration();
  refreshRequestWorkspace();
}

function renderApp() {
  syncAppFrameLayout();
}


export function syncContextMenu() {
  bumpRenderGeneration();
}

// (renderTabBar, renderTab extracted to src/ui/tabs-bar.ts)

function bindEvents() {
  bindFunctionResultDialogs();
  bindOverlayBindings(onEffectiveVariablesChanged);
}

function openSettingsDialog() {
  openReactSettingsDialog();
}

function openPanel(panel: ActivePanel) {
  if (panel === "settings") {
    openSettingsDialog();
    return;
  }
  closeRequestPopovers();
  state.activePanel = panel;
  state.contextMenu = null;
  render();
}

function backToWorkspace() {
  openPanel("request");
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

export function showToast(message: string) {
  pushToast(message);
}

export function closeContextMenu() {
  if (!state.contextMenu) return;
  state.contextMenu = null;
  bumpRenderGeneration();
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
    if (functionId) selectFunctionInSidebar(functionId, bumpRenderGeneration);
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

export function ensureContextMenuHandlers() {
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
      if (isAppActionTarget(event.target)) return;
      closeContextMenu();
    },
    true
  );
}

// (bindTree and visibleTreeItems extracted to src/ui/collection-tree.ts)

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

async function showSiblingNameConflictDialog(conflict: SiblingNameConflict) {
  const labels = t().tree;
  const paths = conflict.existing.map((entry) => `• ${entry.path}`).join("\n");
  await messageDialog(
    "warning",
    labels.duplicateNameTitle,
    labels.duplicateNameBody
      .replace("{title}", conflict.title)
      .replace("{parent}", conflict.parentPath)
      .replace("{paths}", paths)
  );
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
  if (nextTitle) {
    const conflict = buildSiblingNameConflict(item.parentId, nextTitle, item.id);
    if (conflict) {
      void showSiblingNameConflictDialog(conflict);
      render();
      focusTreeSelection();
      return;
    }
    item.title = nextTitle;
  }
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

// (dropPlacementFor extracted to src/ui/collection-tree.ts)

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

function onEffectiveVariablesChanged() {
  if (state.openRequestPopover === "environment") syncRequestPopover();
  bumpRenderGeneration();
}

// (bindResponseCopyMenu and copy response actions extracted to src/ui/response-panel.ts)

export async function copyRequestAsCurl(requestId: string) {
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

export function parentIdForTreeCreate(contextItemId: string | null | undefined): string {
  if (!contextItemId) return COLLECTION_ROOT_PARENT_ID;
  const item = getItem(contextItemId);
  if (!item) return COLLECTION_ROOT_PARENT_ID;
  if (item.kind === "folder") return item.id;
  return item.parentId;
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
  if (buildSiblingNameConflict(request.parentId, derived, request.id)) return;
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

function openRequest(requestId: string) {
  if (!getRequest(requestId)) return;
  if (state.autoTitleFromUrlId && state.autoTitleFromUrlId !== requestId) {
    state.autoTitleFromUrlId = null;
  }
  const panelChanged = focusRequestWorkspace();
  const isNewTab = !state.openTabs.includes(requestId);
  if (isNewTab) {
    state.openTabs.push(requestId);
  }
  ensureTab(requestId);
  state.activeTabId = requestId;
  state.selectedTreeId = requestId;
  scheduleSave();
  if (panelChanged) render();
  else bumpRenderGeneration();
  refreshRequestWorkspace();
}

function afterOpenTabsChanged() {
  scheduleSave();
  if (state.activePanel === "request") {
    refreshRequestWorkspace();
    return;
  }
  render();
}

function closeTab(requestId: string) {
  if (!requestId || !state.openTabs.includes(requestId)) return;

  unmountRequestTabEditors(requestId);
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
    unmountRequestTabEditors(id);
    delete state.tabs[id];
  }

  state.openTabs = [keepId];
  state.activeTabId = keepId;
  state.selectedTreeId = keepId;
  afterOpenTabsChanged();
}

function closeAllTabs() {
  for (const id of state.openTabs) {
    unmountRequestTabEditors(id);
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
      selectedRequestTab: "body",
      selectedSavedResponseId: "current"
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

