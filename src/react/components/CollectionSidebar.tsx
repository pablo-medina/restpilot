import type { ReactNode } from "react";
import { exportCollection } from "../../app/collection-io";
import { scheduleSave } from "../../app/persistence";
import { setState } from "../../app/state";
import { startImport } from "../../import/index";
import { useStore } from "../../store/app-store";
import {
  iconExport,
  iconFolderAdd,
  iconFunction,
  iconFunctionAdd,
  iconImport,
  iconMoreHorizontal,
  iconPlus,
  iconRequestAdd,
  iconSearch,
  iconVariables
} from "../../lib/icons";
import { t } from "../../i18n";
import type { ActivePanel } from "../../types";
import { createFolder, createRequest } from "../lib/collection-actions";
import { createNewFunction } from "../lib/function-actions";
import { switchActivityPanel } from "../lib/sync-app-frame";
import { FunctionsTree } from "./functions/FunctionsTree";
import { CollectionTree } from "./CollectionTree";
import { VariablesSidebar } from "./variables/VariablesSidebar";
import { Icon } from "./Icon";

type Props = {
  refresh: () => void;
};

function SidebarSearch({
  id,
  clearId,
  submitId,
  label,
  placeholder,
  query,
  onQueryChange,
  onClear
}: {
  id: string;
  clearId: string;
  submitId: string;
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
        <button
          className="mini-btn collection-search-submit"
          id={submitId}
          type="button"
          title={label}
          aria-label={label}
        >
          <Icon html={iconSearch} />
        </button>
      </div>
    </label>
  );
}

function SidebarNavigation({
  activePanel,
  refresh
}: {
  activePanel: ActivePanel;
  refresh: () => void;
}) {
  const labels = t();
  const items = [
    { panel: "request" as const, label: labels.nav.requests, icon: iconRequestAdd },
    { panel: "functions" as const, label: labels.nav.functions, icon: iconFunction },
    { panel: "variables" as const, label: labels.nav.variables, icon: iconVariables }
  ];

  return (
    <nav className="sidebar-navigation" aria-label={labels.nav.activityBar}>
      {items.map(({ panel, label, icon }) => (
        <button
          key={panel}
          className={`sidebar-navigation-item${activePanel === panel ? " is-active" : ""}`}
          type="button"
          data-activity={panel}
          data-tauri-drag-region="false"
          title={label}
          aria-label={label}
          aria-current={activePanel === panel ? "page" : "false"}
          onClick={() => switchActivityPanel(panel, refresh)}
        >
          <Icon html={icon} />
        </button>
      ))}
    </nav>
  );
}

export function CollectionSidebar({ refresh }: Props) {
  const activePanel = useStore(s => s.activePanel);
  const collectionSearchQuery = useStore(s => s.collectionSearchQuery);
  const functionSearchQuery = useStore(s => s.functionSearchQuery);
  const sidebarVisible = useStore(s => s.sidebarVisible);
  const labels = t();

  if (!(["request", "functions", "variables"] as ActivePanel[]).includes(activePanel)) {
    return null;
  }

  const contextTitle =
    activePanel === "request"
      ? labels.nav.collection
      : activePanel === "functions"
        ? labels.nav.functions
        : labels.nav.variables;

  let context: ReactNode;
  if (activePanel === "request") {
    context = (
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
                  onClick={() => createRequest(refresh)}
                >
                  <span dangerouslySetInnerHTML={{ __html: iconRequestAdd }} />
                  <span>{labels.tree.newRequest}</span>
                </button>
                <button
                  id="new-folder"
                  type="button"
                  data-tauri-drag-region="false"
                  onClick={() => createFolder(refresh)}
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
                  onClick={() => void startImport()}
                >
                  <span dangerouslySetInnerHTML={{ __html: iconImport }} />
                  <span>{labels.collection.importCollection}</span>
                </button>
                <button
                  id="export-collection"
                  type="button"
                  data-tauri-drag-region="false"
                  onClick={() => void exportCollection()}
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
          submitId="collection-search-submit"
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
  } else if (activePanel === "functions") {
    context = (
      <>
        <div className="sidebar-context-header">
          <h2>{contextTitle}</h2>
          <button
            className="mini-btn tool-icon"
            id="new-function"
            type="button"
            data-tauri-drag-region="false"
            title={labels.nav.newFunction}
            aria-label={labels.nav.newFunction}
            onClick={() => createNewFunction(refresh)}
          >
            <Icon html={iconFunctionAdd} />
          </button>
        </div>
        <SidebarSearch
          id="function-search"
          clearId="function-search-clear"
          submitId="function-search-submit"
          label={labels.functions.search}
          placeholder={labels.functions.searchPlaceholder}
          query={functionSearchQuery}
          onQueryChange={(value) => {
            setState(prev => ({ ...prev, functionSearchQuery: value }));
            refresh();
          }}
          onClear={() => {
            setState(prev => ({ ...prev, functionSearchQuery: "" }));
            refresh();
          }}
        />
        <FunctionsTree refresh={refresh} />
      </>
    );
  } else {
    context = <VariablesSidebar refresh={refresh} onVariablesChanged={refresh} />;
  }

  return (
    <aside className="app-sidebar collection-sidebar" aria-label={contextTitle} aria-hidden={!sidebarVisible}>
      <div className="sidebar-header">
        <SidebarNavigation activePanel={activePanel} refresh={refresh} />
      </div>
      <div className="sidebar-context">{context}</div>
    </aside>
  );
}
