import { getItem, state } from "./state";
import { COLLECTION_ROOT_PARENT_ID, isCollectionRoot, normalizeParentId } from "./collection-parent";
import type { Folder, SavedRequest, TreeItem } from "../types";

/** Normalize a collection path: leading slash, no trailing slash (except root). */
export function normalizeCollectionPath(path: string): string {
  let normalized = path.trim().replace(/\\/g, "/");
  if (!normalized.startsWith("/")) normalized = `/${normalized}`;
  normalized = normalized.replace(/\/+/g, "/");
  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized || COLLECTION_ROOT_PARENT_ID;
}

/** Path of the folder that contains this item (`parentId` = folder id, or `/` = root). */
export function collectionPathForParent(parentId: string): string {
  if (isCollectionRoot(parentId)) return COLLECTION_ROOT_PARENT_ID;
  const item = getItem(parentId);
  if (item?.kind === "folder") return collectionPathForFolder(item);
  return COLLECTION_ROOT_PARENT_ID;
}

/** Full path of a folder item (e.g. `/Prueba/OpenRouter`). */
export function collectionPathForFolder(folder: Folder): string {
  const parentPath = collectionPathForParent(folder.parentId);
  return parentPath === COLLECTION_ROOT_PARENT_ID
    ? `/${folder.title}`
    : `${parentPath}/${folder.title}`;
}

/** Full path of a saved request (e.g. `/Prueba/Get users`). */
export function collectionPathForRequest(request: SavedRequest): string {
  const parentPath = collectionPathForParent(request.parentId);
  return parentPath === COLLECTION_ROOT_PARENT_ID
    ? `/${request.title}`
    : `${parentPath}/${request.title}`;
}

function folderChild(parentId: string, segment: string): Folder | null {
  const parent = normalizeParentId(parentId);
  const needle = segment.trim().toLowerCase();
  if (!needle) return null;
  for (const item of state.items) {
    if (
      item.kind === "folder" &&
      normalizeParentId(item.parentId) === parent &&
      item.title.trim().toLowerCase() === needle
    ) {
      return item;
    }
  }
  return null;
}

export function resolveCollectionPath(path: string): {
  parentId: string;
  path: string;
  missingPath?: string;
} {
  const normalized = normalizeCollectionPath(path);
  if (isCollectionRoot(normalized)) {
    return { parentId: COLLECTION_ROOT_PARENT_ID, path: COLLECTION_ROOT_PARENT_ID };
  }

  const segments = normalized.slice(1).split("/").filter(Boolean);
  let currentParent: string = COLLECTION_ROOT_PARENT_ID;

  for (let index = 0; index < segments.length; index += 1) {
    const folder = folderChild(currentParent, segments[index]!);
    if (!folder) {
      const missing = `/${segments.slice(0, index + 1).join("/")}`;
      return { parentId: currentParent, path: normalized, missingPath: missing };
    }
    currentParent = folder.id;
  }

  return { parentId: currentParent, path: normalized };
}

export function listCollectionFolderPaths(): string[] {
  const paths: string[] = [COLLECTION_ROOT_PARENT_ID];
  for (const item of state.items) {
    if (item.kind === "folder") paths.push(collectionPathForFolder(item));
  }
  return paths.sort();
}

export function isInternalItemId(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && !trimmed.startsWith("/") && Boolean(getItem(trimmed));
}
