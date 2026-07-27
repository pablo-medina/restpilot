import {
  initDialogs,
  messageDialog
} from "./components/dialogs";
import { requestToCurl } from "./lib/curl";
import { preloadEditorRuntime } from "./app/editor-runtime";
import { t } from "./i18n";
import {
  closeRequestPopovers,
  setRequestPopoverHooks,
  syncRequestPopover
} from "./ui/request-popovers";
import { getEffectiveVariables } from "./app/environments";
import { bindFunctionResultDialogs } from "./app/function-result-dialog-bind";
import { bumpRenderGeneration } from "./react/render-bridge";
import { pushToast } from "./react/components/index";
import { isAppActionTarget } from "./react/lib/app-action-targets";
import { registerContextMenuBridge } from "./react/lib/context-menu-bridge";
import { bindOverlayBindings } from "./react/lib/overlay-bindings";
import { syncAppFrameLayout } from "./react/lib/sync-app-frame";
import { focusTreeSelection } from "./react/lib/collection-tree-actions";
import { ensureTab } from "./react/lib/ensure-tab";
import {
  selectFunctionInSidebar
} from "./react/lib/function-actions";
import { requestUsesSecretVariables, variablesForCurl } from "./lib/variables";
import "./styles.css";
import { COLLECTION_ROOT_PARENT_ID } from "./app/collection-parent";
import { finishBoot } from "./app/boot-loader";
import {
  applyUserSettings,
  loadStoredConfig,
  scheduleSave
} from "./app/persistence";
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

function focusRequestWorkspace(): boolean {
  if (state.activePanel === "request") return false;
  closeRequestPopovers();
  state.activePanel = "request";
  state.contextMenu = null;
  return true;
}

function renderApp() {
  syncAppFrameLayout();
}

export function syncContextMenu() {
  bumpRenderGeneration();
}

function bindEvents() {
  bindFunctionResultDialogs();
  bindOverlayBindings();
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

function selectTreeItem(itemId: string | null, options: { render?: boolean; focus?: boolean } = {}) {
  if (itemId) focusRequestWorkspace();
  state.selectedTreeId = itemId;
  if (options.render) {
    render();
    if (options.focus) focusTreeSelection();
  }
}

function onEffectiveVariablesChanged() {
  if (state.openRequestPopover === "environment") syncRequestPopover();
  bumpRenderGeneration();
}

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
    pushToast(labels.copyCurlSuccess);
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
