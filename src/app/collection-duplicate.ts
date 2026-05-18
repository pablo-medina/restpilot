import type { DuplicateNamingMode, Folder, SavedRequest, TreeItem } from "../types";
import { titleForDuplicate } from "./collection-names";
import { uniquifySiblingTitle } from "./collection-sibling-names";
import { insertItemAt, insertSubtreeAfter } from "./collection-store";
import { id } from "./state";

function cloneRequest(source: SavedRequest, nextId: string, parentId: string, title: string): SavedRequest {
  const copy = structuredClone(source);
  copy.id = nextId;
  copy.parentId = parentId;
  copy.title = title;
  copy.headers = copy.headers.map((pair) => ({ ...pair, id: id() }));
  copy.queryParams = copy.queryParams.map((pair) => ({ ...pair, id: id() }));
  copy.form = copy.form.map((pair) => ({ ...pair, id: id() }));
  copy.lastResponse = null;
  copy.lastError = null;
  return copy;
}

function orderSubtreeItems(subtree: TreeItem[], rootId: string) {
  const ordered: TreeItem[] = [];
  const walk = (parentId: string) => {
    for (const item of subtree.filter((entry) => entry.parentId === parentId)) {
      ordered.push(item);
      if (item.kind === "folder") walk(item.id);
    }
  };
  const root = subtree.find((entry) => entry.id === rootId);
  if (root) {
    ordered.push(root);
    walk(rootId);
  }
  return ordered;
}

export function duplicateRequestItem(
  source: SavedRequest,
  items: TreeItem[],
  duplicateNaming: DuplicateNamingMode,
  insertIndex: number
) {
  const title = uniquifySiblingTitle(
    source.parentId,
    titleForDuplicate(source.title, source.parentId, items, duplicateNaming)
  );
  const copy = cloneRequest(source, id(), source.parentId, title);
  insertItemAt(copy, source.parentId, insertIndex);
  return copy.id;
}

export function duplicateFolderItem(source: Folder, items: TreeItem[], duplicateNaming: DuplicateNamingMode) {
  const subtreeIds = new Set<string>();
  const collect = (parentId: string) => {
    for (const item of items.filter((entry) => entry.parentId === parentId)) {
      subtreeIds.add(item.id);
      if (item.kind === "folder") collect(item.id);
    }
  };
  subtreeIds.add(source.id);
  collect(source.id);

  const subtree = items.filter((item) => subtreeIds.has(item.id));
  const ordered = orderSubtreeItems(subtree, source.id);
  const idMap = new Map<string, string>();
  const newRootId = id();
  idMap.set(source.id, newRootId);

  const clones: TreeItem[] = [];
  for (const item of ordered) {
    const nextId = item.id === source.id ? newRootId : id();
    idMap.set(item.id, nextId);
    const parentId =
      item.id === source.id ? source.parentId : (idMap.get(item.parentId) ?? item.parentId);

    if (item.kind === "folder") {
      const title = uniquifySiblingTitle(
        item.id === source.id ? source.parentId : parentId,
        item.id === source.id
          ? titleForDuplicate(item.title, source.parentId, items, duplicateNaming)
          : item.title
      );
      clones.push({
        ...item,
        id: nextId,
        parentId,
        title,
        expanded: item.expanded
      });
      continue;
    }

    clones.push(cloneRequest(item, nextId, parentId, item.title));
  }

  insertSubtreeAfter(source.id, clones);
  return newRootId;
}
