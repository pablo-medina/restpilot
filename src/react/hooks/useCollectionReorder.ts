import { useLayoutEffect } from "react";
import { attachPointerReorder, type PointerReorderPlacement } from "../../app/pointer-reorder";
import { moveDroppedItem } from "../../app/collection-store";
import { COLLECTION_ROOT_PARENT_ID } from "../../app/collection-parent";
import { scheduleSave } from "../../app/persistence";
import { getItem, setState, state } from "../../app/state";
import { shouldOfferTreeRootDrop, treeRowAtPointer } from "../../app/collection-tree-drag";
import { bumpRenderGeneration } from "../render-bridge";

type Options = {
  treeRef: React.RefObject<HTMLElement | null>;
  panelRef: React.RefObject<HTMLElement | null>;
};

function resolvePlacement(target: HTMLElement, event: PointerEvent): PointerReorderPlacement {
  const rect = target.getBoundingClientRect();
  const relY = event.clientY - rect.top;
  const frac = relY / rect.height;
  const targetId = target.dataset.treeId ?? "";
  const item = getItem(targetId);
  if (item?.kind === "folder") {
    if (frac < 0.25) return "before";
    if (frac > 0.75) return "after";
    return "inside";
  }
  return frac < 0.5 ? "before" : "after";
}

export function useCollectionReorder({ treeRef, panelRef }: Options): void {
  useLayoutEffect(() => {
    const tree = treeRef.current;
    if (!tree) return;

    attachPointerReorder({
      container: tree,
      itemSelector: ".tree-row[data-tree-id]",
      ignoreSelector: "[data-tree-action], .tree-rename-input",
      getItemId: (el) => el.dataset.treeId ?? "",
      resolvePlacement: (target, event, _sourceId) => resolvePlacement(target, event),
      resolveTarget: (event, _sourceId) => treeRowAtPointer(tree, event.clientX, event.clientY),
      shouldOfferRootDrop: (event, _sourceId) => {
        const panel = panelRef.current;
        if (!panel) return false;
        return shouldOfferTreeRootDrop(tree, panel, event.clientX, event.clientY);
      },
      placementClasses: { before: "drop-before", after: "drop-after", inside: "drop-into" },
      draggingClass: "dragging",
      useDragGhost: true,
      ghostClass: "pointer-drag-ghost tree-row",
      onCommit: (sourceId, targetId, placement) => {
        const target = getItem(targetId);
        if (!target) return;
        moveDroppedItem(sourceId, target, placement);
        scheduleSave();
        bumpRenderGeneration();
      },
      onCommitToRoot: (sourceId) => {
        const source = getItem(sourceId);
        if (!source) return;
        setState(prev => {
          const nextItems = prev.items.map((item) =>
            item.id === sourceId ? { ...item, parentId: COLLECTION_ROOT_PARENT_ID } : item
          );
          return { ...prev, items: nextItems };
        });
        scheduleSave();
        bumpRenderGeneration();
      }
    });
  // Run once on mount; tree content changes don't affect the listeners.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
