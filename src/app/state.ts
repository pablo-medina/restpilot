import { escapeHtml } from "../content-display";
import type { TextContextFlags } from "./context-menu";
import { defaultConfig } from "../types";
import type {
  ActivePanel,
  AppConfig,
  SavedRequest,
  TabState,
  TreeItem
} from "../types";

export type ContextMenuState =
  | { kind: "tree"; x: number; y: number; itemId: string | null }
  | { kind: "response-copy"; x: number; y: number; requestId: string }
  | { kind: "request-actions"; x: number; y: number; requestId: string }
  | { kind: "request-tab"; x: number; y: number; requestId: string }
  | ({ kind: "text"; x: number; y: number } & TextContextFlags);

export type AppState = AppConfig & {
  tabs: Record<string, TabState>;
  activePanel: ActivePanel;
  selectedTreeId: string | null;
  editingTreeId: string | null;
  autoTitleFromUrlId: string | null;
  pendingCurl: SavedRequest | null;
  contextMenu: ContextMenuState | null;
  previousPanel: ActivePanel;
  openRequestPopover: "environment" | "variables" | null;
  envManageSelectedId: string | null;
  variablesWorkspaceTab: "globals" | "environments";
  collectionSearchQuery: string;
};

export const state: AppState = {
  ...defaultConfig(),
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
  collectionSearchQuery: ""
};

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("App root was not found.");
export const appRoot: HTMLDivElement = root;

export function id() {
  return crypto.randomUUID();
}

export function getActiveRequest() {
  return getRequest(state.activeTabId);
}

export function getRequest(itemId: string) {
  return state.items.find((item): item is SavedRequest => item.kind === "request" && item.id === itemId);
}

export function getRequestFrom(items: TreeItem[], itemId: string) {
  return items.find((item): item is SavedRequest => item.kind === "request" && item.id === itemId);
}

export function getItem(itemId: string) {
  return state.items.find((item) => item.id === itemId);
}

export function selectedFolderId() {
  const selected = state.selectedTreeId ? getItem(state.selectedTreeId) : null;
  return selected?.kind === "folder" ? selected.id : selected?.parentId ?? null;
}

export function childrenOf(parentId: string | null) {
  return state.items.filter((item) => item.parentId === parentId);
}

export function childCount(parentId: string | null) {
  return childrenOf(parentId).length;
}

export function collectChildren(itemId: string): string[] {
  return [itemId, ...state.items.filter((item) => item.parentId === itemId).flatMap((item) => collectChildren(item.id))];
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
