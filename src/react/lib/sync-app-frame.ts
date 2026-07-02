import { scheduleSave } from "../../app/persistence";
import { appRoot, setState, state } from "../../app/state";
import type { ActivePanel } from "../../types";

export function syncAppFrameLayout(): void {
  const isRequest = state.activePanel === "request";
  const isFunctions = state.activePanel === "functions";
  const hasSidebar = isRequest || isFunctions || state.activePanel === "variables";
  appRoot.classList.add("app-frame");
  appRoot.classList.toggle("app-frame--request", isRequest);
  appRoot.classList.toggle("app-frame--functions", isFunctions);
  appRoot.classList.toggle("app-frame--sidebar", hasSidebar);
  appRoot.classList.toggle("is-sidebar-hidden", hasSidebar && !state.sidebarVisible);
  appRoot.classList.remove("is-collection-collapsed");
}

export function toggleSidebar(refresh: () => void): void {
  setState(prev => ({ ...prev, sidebarVisible: !prev.sidebarVisible }));
  syncAppFrameLayout();
  refresh();
}

export function switchActivityPanel(panel: ActivePanel, refresh: () => void): void {
  if (state.activePanel === panel) return;
  setState(prev => ({
    ...prev,
    activePanel: panel,
    contextMenu: null,
    ...(panel === "variables" ? { variablesWorkspaceTab: "globals" as const, envManageSelectedId: "globals" } : {})
  }));
  syncAppFrameLayout();
  refresh();
}

export function selectVariableScope(scope: string, refresh: () => void): void {
  setState(prev => ({ ...prev, envManageSelectedId: scope }));
  scheduleSave();
  refresh();
}
