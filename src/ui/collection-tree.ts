import {
  state,
  childrenOf,
  getItem,
  collectChildren
} from "../app/state";
import { collectionSearchVisibleIds, folderExpandedForSearch } from "../app/collection-search";
import type { PointerReorderPlacement } from "../app/pointer-reorder";
import { COLLECTION_ROOT_PARENT_ID } from "../app/collection-parent";
import type { TreeItem } from "../types";

export function treeRowClassName(item: TreeItem, editing: boolean): string {
  const classes = ["tree-row"];
  if (editing) classes.push("is-editing");
  if (state.selectedTreeId === item.id) classes.push("is-selected");
  if (item.kind === "request" && state.activeTabId === item.id) classes.push("is-open-tab");
  return classes.join(" ");
}

export function visibleTreeItems(): TreeItem[] {
  const result: TreeItem[] = [];
  const searchVisible = collectionSearchVisibleIds(state.items, state.collectionSearchQuery);
  const walk = (parentId: string) => {
    for (const item of childrenOf(parentId)) {
      if (searchVisible && !searchVisible.has(item.id)) continue;
      result.push(item);
      if (item.kind === "folder" && folderExpandedForSearch(item, searchVisible, state.items)) {
        walk(item.id);
      }
    }
  };
  walk(COLLECTION_ROOT_PARENT_ID);
  return result;
}

export function dropPlacementFor(row: HTMLElement, event: PointerEvent, sourceId: string): PointerReorderPlacement {
  const item = getItem(row.dataset.treeId ?? "");
  const source = getItem(sourceId);
  if (!item || !source) return "after";

  const rect = row.getBoundingClientRect();
  const y = event.clientY - rect.top;
  const third = rect.height / 3;

  if (item.kind === "folder" && source.id !== item.id && !collectChildren(source.id).includes(item.id)) {
    if (y < third) return "before";
    if (y > rect.height - third) return "after";
    return "inside";
  }

  if (y < rect.height / 2) return "before";
  return "after";
}
