import { defaultConfig, type AppConfig } from "../types";
import type { AppState } from "./state";
import { resetTabUsage } from "./tab-usage";

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
  | "sidebarVisible"
  | "openRequestPopover"
  | "envManageSelectedId"
  | "variablesWorkspaceTab"
  | "collectionSearchQuery"
  | "editingEnvId"
  | "previewTabId"
  | "envPopoverVariablesExpanded"
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
    sidebarVisible: true,
    openRequestPopover: null,
    envManageSelectedId: null,
    variablesWorkspaceTab: "globals",
    collectionSearchQuery: "",
    editingEnvId: null,
    previewTabId: null,
    envPopoverVariablesExpanded: false,
  };
}


/** Full factory defaults for persisted config (collections + settings). */
function defaultPersistedConfig(): AppConfig {
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
  target.extractors = fresh.extractors;
  target.helpers = fresh.helpers;

  resetTabUsage();
  Object.assign(target, runtime);
}
