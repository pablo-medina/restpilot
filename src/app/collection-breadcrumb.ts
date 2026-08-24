import { getItem } from "./state";
import { isCollectionRoot } from "./collection-parent";
import type { Folder } from "../types";

/**
 * Guard against a parent cycle in a hand-edited config: no real collection nests this
 * deep, and walking a cycle would otherwise hang the render.
 */
const MAX_DEPTH = 64;

/**
 * Ancestor folders of `parentId`, outermost first (`[]` for an item at the collection
 * root). This is the same walk as {@link collectionPathForParent}, kept as items instead
 * of a joined string so the breadcrumb can link each segment back to the tree.
 */
export function collectionAncestorFolders(parentId: string): Folder[] {
  const chain: Folder[] = [];
  const seen = new Set<string>();
  let current = parentId;

  while (!isCollectionRoot(current) && chain.length < MAX_DEPTH && !seen.has(current)) {
    seen.add(current);
    const item = getItem(current);
    if (item?.kind !== "folder") break;
    chain.push(item);
    current = item.parentId;
  }

  return chain.reverse();
}
