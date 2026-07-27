import { state, childrenOf } from "../app/state";
import { collectionSearchVisibleIds, folderExpandedForSearch } from "../app/collection-search";
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

