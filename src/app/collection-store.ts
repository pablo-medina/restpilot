import { render } from "./render";
import { scheduleSave } from "./persistence";
import {
  childCount,
  childrenOf,
  collectChildren,
  getItem,
  state
} from "./state";
import type { TreeItem } from "../types";
import {
  assertUniqueSiblingTitle,
  type SiblingNameConflict,
  SiblingNameConflictError
} from "./collection-sibling-names";
import { isCollectionRoot, normalizeParentId } from "./collection-parent";

export function insertSubtreeAfter(sourceRootId: string, clones: TreeItem[]) {
  if (!clones.length) return;

  const subtreeIds = new Set<string>([sourceRootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of state.items) {
      if (
        !isCollectionRoot(item.parentId) &&
        subtreeIds.has(item.parentId) &&
        !subtreeIds.has(item.id)
      ) {
        subtreeIds.add(item.id);
        changed = true;
      }
    }
  }

  let insertAt = state.items.length;
  for (let index = 0; index < state.items.length; index += 1) {
    if (subtreeIds.has(state.items[index]!.id)) insertAt = index + 1;
  }
  state.items.splice(insertAt, 0, ...clones);
}

export function insertItemAt(item: TreeItem, parentId: string | null | undefined, childIndex: number) {
  const normalizedParentId = normalizeParentId(parentId);
  item.parentId = normalizedParentId;
  assertUniqueSiblingTitle(normalizedParentId, item.title, item.id);
  const siblings = childrenOf(normalizedParentId);
  const normalizedIndex = Math.max(0, Math.min(childIndex, siblings.length));
  const beforeSibling = siblings[normalizedIndex];
  if (beforeSibling) {
    state.items.splice(state.items.findIndex((entry) => entry.id === beforeSibling.id), 0, item);
    return;
  }

  if (siblings.length) {
    const lastSiblingIndex = state.items.findIndex((entry) => entry.id === siblings[siblings.length - 1].id);
    state.items.splice(lastSiblingIndex + 1, 0, item);
    return;
  }

  if (!isCollectionRoot(normalizedParentId)) {
    const parentIndex = state.items.findIndex((entry) => entry.id === normalizedParentId);
    state.items.splice(parentIndex + 1, 0, item);
    return;
  }

  state.items.push(item);
}

export function moveItemTo(
  sourceId: string,
  targetParentId: string | null | undefined,
  targetChildIndex: number
): SiblingNameConflict | null {
  const normalizedTargetParentId = normalizeParentId(targetParentId);
  const source = getItem(sourceId);
  const targetParent = isCollectionRoot(normalizedTargetParentId)
    ? null
    : getItem(normalizedTargetParentId);
  if (
    !source ||
    source.id === normalizedTargetParentId ||
    (targetParent && targetParent.kind !== "folder")
  ) {
    return null;
  }
  if (
    !isCollectionRoot(normalizedTargetParentId) &&
    collectChildren(source.id).includes(normalizedTargetParentId)
  ) {
    return null;
  }

  const previousParentId = source.parentId;
  const previousIndex = childrenOf(previousParentId).findIndex((item) => item.id === source.id);
  let nextIndex = Math.max(0, targetChildIndex);
  if (
    normalizeParentId(previousParentId) === normalizedTargetParentId &&
    previousIndex >= 0 &&
    previousIndex < nextIndex
  ) {
    nextIndex -= 1;
  }

  try {
    assertUniqueSiblingTitle(normalizedTargetParentId, source.title, source.id);
  } catch (error) {
    if (error instanceof SiblingNameConflictError) return error.conflict;
    throw error;
  }

  state.items = state.items.filter((item) => item.id !== source.id);
  source.parentId = normalizedTargetParentId;
  insertItemAt(source, normalizedTargetParentId, nextIndex);
  if (targetParent?.kind === "folder") targetParent.expanded = true;
  scheduleSave();
  render();
  return null;
}

export function moveDroppedItem(
  sourceId: string,
  target: TreeItem,
  placement: "before" | "after" | "inside"
): SiblingNameConflict | null {
  if (sourceId === target.id) return null;

  if (placement === "inside" && target.kind === "folder") {
    return moveItemTo(sourceId, target.id, childCount(target.id));
  }

  const siblings = childrenOf(target.parentId);
  const targetIndex = siblings.findIndex((item) => item.id === target.id);
  return moveItemTo(sourceId, target.parentId, targetIndex + (placement === "after" ? 1 : 0));
}
