import { COLLECTION_ROOT_PARENT_ID } from "../app/collection-parent";
import { buildCollectionSnapshot } from "../app/collection-format";
import { collectChildren, getItem, state } from "../app/state";
import type { CollectionSnapshot, Folder, TreeItem } from "../types";

export type FolderExportSnapshot = CollectionSnapshot & {
  folderName: string;
  folderId: string;
};

function rerootSubtreeItems(items: TreeItem[], folderId: string): TreeItem[] {
  return items.map((item) =>
    item.id === folderId ? { ...item, parentId: COLLECTION_ROOT_PARENT_ID } : item
  );
}

export function buildFolderExportSnapshot(folderId: string): FolderExportSnapshot | null {
  const folder = getItem(folderId);
  if (!folder || folder.kind !== "folder") return null;

  const subtreeIds = new Set(collectChildren(folderId));
  const items = rerootSubtreeItems(
    state.items.filter((item) => subtreeIds.has(item.id)),
    folderId
  );

  return {
    folderId,
    folderName: folder.title,
    items,
    variables: state.variables.map((variable) => ({ ...variable })),
    environments: state.environments.map((environment) => ({
      ...environment,
      variables: environment.variables.map((variable) => ({ ...variable }))
    })),
    activeEnvironmentId: state.activeEnvironmentId
  };
}

export function sanitizedFolderCollectionSnapshot(
  snapshot: FolderExportSnapshot,
  excludeValues: boolean
): CollectionSnapshot {
  return buildCollectionSnapshot(
    {
      items: snapshot.items,
      variables: snapshot.variables,
      environments: snapshot.environments,
      activeEnvironmentId: snapshot.activeEnvironmentId
    },
    excludeValues
  );
}

export function folderExportDefaultName(folder: Folder): string {
  const sanitized = folder.title
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return sanitized || "folder";
}
