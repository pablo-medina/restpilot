import { createPortal } from "react-dom";
import { runTextMenuAction, copyResponseBodySelection } from "../../app/context-menu";
import { openDescribePopover } from "../../app/describe-popover";
import { menuShortcuts } from "../../app/menu-shortcuts";
import { scheduleSave } from "../../app/persistence";
import { runSidebarFunctionAction } from "../../app/sidebar-function-action";
import { getItem, getRequest, state } from "../../app/state";
import { copyRequestAsCurl, parentIdForTreeCreate } from "../../app";
import { COLLECTION_ROOT_PARENT_ID } from "../../app/collection-parent";
import { t } from "../../i18n";
import { copyResponseBody, copyResponseHeaders, copyResponseStatus } from "../../ui/response-panel";
import { useRenderGeneration } from "../hooks/useRenderGeneration";
import { createFolder, createRequest } from "../lib/collection-actions";
import { deleteTreeItem, duplicateTreeItem, startTreeRename } from "../lib/collection-tree-actions";
import { deleteFunction, createNewFunction, selectFunctionInSidebar, startFuncRename } from "../lib/function-actions";
import { clearTabResponse, closeAllTabs, closeOtherTabs, closeRequestTab, openRequestTab } from "../lib/tab-actions";
import { bumpRenderGeneration } from "../render-bridge";

function refresh() {
  bumpRenderGeneration();
}

type MenuButtonProps = {
  label: string;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  checked?: boolean;
  onClick: () => void;
};

function MenuButton({ label, shortcut, danger, disabled, checked, onClick }: MenuButtonProps) {
  return (
    <button
      type="button"
      className={danger ? "danger" : undefined}
      disabled={disabled}
      onClick={onClick}
    >
      {checked !== undefined && (
        <span className="context-menu-check" aria-hidden="true">{checked ? "✓" : ""}</span>
      )}
      <span className="context-menu-label">{label}</span>
      {shortcut && <span className="context-menu-shortcut">{shortcut}</span>}
    </button>
  );
}

function closeMenu() {
  state.contextMenu = null;
  bumpRenderGeneration();
}

function withClose(fn: () => void) {
  return () => {
    closeMenu();
    fn();
  };
}

export function ContextMenu() {
  useRenderGeneration();
  const menu = state.contextMenu;
  if (!menu) return null;

  const labels = t();

  let content: React.ReactNode;

  if (menu.kind === "text") {
    const tl = labels.contextMenu;
    content = (
      <>
        <MenuButton label={tl.cut} shortcut={menuShortcuts.cut()} disabled={!menu.canCut} onClick={withClose(() => void runTextMenuAction("text-cut"))} />
        <MenuButton label={tl.copy} shortcut={menuShortcuts.copy()} disabled={!menu.canCopy} onClick={withClose(() => void runTextMenuAction("text-copy"))} />
        {menu.canCopySelection && (
          <MenuButton label={tl.copySelection} shortcut={menuShortcuts.copy()} onClick={withClose(() => void runTextMenuAction("text-copy-selection"))} />
        )}
        <MenuButton label={tl.paste} shortcut={menuShortcuts.paste()} disabled={!menu.canPaste} onClick={withClose(() => void runTextMenuAction("text-paste"))} />
        {menu.canUndo !== undefined && (
          <>
            <hr />
            <MenuButton label={tl.undo} shortcut={menuShortcuts.undo()} disabled={!menu.canUndo} onClick={withClose(() => void runTextMenuAction("text-undo"))} />
            <MenuButton label={tl.redo} shortcut={menuShortcuts.redo()} disabled={!(menu.canRedo ?? false)} onClick={withClose(() => void runTextMenuAction("text-redo"))} />
          </>
        )}
        <hr />
        <MenuButton label={tl.selectAll} shortcut={menuShortcuts.selectAll()} disabled={!menu.canSelectAll} onClick={withClose(() => void runTextMenuAction("text-select-all"))} />
      </>
    );
  } else if (menu.kind === "functions-tree") {
    const tl = labels.tree;
    const navLabels = labels.nav;
    const funcId = menu.functionId;
    const func = funcId ? state.functions.find((f) => f.id === funcId) : null;
    content = (
      <>
        <MenuButton label={navLabels.newFunction} onClick={withClose(() => createNewFunction(refresh))} />
        {func && (
          <>
            <hr />
            <MenuButton label={tl.run} onClick={withClose(() => void runSidebarFunctionAction(func.id, refresh))} />
            <MenuButton label={tl.rename} shortcut={menuShortcuts.rename()} onClick={withClose(() => startFuncRename(func.id, refresh))} />
            <MenuButton label={tl.describe} onClick={withClose(() => {
              selectFunctionInSidebar(func.id, refresh);
              requestAnimationFrame(() => {
                const row = document.querySelector<HTMLElement>(`[data-function-id="${func.id}"]`);
                if (row) openDescribePopover({ kind: "function", id: func.id }, row);
              });
            })} />
            <MenuButton label={tl.delete} shortcut={menuShortcuts.delete()} danger onClick={withClose(() => void deleteFunction(func.id, refresh))} />
          </>
        )}
      </>
    );
  } else if (menu.kind === "request-tab") {
    const requestId = menu.requestId;
    content = (
      <>
        <MenuButton label={labels.contextMenu.closeTab} shortcut={menuShortcuts.closeTab()} onClick={withClose(() => closeRequestTab(requestId, refresh))} />
        {state.openTabs.length > 1 && (
          <MenuButton label={labels.contextMenu.closeOtherTabs} onClick={withClose(() => closeOtherTabs(requestId, refresh))} />
        )}
        <MenuButton label={labels.contextMenu.closeAllTabs} onClick={withClose(() => closeAllTabs(refresh))} />
        <hr />
        <MenuButton label={labels.request.duplicate} onClick={withClose(() => duplicateTreeItem(requestId, refresh))} />
        <MenuButton label={labels.tree.describe} onClick={withClose(() => {
          requestAnimationFrame(() => {
            const anchor =
              document.querySelector<HTMLElement>(`[data-open-tab="${requestId}"]`) ??
              document.querySelector<HTMLElement>("[data-request-actions-trigger]");
            if (anchor) openDescribePopover({ kind: "request", id: requestId }, anchor);
          });
        })} />
      </>
    );
  } else if (menu.kind === "response-copy") {
    const request = getRequest(menu.requestId);
    const tab = state.tabs[menu.requestId];
    const tl = labels.contextMenu;
    const rl = labels.request;
    content = (
      <>
        {menu.canCopySelection && (
          <MenuButton label={tl.copySelection} shortcut={menuShortcuts.copy()} onClick={withClose(() => void copyResponseBodySelection())} />
        )}
        {request && tab && (
          <>
            <MenuButton label={rl.copyBody} onClick={withClose(() => void copyResponseBody(request, tab))} />
            <MenuButton label={rl.copyHeaders} onClick={withClose(() => void copyResponseHeaders(tab))} />
            <MenuButton label={rl.copyStatus} onClick={withClose(() => void copyResponseStatus(tab))} />
          </>
        )}
      </>
    );
  } else if (menu.kind === "request-actions") {
    const requestId = menu.requestId;
    const request = getRequest(requestId);
    const tab = state.tabs[requestId];
    const rl = labels.request;
    const tl = labels.tree;
    content = (
      <>
        <MenuButton label={rl.duplicate} onClick={withClose(() => duplicateTreeItem(requestId, refresh))} />
        <MenuButton label={tl.describe} onClick={withClose(() => {
          requestAnimationFrame(() => {
            const anchor = document.querySelector<HTMLElement>("[data-request-actions-trigger]");
            if (anchor) openDescribePopover({ kind: "request", id: requestId }, anchor);
          });
        })} />
        <MenuButton label={rl.clear} onClick={withClose(() => {
          if (request && tab) clearTabResponse(requestId, refresh);
        })} />
        <hr />
        <MenuButton
          label={rl.streamResponse}
          checked={request?.streamResponse ?? false}
          onClick={withClose(() => {
            if (request) {
              request.streamResponse = !request.streamResponse;
              scheduleSave();
              refresh();
            }
          })}
        />
      </>
    );
  } else {
    // kind === "tree"
    const tl = labels.tree;
    const itemId = menu.itemId;
    const item = itemId ? getItem(itemId) : null;
    const parentId = parentIdForTreeCreate(itemId) ?? COLLECTION_ROOT_PARENT_ID;
    content = (
      <>
        <MenuButton label={tl.newRequest} onClick={withClose(() => createRequest(refresh, parentId))} />
        <MenuButton label={tl.newFolder} onClick={withClose(() => createFolder(refresh, parentId))} />
        {item && (
          <>
            <hr />
            <MenuButton label={tl.rename} shortcut={menuShortcuts.rename()} onClick={withClose(() => startTreeRename(itemId!, refresh))} />
            {item.kind === "request" && (
              <MenuButton label={tl.show} onClick={withClose(() => openRequestTab(itemId!, refresh))} />
            )}
            {item.kind === "request" && (
              <MenuButton label={tl.describe} onClick={withClose(() => {
                requestAnimationFrame(() => {
                  const row = document.querySelector<HTMLElement>(`[data-tree-id="${itemId}"]`);
                  if (row) openDescribePopover({ kind: "request", id: itemId! }, row);
                });
              })} />
            )}
            <MenuButton label={tl.duplicate} onClick={withClose(() => duplicateTreeItem(itemId!, refresh))} />
            {item.kind === "request" && (
              <MenuButton label={tl.copyCurl} onClick={withClose(() => void copyRequestAsCurl(itemId!))} />
            )}
            <MenuButton label={tl.delete} shortcut={menuShortcuts.delete()} danger onClick={withClose(() => void deleteTreeItem(itemId!, refresh))} />
          </>
        )}
      </>
    );
  }

  const anchorEnd = menu.kind === "response-copy" || menu.kind === "request-actions";

  return createPortal(
    <div
      className={`context-menu${anchorEnd ? " context-menu--anchor-end" : ""}`}
      style={{ left: menu.x, top: menu.y }}
    >
      {content}
    </div>,
    document.body
  );
}
