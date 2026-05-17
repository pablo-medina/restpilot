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

export function insertItemAt(item: TreeItem, parentId: string | null, childIndex: number) {
  item.parentId = parentId;
  const siblings = childrenOf(parentId);
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

  if (parentId) {
    const parentIndex = state.items.findIndex((entry) => entry.id === parentId);
    state.items.splice(parentIndex + 1, 0, item);
    return;
  }

  state.items.push(item);
}

export function moveItemTo(sourceId: string, targetParentId: string | null, targetChildIndex: number) {
  const source = getItem(sourceId);
  const targetParent = targetParentId ? getItem(targetParentId) : null;
  if (!source || source.id === targetParentId || (targetParent && targetParent.kind !== "folder")) return;
  if (targetParentId && collectChildren(source.id).includes(targetParentId)) return;

  const previousParentId = source.parentId;
  const previousIndex = childrenOf(previousParentId).findIndex((item) => item.id === source.id);
  let nextIndex = Math.max(0, targetChildIndex);
  if (previousParentId === targetParentId && previousIndex >= 0 && previousIndex < nextIndex) nextIndex -= 1;

  state.items = state.items.filter((item) => item.id !== source.id);
  source.parentId = targetParentId;
  insertItemAt(source, targetParentId, nextIndex);
  if (targetParent?.kind === "folder") targetParent.expanded = true;
  scheduleSave();
  render();
}

export function moveDroppedItem(sourceId: string, target: TreeItem, placement: "before" | "after" | "inside") {
  if (sourceId === target.id) return;

  if (placement === "inside" && target.kind === "folder") {
    moveItemTo(sourceId, target.id, childCount(target.id));
    return;
  }

  const siblings = childrenOf(target.parentId);
  const targetIndex = siblings.findIndex((item) => item.id === target.id);
  moveItemTo(sourceId, target.parentId, targetIndex + (placement === "after" ? 1 : 0));
}
