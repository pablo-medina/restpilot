/** Collection tree root parent id (path-style, not a folder item). */
export const COLLECTION_ROOT_PARENT_ID = "/" as const;

export function normalizeParentId(parentId: string | null | undefined): string {
  if (parentId === null || parentId === undefined) return COLLECTION_ROOT_PARENT_ID;
  const trimmed = String(parentId).trim();
  if (trimmed === "" || trimmed === COLLECTION_ROOT_PARENT_ID) return COLLECTION_ROOT_PARENT_ID;
  return trimmed;
}

export function isCollectionRoot(parentId: string | null | undefined): boolean {
  return normalizeParentId(parentId) === COLLECTION_ROOT_PARENT_ID;
}
