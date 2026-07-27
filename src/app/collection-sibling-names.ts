import {
  collectionPathForFolder,
  collectionPathForParent,
  collectionPathForRequest
} from "./collection-path";
import { duplicateBaseTitle } from "./collection-names";
import { normalizeParentId } from "./collection-parent";
import { state } from "./state";
import type { TreeItem } from "../types";

export type SiblingNameConflictEntry = {
  id: string;
  kind: TreeItem["kind"];
  path: string;
  title: string;
};

export type SiblingNameConflict = {
  title: string;
  parentPath: string;
  existing: SiblingNameConflictEntry[];
};

export class SiblingNameConflictError extends Error {
  readonly conflict: SiblingNameConflict;

  constructor(conflict: SiblingNameConflict) {
    super(`Duplicate name "${conflict.title}" under ${conflict.parentPath}`);
    this.name = "SiblingNameConflictError";
    this.conflict = conflict;
  }
}

function itemCollectionPath(item: TreeItem): string {
  if (item.kind === "folder") return collectionPathForFolder(item);
  return collectionPathForRequest(item);
}

export function uniquifySiblingTitle(
  parentId: string,
  baseTitle: string,
  excludeId?: string
): string {
  const trimmed = baseTitle.trim() || baseTitle;
  if (!buildSiblingNameConflict(parentId, trimmed, excludeId)) return trimmed;
  const base = duplicateBaseTitle(trimmed);
  let index = 2;
  while (buildSiblingNameConflict(parentId, `${base} (${index})`, excludeId)) {
    index += 1;
  }
  return `${base} (${index})`;
}

function findSiblingTitleConflicts(
  parentId: string,
  title: string,
  excludeId?: string
): TreeItem[] {
  const parent = normalizeParentId(parentId);
  const needle = title.trim().toLowerCase();
  if (!needle) return [];
  return state.items.filter(
    (item) =>
      item.id !== excludeId &&
      normalizeParentId(item.parentId) === parent &&
      item.title.trim().toLowerCase() === needle
  );
}

export function buildSiblingNameConflict(
  parentId: string,
  title: string,
  excludeId?: string
): SiblingNameConflict | null {
  const conflicts = findSiblingTitleConflicts(parentId, title, excludeId);
  if (!conflicts.length) return null;
  return {
    title: title.trim(),
    parentPath: collectionPathForParent(parentId),
    existing: conflicts.map((item) => ({
      id: item.id,
      kind: item.kind,
      path: itemCollectionPath(item),
      title: item.title
    }))
  };
}

export function assertUniqueSiblingTitle(
  parentId: string,
  title: string,
  excludeId?: string
): void {
  const conflict = buildSiblingNameConflict(parentId, title, excludeId);
  if (conflict) throw new SiblingNameConflictError(conflict);
}
