import { defaultConfig, type AppConfig } from "../types";
import type { AppState } from "./state";

/** Ephemeral UI state (not in config.json). Reset via Clear all data. */
export function defaultRuntimeState(): Pick<
  AppState,
  | "tabs"
  | "activePanel"
  | "selectedTreeId"
  | "editingTreeId"
  | "autoTitleFromUrlId"
  | "pendingCurl"
  | "contextMenu"
  | "previousPanel"
  | "openRequestPopover"
  | "envManageSelectedId"
  | "variablesWorkspaceTab"
  | "collectionSearchQuery"
  | "collectionSidebarOpen"
  | "editingFunctionId"
  | "selectedFunctionId"
  | "functionSearchQuery"
  | "activeFunctionRequestTab"
  | "activeFunctionConsoleTab"
  | "activeFunctionHttpLoading"
  | "activeFunctionExtractorLoading"
  | "activeFunctionPopover"
  | "activeSidebarFunctionPlayLoading"
  | "aiChat"
> {

  return {
    tabs: {},
    activePanel: "request",
    selectedTreeId: null,
    editingTreeId: null,
    autoTitleFromUrlId: null,
    pendingCurl: null,
    contextMenu: null,
    previousPanel: "request",
    openRequestPopover: null,
    envManageSelectedId: null,
    variablesWorkspaceTab: "globals",
    collectionSearchQuery: "",
    collectionSidebarOpen: true,
    editingFunctionId: null,
    selectedFunctionId: null,
    functionSearchQuery: "",
    activeFunctionRequestTab: "params",
    activeFunctionConsoleTab: "test-result",
    activeFunctionHttpLoading: false,
    activeFunctionExtractorLoading: false,
    activeFunctionPopover: null,
    activeSidebarFunctionPlayLoading: null,
    aiChat: {
      messages: [],
      streaming: false,
      streamRunId: null,
      pendingToolCalls: null
    }
  };
}


/** Full factory defaults for persisted config (collections + settings). */
export function defaultPersistedConfig(): AppConfig {
  return defaultConfig();
}

/** Restore collections, settings, and runtime UI to factory defaults. */
export function resetAppStateToDefaults(target: AppState): void {
  const fresh = defaultPersistedConfig();
  const runtime = defaultRuntimeState();

  target.items = fresh.items;
  target.variables = fresh.variables;
  target.environments = fresh.environments;
  target.activeEnvironmentId = fresh.activeEnvironmentId;
  target.openTabs = fresh.openTabs;
  target.activeTabId = fresh.activeTabId;
  target.settings = fresh.settings;
  target.functions = fresh.functions;
  target.activeFunctionId = fresh.activeFunctionId;

  Object.assign(target, runtime);
}

