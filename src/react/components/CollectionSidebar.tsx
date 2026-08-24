import { useEffect, useRef, useState, type ReactNode } from "react";
import { exportCollection } from "../../app/collection-io";
import { scheduleSave } from "../../app/persistence";
import { setState } from "../../app/state";
import { startImport, startImportFromText } from "../../import/index";
import { useStore } from "../../store/app-store";
import {
  iconClipboard,
  iconExport,
  iconFolderAdd,
  iconImport,
  iconMoreHorizontal,
  iconPlus,
  iconRequestAdd,
  iconSearch,
  iconSidebar
} from "../../lib/icons";
import { t } from "../../i18n";
import { createFolder, createRequest } from "../lib/collection-actions";
import { toggleSidebar } from "../lib/sync-app-frame";
import { CollectionTree } from "./CollectionTree";
import { Icon } from "./Icon";

type Props = {
  refresh: () => void;
};

type RailMenuItem = { id: string; icon: string; label: string; run: () => void };

/** Dropdown for the sidebar rail. `<details>` was the previous host and gave none of what a
 * menu is expected to do: outside clicks left it open, two could be open at once, and Escape
 * did nothing. Openness lives in the parent, so opening one closes the other by construction. */
function RailMenu({
  menuId,
  icon,
  label,
  items,
  openMenu,
  setOpenMenu
}: {
  menuId: string;
  icon: string;
  label: string;
  items: RailMenuItem[];
  openMenu: string | null;
  setOpenMenu: (menu: string | null) => void;
}) {
  const open = openMenu === menuId;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = (refocus = true) => {
    setOpenMenu(null);
    if (refocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    // Capture phase, so the menu is gone before the click lands on whatever is underneath.
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      close();
    };
    const onBlur = () => setOpenMenu(null);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("blur", onBlur);
    };
  }, [open, setOpenMenu]);

  const moveFocus = (step: number) => {
    const buttons = [...(rootRef.current?.querySelectorAll<HTMLButtonElement>(".sidebar-action-popover button") ?? [])];
    if (!buttons.length) return;
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = current < 0 ? (step > 0 ? 0 : buttons.length - 1) : (current + step + buttons.length) % buttons.length;
    buttons[next].focus();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpenMenu(menuId);
        return;
      }
      moveFocus(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Tab" && open) {
      setOpenMenu(null);
    }
  };

  // Opening with the keyboard should land on the first item; opening with the mouse should not
  // steal focus from wherever the pointer goes next.
  const openWithFocus = open && document.activeElement === triggerRef.current;
  useEffect(() => {
    if (!openWithFocus) return;
    rootRef.current?.querySelector<HTMLButtonElement>(".sidebar-action-popover button")?.focus();
  }, [openWithFocus]);

  return (
    <div ref={rootRef} className="sidebar-action-menu" onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        className={`mini-btn tool-icon${open ? " is-open" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        aria-label={label}
        onClick={() => setOpenMenu(open ? null : menuId)}
      >
        <Icon html={icon} />
      </button>
      {open && (
        <div className="sidebar-action-popover" role="menu" aria-label={label}>
          {items.map((item) => (
            <button
              key={item.id}
              id={item.id}
              type="button"
              role="menuitem"
              data-tauri-drag-region="false"
              onClick={() => { close(false); item.run(); }}
            >
              <span dangerouslySetInnerHTML={{ __html: item.icon }} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SidebarSearch({
  id,
  clearId,
  label,
  placeholder,
  query,
  onQueryChange,
  onClear
}: {
  id: string;
  clearId: string;
  label: string;
  placeholder: string;
  query: string;
  onQueryChange: (value: string) => void;
  onClear: () => void;
}) {
  return (
    <label className="collection-search">
      <span className="sr-only">{label}</span>
      <div className="collection-search-field">
        <input
          id={id}
          type="search"
          value={query}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => onQueryChange(event.target.value)}
        />
        <button
          className={`mini-btn collection-search-clear${query.trim() ? "" : " is-hidden"}`}
          id={clearId}
          type="button"
          title={label}
          aria-label={label}
          onClick={onClear}
        >
          ×
        </button>
        <span className="collection-search-icon" aria-hidden="true">
          <Icon html={iconSearch} />
        </span>
      </div>
    </label>
  );
}

export function CollectionSidebar({ refresh }: Props) {
  const activePanel = useStore(s => s.activePanel);
  const collectionSearchQuery = useStore(s => s.collectionSearchQuery);
  const sidebarVisible = useStore(s => s.sidebarVisible);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const labels = t();

  if (activePanel !== "request") return null;

  const contextTitle = labels.nav.collection;

  /* Toolbar that fills the band the title bar leaves free above the sidebar. It owns the
     sidebar toggle while the sidebar is open; `TitleBar` takes it back once it is hidden. */
  const rail: ReactNode = (
    <div className="sidebar-rail">
      <button
        type="button"
        className="mini-btn sidebar-rail-toggle"
        data-title-bar-sidebar
        title={labels.nav.hideSidebar}
        aria-label={labels.nav.hideSidebar}
        aria-pressed={true}
        onClick={() => toggleSidebar(refresh)}
      >
        <Icon html={iconSidebar} />
      </button>
      <div className="sidebar-rail-drag" data-tauri-drag-region aria-hidden="true" />
      <div className="sidebar-rail-actions">
        <RailMenu
          menuId="new"
          icon={iconPlus}
          label={labels.nav.newRequest}
          openMenu={openMenu}
          setOpenMenu={setOpenMenu}
          items={[
            { id: "new-request", icon: iconRequestAdd, label: labels.tree.newRequest, run: () => createRequest(refresh) },
            { id: "new-folder", icon: iconFolderAdd, label: labels.tree.newFolder, run: () => createFolder(refresh) }
          ]}
        />
        <RailMenu
          menuId="more"
          icon={iconMoreHorizontal}
          label={labels.collection.importCollection}
          openMenu={openMenu}
          setOpenMenu={setOpenMenu}
          items={[
            { id: "import-collection", icon: iconImport, label: labels.collection.importCollection, run: () => void startImport() },
            { id: "import-from-text", icon: iconClipboard, label: labels.collection.importTextAction, run: () => void startImportFromText() },
            { id: "export-collection", icon: iconExport, label: labels.collection.exportCollection, run: () => void exportCollection() }
          ]}
        />
      </div>
    </div>
  );

  const context: ReactNode = (
      <>
        <SidebarSearch
          id="collection-search"
          clearId="collection-search-clear"
          label={labels.collection.search}
          placeholder={labels.collection.searchPlaceholder}
          query={collectionSearchQuery}
          onQueryChange={(value) => {
            setState(prev => ({ ...prev, collectionSearchQuery: value }));
            scheduleSave();
            refresh();
          }}
          onClear={() => {
            setState(prev => ({ ...prev, collectionSearchQuery: "" }));
            scheduleSave();
            refresh();
          }}
        />
        <CollectionTree refresh={refresh} />
      </>
  );

  return (
    <aside className="app-sidebar collection-sidebar" aria-label={contextTitle} aria-hidden={!sidebarVisible}>
      {rail}
      <div className="sidebar-context">{context}</div>
    </aside>
  );
}
