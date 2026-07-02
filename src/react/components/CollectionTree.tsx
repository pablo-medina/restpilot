import { useRef } from "react";
import { useRenderGeneration } from "../hooks/useRenderGeneration";
import { useCollectionReorder } from "../hooks/useCollectionReorder";
import { stopRowActionPointer } from "../lib/row-action-events";
import { scheduleSave } from "../../app/persistence";
import { setState, state } from "../../app/state";
import { collectionSearchVisibleIds, folderExpandedForSearch } from "../../app/collection-search";
import { COLLECTION_ROOT_PARENT_ID } from "../../app/collection-parent";
import { iconDuplicate, iconRemove, iconRename } from "../../lib/icons";
import { isHttpMethod } from "../../lib/http-methods";
import { t } from "../../i18n";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from "react";
import type { TreeItem } from "../../types";
import { treeRowClassName } from "../../ui/collection-tree";
import { openRequestTab } from "../lib/tab-actions";
import { deleteTreeItem, duplicateTreeItem } from "../lib/collection-tree-actions";
import { Icon } from "./Icon";

type TreeRowProps = {
  item: TreeItem;
  depth: number;
  searchVisible: Set<string> | null;
  refresh: () => void;
  onSelect: (itemId: string) => void;
};

function TreeRow({ item, depth, searchVisible, refresh, onSelect }: TreeRowProps) {
  const labels = t().tree;
  const editing = state.editingTreeId === item.id;
  const expanded =
    item.kind === "folder" && folderExpandedForSearch(item, searchVisible, state.items);

  const handleActivate = () => {
    if (item.kind === "folder") {
      item.expanded = !item.expanded;
      scheduleSave();
      refresh();
      return;
    }
    openRequestTab(item.id, refresh);
  };

  const selectRow = () => {
    if (
      item.kind === "request" &&
      state.settings.clickToSelect &&
      state.openTabs.includes(item.id)
    ) {
      setState(prev => ({ ...prev, activeTabId: item.id, selectedTreeId: item.id }));
      refresh();
      return;
    }
    onSelect(item.id);
  };

  const commitRename = (value: string) => {
    item.title = value.trim() || item.title;
    setState(prev => ({ ...prev, editingTreeId: null }));
    scheduleSave();
    refresh();
  };

  const cancelRename = () => {
    setState(prev => ({ ...prev, editingTreeId: null }));
    refresh();
  };

  return (
    <>
      <div
        className={treeRowClassName(item, editing)}
        tabIndex={0}
        data-tree-id={item.id}
        data-kind={item.kind}
        style={{ "--depth": depth } as CSSProperties}
        onDoubleClick={(event) => {
          if ((event.target as HTMLElement).closest("[data-tree-action], .tree-rename-input")) return;
          handleActivate();
        }}
        onKeyDown={(event) => {
          if ((event.target as HTMLElement).closest(".tree-rename-input")) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if ((event.target as HTMLElement).closest("[data-tree-action]")) return;
            handleActivate();
          } else if (event.key === "F2") {
            event.preventDefault();
            setState(prev => ({ ...prev, editingTreeId: item.id, selectedTreeId: item.id }));
            refresh();
          } else if ((event.key === "Delete" || event.key === "Backspace") && !event.ctrlKey && !event.metaKey) {
            event.preventDefault();
            void deleteTreeItem(item.id, refresh);
          }
        }}
      >
        <span
          className="tree-chevron"
          onClick={selectRow}
          onMouseDown={stopRowActionPointer}
        >
          {item.kind === "folder" ? (expanded ? "v" : ">") : ""}
        </span>
        {item.kind === "folder" ? (
          <span className="tree-item-icon folder-icon" onClick={selectRow} onMouseDown={stopRowActionPointer} />
        ) : item.kind === "request" && !editing ? (
          <span
            className="tree-method"
            onClick={selectRow}
            onMouseDown={stopRowActionPointer}
            {...(isHttpMethod(item.method) ? { "data-method": item.method } : {})}
          >
            {item.method}
          </span>
        ) : null}
        <div
          className="tree-main"
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("[data-tree-action], .tree-rename-input")) return;
            selectRow();
          }}
        >
          {editing ? (
            <input
              ref={(el) => { if (el) el.select(); }}
              className="tree-rename-input"
              defaultValue={item.title}
              spellCheck={false}
              aria-label={labels.rename}
              autoFocus
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitRename((event.target as HTMLInputElement).value);
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelRename();
                }
              }}
              onBlur={(event) => commitRename(event.target.value)}
            />
          ) : (
            <span
              className="tree-title"
              title={item.kind === "request" && item.description?.trim() ? item.description.trim() : undefined}
            >
              {item.title}
            </span>
          )}
        </div>
        {!editing ? (
          <span className="tree-row-actions">
            <button
              className="mini-btn tree-action-btn"
              data-tree-action="rename"
              data-tree-id={item.id}
              type="button"
              title={labels.rename}
              aria-label={labels.rename}
              onClick={(event) => {
                event.stopPropagation();
                setState(prev => ({ ...prev, editingTreeId: item.id, selectedTreeId: item.id }));
                refresh();
              }}
            >
              <Icon html={iconRename} />
            </button>
            <button
              className="mini-btn tree-action-btn"
              data-tree-action="duplicate"
              data-tree-id={item.id}
              type="button"
              title={labels.duplicate}
              aria-label={labels.duplicate}
              onClick={(event) => {
                event.stopPropagation();
                duplicateTreeItem(item.id, refresh);
              }}
            >
              <Icon html={iconDuplicate} />
            </button>
            <button
              className="mini-btn tree-action-btn danger"
              data-tree-action="delete"
              data-tree-id={item.id}
              type="button"
              title={labels.delete}
              aria-label={labels.delete}
              onClick={(event) => {
                event.stopPropagation();
                void deleteTreeItem(item.id, refresh);
              }}
            >
              <Icon html={iconRemove} />
            </button>
          </span>
        ) : null}
      </div>
      {item.kind === "folder" && item.expanded
        ? state.items
            .filter((child) => child.parentId === item.id)
            .filter((child) => !searchVisible || searchVisible.has(child.id))
            .map((child) => (
              <TreeRow
                key={child.id}
                item={child}
                depth={depth + 1}
                searchVisible={searchVisible}
                refresh={refresh}
                onSelect={onSelect}
              />
            ))
        : null}
    </>
  );
}

type Props = {
  refresh: () => void;
  panelRef?: React.RefObject<HTMLElement | null>;
};

export function CollectionTree({ refresh, panelRef }: Props) {
  useRenderGeneration();
  const treeRef = useRef<HTMLElement>(null);
  const fallbackPanelRef = useRef<HTMLElement>(null);
  useCollectionReorder({ treeRef, panelRef: panelRef ?? fallbackPanelRef });

  const searchVisible = collectionSearchVisibleIds(state.items, state.collectionSearchQuery);
  const roots = state.items.filter(
    (item) =>
      item.parentId === COLLECTION_ROOT_PARENT_ID && (!searchVisible || searchVisible.has(item.id))
  );

  const onSelect = (itemId: string) => {
    setState(prev => ({
      ...prev,
      activePanel: "request",
      selectedTreeId: itemId,
      contextMenu: null,
    }));
    refresh();
  };

  const handleTreeKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
    if ((event.target as HTMLElement).closest(".tree-rename-input")) return;
    event.preventDefault();
    const rows = Array.from(
      (event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>(".tree-row:not(.is-editing)")
    );
    if (!rows.length) return;
    const focused = document.activeElement as HTMLElement;
    const currentIndex = rows.indexOf(focused);
    let next: HTMLElement | undefined;
    if (event.key === "ArrowDown") next = rows[currentIndex + 1] ?? rows[0];
    else if (event.key === "ArrowUp") next = rows[currentIndex - 1] ?? rows[rows.length - 1];
    else if (event.key === "Home") next = rows[0];
    else if (event.key === "End") next = rows[rows.length - 1];
    next?.focus();
  };

  return (
    <section
      ref={treeRef}
      className="tree"
      tabIndex={-1}
      aria-label={t().nav.collection}
      onKeyDown={handleTreeKeyDown}
    >
      {roots.map((item) => (
        <TreeRow
          key={item.id}
          item={item}
          depth={0}
          searchVisible={searchVisible}
          refresh={refresh}
          onSelect={onSelect}
        />
      ))}
    </section>
  );
}
