import { escapeHtml } from "../content-display";
import { COLLECTION_ROOT_PARENT_ID, isCollectionRoot, normalizeParentId } from "./collection-parent";
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
  | { kind: "functions-tree"; x: number; y: number; functionId: string | null }
  | { kind: "response-copy"; x: number; y: number; requestId: string; canCopySelection?: boolean }
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
  sidebarVisible: boolean;
  openRequestPopover: "environment" | "variables" | null;
  envManageSelectedId: string | null;
  variablesWorkspaceTab: "globals" | "environments";
  collectionSearchQuery: string;
  editingFunctionId: string | null;
  selectedFunctionId: string | null;
  functionSearchQuery: string;
  activeFunctionRequestTab: "params" | "headers" | "body" | "auth";
  activeFunctionConsoleTab: "test-result" | "raw-response";
  activeFunctionHttpLoading: boolean;
  activeFunctionExtractorLoading: boolean;
  activeFunctionPopover: "params" | "headers" | "body" | "auth" | null;
  activeSidebarFunctionPlayLoading: string | null;
  editingEnvId: string | null;
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
  sidebarVisible: true,
  openRequestPopover: null,
  envManageSelectedId: null,
  variablesWorkspaceTab: "globals",
  collectionSearchQuery: "",
  editingFunctionId: null,
  selectedFunctionId: null,
  functionSearchQuery: "",
  activeFunctionRequestTab: "params",
  activeFunctionConsoleTab: "test-result",
  activeFunctionHttpLoading: false,
  activeFunctionExtractorLoading: false,
  activeFunctionPopover: null,
  activeSidebarFunctionPlayLoading: null,
  editingEnvId: null
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

export function selectedFolderId(): string {
  const selected = state.selectedTreeId ? getItem(state.selectedTreeId) : null;
  if (!selected) return COLLECTION_ROOT_PARENT_ID;
  if (selected.kind === "folder") return selected.id;
  return normalizeParentId(selected.parentId);
}

export function childrenOf(parentId: string | null | undefined) {
  const normalized = normalizeParentId(parentId);
  return state.items.filter((item) => normalizeParentId(item.parentId) === normalized);
}

export function childCount(parentId: string | null | undefined) {
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
