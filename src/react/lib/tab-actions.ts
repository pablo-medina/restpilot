import { unmountRequestTabEditors } from "../../app/request-workspace";
import { scheduleSave } from "../../app/persistence";
import { getRequest, setState, state } from "../../app/state";
import { bumpRenderGeneration } from "../render-bridge";
import { ensureTab } from "./ensure-tab";

export function openRequestTab(requestId: string, refresh: () => void): void {
  if (!getRequest(requestId)) return;

  const current = state;
  const newAutoTitle =
    current.autoTitleFromUrlId && current.autoTitleFromUrlId !== requestId
      ? null
      : current.autoTitleFromUrlId;
  const isNewTab = !current.openTabs.includes(requestId);

  ensureTab(requestId);

  setState(prev => ({
    ...prev,
    autoTitleFromUrlId: newAutoTitle,
    activePanel: "request",
    contextMenu: null,
    openTabs: isNewTab ? [...prev.openTabs, requestId] : prev.openTabs,
    activeTabId: requestId,
    selectedTreeId: requestId,
    // Opening permanently always promotes: clear preview status if this tab was it.
    previewTabId: prev.previewTabId === requestId ? null : prev.previewTabId,
  }));

  scheduleSave();
  refresh();
}

/**
 * Opens a request in "preview" mode (VS Code-style): the tab title is shown in italic
 * and it is replaced by the next single-clicked request. If another preview tab was
 * open it is closed first (unless it was already permanent).
 */
export function openRequestTabAsPreview(requestId: string, refresh: () => void): void {
  if (!getRequest(requestId)) return;

  const current = state;
  const newAutoTitle =
    current.autoTitleFromUrlId && current.autoTitleFromUrlId !== requestId
      ? null
      : current.autoTitleFromUrlId;

  ensureTab(requestId);

  setState(prev => {
    const prevPreviewId = prev.previewTabId;
    let nextOpenTabs = prev.openTabs;

    // Close the old preview tab if it is different from the new one.
    if (prevPreviewId && prevPreviewId !== requestId) {
      nextOpenTabs = nextOpenTabs.filter(id => id !== prevPreviewId);
    }

    // Add this request to tabs if not already there.
    if (!nextOpenTabs.includes(requestId)) {
      nextOpenTabs = [...nextOpenTabs, requestId];
    }

    return {
      ...prev,
      autoTitleFromUrlId: newAutoTitle,
      activePanel: "request",
      contextMenu: null,
      openTabs: nextOpenTabs,
      activeTabId: requestId,
      selectedTreeId: requestId,
      previewTabId: requestId,
    };
  });

  scheduleSave();
  refresh();
}

export function closeRequestTab(requestId: string, refresh: () => void): void {
  if (!requestId || !state.openTabs.includes(requestId)) return;

  unmountRequestTabEditors(requestId);

  setState(prev => {
    const nextTabs = { ...prev.tabs };
    delete nextTabs[requestId];

    const closedIndex = prev.openTabs.indexOf(requestId);
    const nextOpenTabs = prev.openTabs.filter((id) => id !== requestId);

    let nextActiveTabId = prev.activeTabId;
    let nextSelectedTreeId = prev.selectedTreeId;
    if (prev.activeTabId === requestId) {
      const nextIndex = Math.min(closedIndex, Math.max(0, nextOpenTabs.length - 1));
      nextActiveTabId = nextOpenTabs[nextIndex] ?? "";
      if (nextActiveTabId) nextSelectedTreeId = nextActiveTabId;
    }

    return {
      ...prev,
      tabs: nextTabs,
      openTabs: nextOpenTabs,
      activeTabId: nextActiveTabId,
      selectedTreeId: nextSelectedTreeId,
      previewTabId: prev.previewTabId === requestId ? null : prev.previewTabId,
    };
  });

  scheduleSave();
  refresh();
}

export function closeOtherTabs(keepId: string, refresh: () => void): void {
  if (!state.openTabs.includes(keepId)) return;
  for (const tabId of state.openTabs) {
    if (tabId !== keepId) unmountRequestTabEditors(tabId);
  }
  setState(prev => {
    const nextTabs: typeof prev.tabs = {};
    if (prev.tabs[keepId]) nextTabs[keepId] = prev.tabs[keepId];
    return {
      ...prev,
      tabs: nextTabs,
      openTabs: [keepId],
      activeTabId: keepId,
      selectedTreeId: keepId,
      previewTabId: prev.previewTabId !== keepId ? null : prev.previewTabId,
    };
  });
  scheduleSave();
  refresh();
}

export function closeAllTabs(refresh: () => void): void {
  for (const tabId of state.openTabs) unmountRequestTabEditors(tabId);
  setState(prev => ({ ...prev, tabs: {}, openTabs: [], activeTabId: "", previewTabId: null }));
  scheduleSave();
  refresh();
}

export function clearTabResponse(requestId: string, refresh: () => void): void {
  const request = getRequest(requestId);
  if (request) { request.lastResponse = null; request.lastError = null; }
  setState(prev => {
    const tab = prev.tabs[requestId];
    if (!tab) return prev;
    return { ...prev, tabs: { ...prev.tabs, [requestId]: { ...tab, response: null, error: null } } };
  });
  scheduleSave();
  bumpRenderGeneration();
  refresh();
}
