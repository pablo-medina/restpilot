import { getItem } from "./state";
import { COLLECTION_ROOT_PARENT_ID, isCollectionRoot } from "./collection-parent";
import type { Folder, SavedRequest } from "../types";

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
