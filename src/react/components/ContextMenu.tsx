import { createPortal } from "react-dom";
import { createContext, useContext, useLayoutEffect, useRef, useState } from "react";
import { computeMenuPosition, computeSubmenuOffset, type MenuAlign } from "../../components/popover-position";
import { runTextMenuAction, copyResponseBodySelection } from "../../app/context-menu";
import { openDescribePopover } from "../../app/describe-popover";
import { menuShortcuts } from "../../app/menu-shortcuts";
import { scheduleSave } from "../../app/persistence";
import { getItem, getRequest, state } from "../../app/state";
import { copyRequestAsCurl, parentIdForTreeCreate } from "../../app";
import { COLLECTION_ROOT_PARENT_ID } from "../../app/collection-parent";
import { t } from "../../i18n";
import { copyResponseBody, copyResponseHeaders, copyResponseStatus } from "../../ui/response-panel";
import { useRenderGeneration } from "../hooks/useRenderGeneration";
import { createFolder, createRequest } from "../lib/collection-actions";
import { deleteTreeItem, duplicateTreeItem, startTreeRename } from "../lib/collection-tree-actions";
import {
  exportFolderAsHtml,
  exportFolderAsPostman,
  exportFolderAsRestpilot
} from "../../export/folder-export";
import { clearTabResponse, closeAllTabs, closeOtherTabs, closeRequestTab, openRequestTab } from "../lib/tab-actions";
import { bumpRenderGeneration } from "../render-bridge";

function refresh() {
  bumpRenderGeneration();
}

/**
 * Where `MenuSurface` placed the menu, shared with nested submenus.
 *
 * A submenu needs its parent item's viewport rect, but reading that with getBoundingClientRect
 * right after the menu moved can return the previous position. The surface already knows its
 * exact target, so submenus derive from it plus layout-stable offsets instead of re-measuring.
 * A ref (not a value) so children read the latest position even though child effects run first.
 */
const MenuOriginContext = createContext<React.RefObject<{ left: number; top: number } | null> | null>(null);


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

type MenuSubmenuProps = {
  label: string;
  children: React.ReactNode;
};

function MenuSubmenu({ label, children }: MenuSubmenuProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // The panel defaults to the right of its parent item. Flip it to the left and slide it up
  // when that would push it past the window edge.
  //
  const originRef = useContext(MenuOriginContext);

  useLayoutEffect(() => {
    const el = panelRef.current;
    const item = el?.parentElement;
    if (!el || !item) return;

    const menu = item.offsetParent as HTMLElement | null;
    const origin = originRef?.current;
    // offsetLeft/offsetTop are relative to the menu box, so they stay valid wherever it sits.
    const itemRect =
      origin && menu
        ? {
            left: origin.left + item.offsetLeft,
            right: origin.left + item.offsetLeft + item.offsetWidth,
            top: origin.top + item.offsetTop - menu.scrollTop
          }
        : item.getBoundingClientRect();

    const offset = computeSubmenuOffset(itemRect, {
      width: el.offsetWidth,
      height: el.offsetHeight
    });

    el.style.left = `${Math.round(offset.left)}px`;
    el.style.top = `${Math.round(offset.top)}px`;
  });

  return (
    <div
      className="context-menu-submenu"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button type="button" className="context-menu-submenu-trigger">
        <span className="context-menu-label">{label}</span>
        <span className="context-menu-submenu-arrow" aria-hidden="true">▸</span>
      </button>
      {open && (
        <div ref={panelRef} className="context-menu context-menu-submenu-panel" data-react-portal="true">
          {children}
        </div>
      )}
    </div>
  );
}

type MenuSurfaceProps = {
  x: number;
  y: number;
  align: MenuAlign;
  children: React.ReactNode;
};

/**
 * Measures the menu, then places it so it always stays fully inside the window — flipping up
 * near the bottom edge and left near the right edge, and scrolling if it is taller than the
 * viewport. Rendering happens off-screen-hidden first so the measurement never flashes.
 */
function MenuSurface({ x, y, align, children }: MenuSurfaceProps) {
  const ref = useRef<HTMLDivElement>(null);
  const originRef = useRef<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.style.visibility = "hidden";
    el.style.left = "0px";
    el.style.top = "0px";
    el.style.maxHeight = "";
    el.style.overflowY = "";

    const position = computeMenuPosition(
      { x, y },
      { width: el.offsetWidth, height: el.offsetHeight },
      undefined,
      align
    );

    if (position.maxHeight !== null) {
      el.style.maxHeight = `${position.maxHeight}px`;
      // Only scroll when clamped — a permanent overflow would clip open submenus.
      el.style.overflowY = "auto";
    }
    const left = Math.round(position.left);
    const top = Math.round(position.top);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.visibility = "";
    originRef.current = { left, top };
  });

  return (
    <MenuOriginContext.Provider value={originRef}>
      <div ref={ref} className="context-menu" data-react-portal="true">
        {children}
      </div>
    </MenuOriginContext.Provider>
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
            <MenuButton label={rl.copyHeaders} onClick={withClose(() => void copyResponseHeaders(request, tab))} />
            <MenuButton label={rl.copyStatus} onClick={withClose(() => void copyResponseStatus(request, tab))} />
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
            {item.kind === "folder" && (
              <MenuSubmenu label={tl.exportAs}>
                <MenuButton
                  label={tl.exportFolderRestpilot}
                  onClick={withClose(() => void exportFolderAsRestpilot(itemId!))}
                />
                <MenuButton
                  label={tl.exportFolderPostman}
                  onClick={withClose(() => void exportFolderAsPostman(itemId!))}
                />
                <MenuButton
                  label={tl.exportFolderHtml}
                  onClick={withClose(() => void exportFolderAsHtml(itemId!))}
                />
              </MenuSubmenu>
            )}
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

  // Remount per menu opening: otherwise React reuses the instance and a submenu left open by the
  // previous menu stays expanded, positioned against where that menu used to be.
  const menuKey = `${menu.kind}:${menu.x}:${menu.y}`;

  return createPortal(
    <MenuSurface key={menuKey} x={menu.x} y={menu.y} align={anchorEnd ? "end" : "start"}>
      {content}
    </MenuSurface>,
    document.body
  );
}
