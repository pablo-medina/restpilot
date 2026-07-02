import { insertItemAt } from "../../app/collection-store";
import { COLLECTION_ROOT_PARENT_ID } from "../../app/collection-parent";
import { uniquifySiblingTitle } from "../../app/collection-sibling-names";
import { scheduleSave } from "../../app/persistence";
import { blankRequest } from "../../app/request-utils";
import { childCount, selectedFolderId, setState, state, id } from "../../app/state";
import type { TreeItem } from "../../types";
import { openRequestTab } from "./tab-actions";

export function createFolder(refresh: () => void, parentId: string = COLLECTION_ROOT_PARENT_ID): void {
  const folder: TreeItem = {
    id: id(),
    kind: "folder",
    parentId,
    title: uniquifySiblingTitle(parentId, "New folder"),
    expanded: true
  };
  insertItemAt(folder, parentId, childCount(parentId));
  setState(prev => ({
    ...prev,
    activePanel: "request",
    editingTreeId: folder.id,
    selectedTreeId: folder.id,
  }));
  scheduleSave();
  refresh();
}

export function createRequest(refresh: () => void, parentId: string = selectedFolderId()): void {
  const request = blankRequest(parentId);
  request.title = uniquifySiblingTitle(parentId, request.title);
  insertItemAt(request, parentId, childCount(parentId));
  setState(prev => ({ ...prev, autoTitleFromUrlId: request.id }));
  openRequestTab(request.id, refresh);
  requestAnimationFrame(() => {
    document.querySelector<HTMLInputElement>("#url")?.focus();
  });
}
