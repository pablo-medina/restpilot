import { scheduleSave } from "../../app/persistence";
import { appRoot, setState, state } from "../../app/state";

export function syncAppFrameLayout(): void {
  const isRequest = state.activePanel === "request";
  appRoot.classList.add("app-frame");
  appRoot.classList.toggle("app-frame--request", isRequest);
  appRoot.classList.toggle("app-frame--sidebar", isRequest);
  appRoot.classList.toggle("is-sidebar-hidden", isRequest && !state.sidebarVisible);
  appRoot.classList.remove("is-collection-collapsed");
}

/** Opens the sidebar when something needs to be shown in it; no-op when already visible. */
export function showSidebar(): void {
  if (state.sidebarVisible) return;
  setState(prev => ({ ...prev, sidebarVisible: true }));
  syncAppFrameLayout();
}

export function toggleSidebar(refresh: () => void): void {
  setState(prev => ({ ...prev, sidebarVisible: !prev.sidebarVisible }));
  syncAppFrameLayout();
  refresh();
}

export function selectVariableScope(scope: string, refresh: () => void): void {
  setState(prev => ({ ...prev, envManageSelectedId: scope }));
  scheduleSave();
  refresh();
}
