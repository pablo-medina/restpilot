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
import { bumpRenderGeneration } from "./react/render-bridge";
import { pushToast } from "./react/components/index";
import { isAppActionTarget } from "./react/lib/app-action-targets";
import { registerContextMenuBridge } from "./react/lib/context-menu-bridge";
import { bindOverlayBindings } from "./react/lib/overlay-bindings";
import { syncAppFrameLayout } from "./react/lib/sync-app-frame";
import { focusTreeSelection } from "./react/lib/collection-tree-actions";
import { ensureTab } from "./react/lib/ensure-tab";
import { enforceOpenTabLimit } from "./react/lib/tab-actions";
import { markTabUsed } from "./app/tab-usage";
import { requestUsesSecretVariables, variablesForCurl } from "./lib/variables";
import type { AppConfig } from "./types";
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

  // Warm the CodeMirror chunk in the background. It is deliberately *not* awaited:
  // every editor host mounts itself once the chunk lands (see CodeMirrorEditor), so
  // blocking the first paint on ~390 KB of editor code only delays the whole window.
  void preloadEditorRuntime();
  let configLoadFailed = false;

  try {
    const loaded = await configPromise;
    if (loaded) {
      const { config: migrated, persist } = loaded;
      // Typed as the whole config on purpose: adding a field to `AppConfig` and forgetting
      // it here is how the script library got saved but never restored, so let that be a
      // compile error rather than something to notice on the next restart.
      const restored: Omit<AppConfig, "configVersion"> = {
        items: migrated.items,
        variables: migrated.variables ?? [],
        environments: migrated.environments ?? [],
        activeEnvironmentId: migrated.activeEnvironmentId ?? null,
        openTabs: (migrated.openTabs ?? []).filter((tabId) => Boolean(getRequestFrom(migrated.items, tabId))),
        activeTabId: "",
        settings: migrated.settings,
        helpers: migrated.helpers ?? []
      };
      Object.assign(state, restored);
      state.activeTabId = state.openTabs.includes(migrated.activeTabId) ? migrated.activeTabId : (state.openTabs[0] ?? "");
      if (persist) scheduleSave();

    }
  } catch {
    configLoadFailed = true;
  }

  applyUserSettings(state.settings);

  initWindowChrome();
  // A restored session has no usage history, so the limit ranks by strip order: the tabs
  // furthest from the restored active one are the ones that do not come back.
  markTabUsed(state.activeTabId);
  enforceOpenTabLimit();
  for (const id of state.openTabs) ensureTab(id);
  render();
  bindEvents();

  // Unhide only once the tree/tabs/panels have been rendered, so the window never
  // flashes an empty shell between the splash and the first real frame.
  finishBoot();

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
