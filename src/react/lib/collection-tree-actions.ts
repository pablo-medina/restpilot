import { messageDialog } from "../../components/dialogs";
import { duplicateFolderItem, duplicateRequestItem } from "../../app/collection-duplicate";
import { isCollectionRoot } from "../../app/collection-parent";
import { scheduleSave } from "../../app/persistence";
import { childrenOf, collectChildren, getItem, setState, state } from "../../app/state";
import { visibleTreeItems } from "../../ui/collection-tree";
import { t } from "../../i18n";
import { openRequestTab } from "./tab-actions";

export function focusTreeRenameInput(itemId: string): void {
  const input = document.querySelector<HTMLInputElement>(`.tree-row[data-tree-id="${itemId}"] .tree-rename-input`);
  if (!input) return;
  input.focus();
  input.select();
}

export function startTreeRename(itemId: string, refresh: () => void): void {
  const item = getItem(itemId);
  if (!item) return;
  setState(prev => ({ ...prev, editingTreeId: itemId, selectedTreeId: itemId, contextMenu: null }));
  refresh();
  requestAnimationFrame(() => focusTreeRenameInput(itemId));
}

export function focusTreeSelection(): void {
  if (state.editingTreeId) {
    focusTreeRenameInput(state.editingTreeId);
    return;
  }
  if (state.selectedTreeId) {
    const row = document.querySelector<HTMLElement>(`.tree-row[data-tree-id="${state.selectedTreeId}"]`);
    if (row) {
      row.focus();
      return;
    }
  }
  document.querySelector<HTMLElement>(".tree")?.focus();
}

function pickTreeFocusAfterDelete(itemId: string): string | null {
  const item = getItem(itemId);
  if (!item) return state.selectedTreeId;

  const siblings = childrenOf(item.parentId);
  const index = siblings.findIndex((sibling) => sibling.id === itemId);
  const remaining = siblings.filter((sibling) => sibling.id !== itemId);

  if (remaining.length > 0) {
    if (index < remaining.length) return remaining[index].id;
    return remaining[remaining.length - 1].id;
  }

  if (!isCollectionRoot(item.parentId)) return item.parentId;

  const visible = visibleTreeItems().filter(
    (entry) => entry.id !== itemId && !collectChildren(itemId).includes(entry.id)
  );
  return visible[0]?.id ?? null;
}

export function duplicateTreeItem(itemId: string, refresh: () => void): void {
  const source = getItem(itemId);
  if (!source) return;

  const duplicateNaming = state.settings.duplicateNaming;
  let focusId = itemId;

  if (source.kind === "folder") {
    focusId = duplicateFolderItem(source, state.items, duplicateNaming);
  } else {
    const siblings = childrenOf(source.parentId);
    const insertIndex = siblings.findIndex((item) => item.id === source.id) + 1;
    focusId = duplicateRequestItem(source, state.items, duplicateNaming, insertIndex);
    openRequestTab(focusId, refresh);
  }

  setState(prev => ({ ...prev, selectedTreeId: focusId }));
  scheduleSave();
  refresh();
  requestAnimationFrame(() => focusTreeSelection());
}

export async function deleteTreeItem(itemId: string, refresh: () => void): Promise<void> {
  const item = getItem(itemId);
  if (!item) return;
  const labels = t().messages;
  const answer = await messageDialog(
    "confirmation",
    labels.deleteTitle,
    labels.deleteBody.replace("{name}", item.title)
  );
  if (answer !== "confirm") {
    requestAnimationFrame(() => focusTreeSelection());
    return;
  }

  const ids = collectChildren(itemId);
  const nextFocus = pickTreeFocusAfterDelete(itemId);

  setState(prev => {
    const nextItems = prev.items.filter((entry) => !ids.includes(entry.id));
    const nextOpenTabs = prev.openTabs.filter((id) => !ids.includes(id));
    const nextTabs = Object.fromEntries(
      Object.entries(prev.tabs).filter(([id]) => !ids.includes(id))
    ) as typeof prev.tabs;
    const nextActiveTabId = nextOpenTabs.includes(prev.activeTabId)
      ? prev.activeTabId
      : (nextOpenTabs[0] ?? "");
    const nextEditingTreeId =
      prev.editingTreeId && ids.includes(prev.editingTreeId) ? null : prev.editingTreeId;
    const nextAutoTitle =
      prev.autoTitleFromUrlId && ids.includes(prev.autoTitleFromUrlId)
        ? null
        : prev.autoTitleFromUrlId;
    const nextSelectedTreeId =
      !prev.selectedTreeId || ids.includes(prev.selectedTreeId) ? nextFocus : prev.selectedTreeId;

    return {
      ...prev,
      items: nextItems,
      openTabs: nextOpenTabs,
      tabs: nextTabs,
      activeTabId: nextActiveTabId,
      editingTreeId: nextEditingTreeId,
      autoTitleFromUrlId: nextAutoTitle,
      selectedTreeId: nextSelectedTreeId,
    };
  });

  scheduleSave();
  refresh();
  requestAnimationFrame(() => focusTreeSelection());
}
