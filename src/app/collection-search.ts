import type { Folder, SavedRequest, TreeItem } from "../types";
import { isCollectionRoot, normalizeParentId } from "./collection-parent";

export function itemMatchesCollectionSearch(item: TreeItem, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;

  if (item.title.toLowerCase().includes(needle)) return true;
  if (item.kind === "folder") return false;

  const request = item as SavedRequest;
  if (request.method.toLowerCase().includes(needle)) return true;
  if (request.url.toLowerCase().includes(needle)) return true;
  return false;
}

function collectDescendantIds(items: TreeItem[], rootId: string) {
  const ids = new Set<string>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of items) {
      if (
        !isCollectionRoot(item.parentId) &&
        ids.has(item.parentId) &&
        !ids.has(item.id)
      ) {
        ids.add(item.id);
        changed = true;
      }
    }
  }
  return ids;
}

/** Visible item ids while filtering; `null` when the query is empty (show all). */
export function collectionSearchVisibleIds(items: TreeItem[], query: string): Set<string> | null {
  const needle = query.trim().toLowerCase();
  if (!needle) return null;

  const matching = items.filter((item) => itemMatchesCollectionSearch(item, needle)).map((item) => item.id);
  if (!matching.length) return new Set();

  const visible = new Set<string>();
  const byId = new Map(items.map((item) => [item.id, item]));

  for (const matchId of matching) {
    for (const id of collectDescendantIds(items, matchId)) {
      visible.add(id);
    }
    let parentId = normalizeParentId(byId.get(matchId)?.parentId);
    while (!isCollectionRoot(parentId)) {
      visible.add(parentId);
      parentId = normalizeParentId(byId.get(parentId)?.parentId);
    }
  }

  return visible;
}

export function folderExpandedForSearch(
  item: TreeItem,
  searchVisible: Set<string> | null,
  items: TreeItem[]
) {
  if (item.kind !== "folder") return false;
  const folder = item as Folder;
  if (!searchVisible) return folder.expanded;
  if (searchVisible.has(folder.id) && items.some((entry) => entry.parentId === folder.id && searchVisible.has(entry.id))) {
    return true;
  }
  return folder.expanded;
}
