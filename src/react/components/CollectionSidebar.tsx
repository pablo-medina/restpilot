import type { ReactNode } from "react";
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
  iconSearch
} from "../../lib/icons";
import { t } from "../../i18n";
import { createFolder, createRequest } from "../lib/collection-actions";
import { CollectionTree } from "./CollectionTree";
import { Icon } from "./Icon";

type Props = {
  refresh: () => void;
};

function closeActionMenu(event: { currentTarget: HTMLElement }) {
  event.currentTarget.closest("details")?.removeAttribute("open");
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
  const labels = t();

  if (activePanel !== "request") return null;

  const contextTitle = labels.nav.collection;

  const context: ReactNode = (
      <>
        <div className="sidebar-context-header">
          <h2>{contextTitle}</h2>
          <div className="sidebar-context-actions">
            <details className="sidebar-action-menu">
              <summary
                className="mini-btn tool-icon"
                role="button"
                aria-haspopup="menu"
                title={labels.nav.newRequest}
                aria-label={labels.nav.newRequest}
              >
                <Icon html={iconPlus} />
              </summary>
              <div className="sidebar-action-popover">
                <button
                  id="new-request"
                  type="button"
                  data-tauri-drag-region="false"
                  onClick={(event) => { closeActionMenu(event); createRequest(refresh); }}
                >
                  <span dangerouslySetInnerHTML={{ __html: iconRequestAdd }} />
                  <span>{labels.tree.newRequest}</span>
                </button>
                <button
                  id="new-folder"
                  type="button"
                  data-tauri-drag-region="false"
                  onClick={(event) => { closeActionMenu(event); createFolder(refresh); }}
                >
                  <span dangerouslySetInnerHTML={{ __html: iconFolderAdd }} />
                  <span>{labels.tree.newFolder}</span>
                </button>
              </div>
            </details>
            <details className="sidebar-action-menu sidebar-action-menu--end">
              <summary
                className="mini-btn tool-icon"
                role="button"
                aria-haspopup="menu"
                title={labels.collection.importCollection}
                aria-label={labels.collection.importCollection}
              >
                <Icon html={iconMoreHorizontal} />
              </summary>
              <div className="sidebar-action-popover">
                <button
                  id="import-collection"
                  type="button"
                  data-tauri-drag-region="false"
                  onClick={(event) => { closeActionMenu(event); void startImport(); }}
                >
                  <span dangerouslySetInnerHTML={{ __html: iconImport }} />
                  <span>{labels.collection.importCollection}</span>
                </button>
                <button
                  id="import-from-text"
                  type="button"
                  data-tauri-drag-region="false"
                  onClick={(event) => { closeActionMenu(event); void startImportFromText(); }}
                >
                  <span dangerouslySetInnerHTML={{ __html: iconClipboard }} />
                  <span>{labels.collection.importTextAction}</span>
                </button>
                <button
                  id="export-collection"
                  type="button"
                  data-tauri-drag-region="false"
                  onClick={(event) => { closeActionMenu(event); void exportCollection(); }}
                >
                  <span dangerouslySetInnerHTML={{ __html: iconExport }} />
                  <span>{labels.collection.exportCollection}</span>
                </button>
              </div>
            </details>
          </div>
        </div>
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
      <div className="sidebar-context">{context}</div>
    </aside>
  );
}
