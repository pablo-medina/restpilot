import { collectionPathForFolder, normalizeCollectionPath, resolveCollectionPath } from "./collection-path";
import { COLLECTION_ROOT_PARENT_ID, isCollectionRoot, normalizeParentId } from "./collection-parent";
import { insertItemAt } from "./collection-store";
import { uniquifySiblingTitle } from "./collection-sibling-names";
import { childCount, id, state } from "./state";
import type { Folder } from "../types";

export type EnsuredFolderPath = {
  parentId: string;
  path: string;
  created: Array<{ folder_id: string; path: string; title: string }>;
};

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

/** Create missing folder segments for a path like `/data` or `/a/b` (not root). */
export function ensureFolderPathExists(folderPath: string): EnsuredFolderPath {
  const normalized = normalizeCollectionPath(folderPath);
  if (isCollectionRoot(normalized)) {
    return { parentId: COLLECTION_ROOT_PARENT_ID, path: normalized, created: [] };
  }

  const existing = resolveCollectionPath(normalized);
  if (!existing.missingPath) {
    return { parentId: existing.parentId, path: normalized, created: [] };
  }

  const segments = normalized.slice(1).split("/").filter(Boolean);
  let currentParent: string = COLLECTION_ROOT_PARENT_ID;
  const created: EnsuredFolderPath["created"] = [];

  for (const segment of segments) {
    const match = folderChild(currentParent, segment);
    if (match) {
      currentParent = match.id;
      continue;
    }

    const title = uniquifySiblingTitle(currentParent, segment);
    const folder: Folder = {
      id: id(),
      kind: "folder",
      parentId: currentParent,
      title,
      expanded: true
    };
    insertItemAt(folder, currentParent, childCount(currentParent));
    const path = collectionPathForFolder(folder);
    created.push({ folder_id: folder.id, path, title: folder.title });
    currentParent = folder.id;
  }

  return { parentId: currentParent, path: normalized, created };
}
