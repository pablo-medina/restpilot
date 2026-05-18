import { t } from "../i18n";
import {
  iconRename,
  iconDuplicate,
  iconRemove
} from "../icons";
import { escapeHtml, escapeAttribute } from "../content-display";
import { methodDataAttribute } from "../http-methods";
import {
  state,
  childrenOf,
  getItem,
  collectChildren,
  childCount
} from "../app/state";
import { collectionSearchVisibleIds, folderExpandedForSearch } from "../app/collection-search";
import { attachPointerReorder } from "../app/pointer-reorder";
import type { PointerReorderPlacement } from "../app/pointer-reorder";
import type { SiblingNameConflict } from "../app/collection-sibling-names";
import { shouldOfferTreeRootDrop, treeRowAtPointer } from "../app/collection-tree-drag";
import { COLLECTION_ROOT_PARENT_ID, isCollectionRoot } from "../app/collection-parent";
import { moveItemTo, moveDroppedItem } from "../app/collection-store";
import { render } from "../app/render";
import { scheduleSave } from "../app/persistence";
import type { TreeItem } from "../types";

export function treeRowClassName(item: TreeItem, editing: boolean): string {
  const classes = ["tree-row"];
  if (editing) classes.push("is-editing");
  if (state.selectedTreeId === item.id) classes.push("is-selected");
  if (item.kind === "request" && state.activeTabId === item.id) classes.push("is-open-tab");
  return classes.join(" ");
}

export function renderExplorerTree(parentId: string, depth: number): string {
  const labels = t().tree;
  const searchVisible = collectionSearchVisibleIds(state.items, state.collectionSearchQuery);
  return state.items
    .filter((item) => item.parentId === parentId)
    .filter((item) => !searchVisible || searchVisible.has(item.id))
    .map((item) => {
      const editing = state.editingTreeId === item.id;
      const expanded =
        item.kind === "folder" && folderExpandedForSearch(item, searchVisible, state.items);
      const children = item.kind === "folder" && item.expanded ? renderExplorerTree(item.id, depth + 1) : "";
      return `
        <div class="${treeRowClassName(item, editing)}" tabindex="0" data-tree-id="${item.id}" data-kind="${item.kind}" style="--depth:${depth}">
          <span class="tree-chevron">${item.kind === "folder" ? (expanded ? "v" : ">") : ""}</span>
          ${item.kind === "folder" ? `<span class="tree-item-icon folder-icon"></span>` : item.kind === "request" && !editing ? `<span class="tree-method"${methodDataAttribute(item.method)}>${item.method}</span>` : ""}
          <div class="tree-main">
            ${
              editing
                ? `<input class="tree-rename-input" value="${escapeAttribute(item.title)}" spellcheck="false" aria-label="${labels.rename}" />`
                : `<span class="tree-title"${
                    item.kind === "request" && item.description?.trim()
                      ? ` title="${escapeAttribute(item.description.trim())}"`
                      : ""
                  }>${escapeHtml(item.title)}</span>`
            }
          </div>
          ${
            editing
              ? ""
              : `<span class="tree-row-actions">
                  <button class="mini-btn tree-action-btn" data-tree-action="rename" data-tree-id="${item.id}" type="button" title="${labels.rename}" aria-label="${labels.rename}">${iconRename}</button>
                  <button class="mini-btn tree-action-btn" data-tree-action="duplicate" data-tree-id="${item.id}" type="button" title="${labels.duplicate}" aria-label="${labels.duplicate}">${iconDuplicate}</button>
                  <button class="mini-btn tree-action-btn danger" data-tree-action="delete" data-tree-id="${item.id}" type="button" title="${labels.delete}" aria-label="${labels.delete}">${iconRemove}</button>
                </span>`
          }
        </div>
        ${children}
      `;
    })
    .join("");
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

export function bindTree(options: {
  commitTreeRename: (itemId: string) => void;
  cancelTreeRename: () => void;
  selectAdjacentTreeItem: (direction: 1 | -1) => void;
  selectTreeItem: (itemId: string, options: { render?: boolean; focus?: boolean }) => void;
  deleteItem: (itemId: string) => Promise<void>;
  activateTreeItem: (itemId: string) => void;
  startTreeRename: (itemId: string) => void;
  duplicateItem: (itemId: string) => void;
  showSiblingNameConflictDialog: (conflict: SiblingNameConflict) => Promise<void>;
  closeContextMenu: () => void;
  focusTreeSelection: () => void;
  activateRequestTab: (itemId: string) => void;
}): void {
  if (state.activePanel !== "request") return;
  const tree = document.querySelector<HTMLElement>(".tree");
  tree?.addEventListener("keydown", async (event) => {
    if (state.editingTreeId) {
      if (event.key === "Enter") {
        event.preventDefault();
        options.commitTreeRename(state.editingTreeId);
      }
      if (event.key === "Escape") {
        event.preventDefault();
        options.cancelTreeRename();
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      options.selectAdjacentTreeItem(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      options.selectAdjacentTreeItem(-1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      const first = visibleTreeItems()[0];
      if (first) options.selectTreeItem(first.id, { render: true, focus: true });
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      const visible = visibleTreeItems();
      const last = visible[visible.length - 1];
      if (last) options.selectTreeItem(last.id, { render: true, focus: true });
      return;
    }

    const selected = state.selectedTreeId ? getItem(state.selectedTreeId) : null;
    if (!selected) return;

    if (event.key === "F2") {
      event.preventDefault();
      options.startTreeRename(selected.id);
      return;
    }
    if (event.key === "Delete") {
      event.preventDefault();
      await options.deleteItem(selected.id);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      options.activateTreeItem(selected.id);
      return;
    }
    if (event.key === "ArrowRight" && selected.kind === "folder") {
      event.preventDefault();
      if (!selected.expanded) {
        selected.expanded = true;
        scheduleSave();
        render();
      }
      return;
    }
    if (event.key === "ArrowLeft" && selected.kind === "folder") {
      event.preventDefault();
      if (selected.expanded) {
        selected.expanded = false;
        scheduleSave();
        render();
      } else if (!isCollectionRoot(selected.parentId)) {
        options.selectTreeItem(selected.parentId, { render: true, focus: true });
      }
    }
  });

  const treeDropHost = tree?.closest<HTMLElement>(".collection-sidebar-panel") ?? tree;
  if (tree && treeDropHost && tree.dataset.pointerReorderBound !== "true") {
    tree.dataset.pointerReorderBound = "true";
    const clearTreeDropRoot = () => {
      tree.classList.remove("drop-root");
      treeDropHost.classList.remove("is-drop-root-target");
    };
    attachPointerReorder({
      container: treeDropHost,
      itemSelector: ".tree-row[data-tree-id]",
      ignoreSelector: "[data-tree-action], .tree-rename-input",
      getItemId: (element: HTMLElement) => element.dataset.treeId ?? "",
      resolvePlacement: (target: HTMLElement, event: PointerEvent, sourceId: string) => dropPlacementFor(target, event, sourceId),
      resolveTarget: (event: PointerEvent) => treeRowAtPointer(tree, event.clientX, event.clientY),
      shouldOfferRootDrop: (event: PointerEvent) =>
        shouldOfferTreeRootDrop(tree, treeDropHost, event.clientX, event.clientY),
      onOverContainer: () => {
        tree.classList.add("drop-root");
        treeDropHost.classList.add("is-drop-root-target");
      },
      onLeaveContainer: clearTreeDropRoot,
      onCommitToRoot: (sourceId: string) => {
        clearTreeDropRoot();
        const conflict = moveItemTo(
          sourceId,
          COLLECTION_ROOT_PARENT_ID,
          childCount(COLLECTION_ROOT_PARENT_ID)
        );
        if (conflict) void options.showSiblingNameConflictDialog(conflict);
      },
      onCommit: (sourceId: string, targetId: string, placement: PointerReorderPlacement) => {
        clearTreeDropRoot();
        const target = getItem(targetId);
        if (!target) return;
        const conflict =
          placement === "inside"
            ? moveDroppedItem(sourceId, target, "inside")
            : moveDroppedItem(sourceId, target, placement);
        if (conflict) void options.showSiblingNameConflictDialog(conflict);
      }
    });
  }

  document.querySelectorAll<HTMLElement>(".tree-row[data-tree-id]").forEach((row) => {
    const item = getItem(row.dataset.treeId ?? "");
    if (!item) return;

    row.querySelector<HTMLInputElement>(".tree-rename-input")?.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        options.commitTreeRename(item.id);
      }
      if (event.key === "Escape") {
        event.preventDefault();
        options.cancelTreeRename();
      }
    });
    row.querySelector<HTMLInputElement>(".tree-rename-input")?.addEventListener("blur", () => {
      if (state.editingTreeId === item.id) options.commitTreeRename(item.id);
    });

    row.querySelectorAll<HTMLButtonElement>("[data-tree-action]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const action = button.dataset.treeAction ?? "";
        const targetId = button.dataset.treeId ?? item.id;
        if (action === "rename") options.startTreeRename(targetId);
        if (action === "duplicate") options.duplicateItem(targetId);
        if (action === "delete") {
          void options.deleteItem(targetId);
        }
      });
    });

    row.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).closest("[data-tree-action], .tree-rename-input")) return;
      options.closeContextMenu();
      if (
        item.kind === "request" &&
        state.settings.clickToSelect &&
        state.openTabs.includes(item.id)
      ) {
        options.activateRequestTab(item.id);
        return;
      }
      options.selectTreeItem(item.id, { render: true, focus: true });
    });
    row.addEventListener("dblclick", (event) => {
      if ((event.target as HTMLElement).closest("[data-tree-action], .tree-rename-input")) return;
      options.activateTreeItem(item.id);
    });
  });

  options.focusTreeSelection();
}
