import {
  iconChevronLeft,
  iconExport,
  iconFolderAdd,
  iconImport,
  iconMoon,
  iconRequestAdd,
  iconSearch,
  iconSettings,
  iconSun,
  iconVariables
} from "../icons";
import type { TranslationTree } from "../i18n";
import type { ActivePanel, ThemeMode } from "../types";

export function renderActivityBarMarkup(labels: TranslationTree, activePanel: ActivePanel, theme: ThemeMode) {
  const themeIcon = theme === "dark" ? iconSun : iconMoon;
  const themeLabel = theme === "dark" ? labels.nav.switchToLight : labels.nav.switchToDark;
  return `
    <nav class="activity-bar" aria-label="${labels.nav.activityBar}">
      <button
        class="activity-item${activePanel === "request" ? " is-active" : ""}"
        type="button"
        data-activity="request"
        title="${labels.nav.collection}"
        aria-label="${labels.nav.collection}"
        aria-current="${activePanel === "request" ? "page" : "false"}">
        <img class="activity-brand-logo" src="/favicon.svg" width="28" height="28" alt="" />
      </button>
      <button
        class="activity-item${activePanel === "variables" ? " is-active" : ""}"
        type="button"
        data-activity="variables"
        title="${labels.nav.variables}"
        aria-label="${labels.nav.variables}"
        aria-current="${activePanel === "variables" ? "page" : "false"}">
        ${iconVariables}
      </button>
      <div class="activity-bar-spacer" aria-hidden="true"></div>
      <button
        class="activity-item activity-item--theme"
        type="button"
        id="activity-theme-toggle"
        data-activity="theme"
        title="${themeLabel}"
        aria-label="${themeLabel}">
        ${themeIcon}
      </button>
      <button
        class="activity-item${activePanel === "settings" ? " is-active" : ""}"
        type="button"
        data-activity="settings"
        title="${labels.nav.settings}"
        aria-label="${labels.nav.settings}"
        aria-current="${activePanel === "settings" ? "page" : "false"}">
        ${iconSettings}
      </button>
    </nav>
  `;
}

export function renderCollectionSidebarShell(
  labels: TranslationTree,
  options: {
    activePanel: ActivePanel;
    collectionSidebarOpen: boolean;
    collectionSearchQuery: string;
    treeHtml: string;
    escapeAttribute: (value: string) => string;
  }
) {
  if (options.activePanel !== "request") return "";
  const open = options.collectionSidebarOpen;
  const toggleLabel = labels.nav.hideCollection;
  return `
    <aside
      class="collection-sidebar${open ? "" : " is-collapsed"}"
      aria-label="${labels.nav.collection}"
      aria-hidden="${open ? "false" : "true"}">
      <div class="collection-sidebar-panel">
        <div class="collection-sidebar-toolbar">
          <div class="rail-actions collection-sidebar-actions">
            <button
              type="button"
              id="toggle-collection-sidebar"
              class="mini-btn tool-icon collection-sidebar-toggle"
              title="${toggleLabel}"
              aria-label="${toggleLabel}"
              aria-expanded="${open}">
              ${iconChevronLeft}
            </button>
            <button class="mini-btn tool-icon" id="export-collection" type="button" title="${labels.collection.exportCollection}" aria-label="${labels.collection.exportCollection}">${iconExport}</button>
            <button class="mini-btn tool-icon" id="import-collection" type="button" title="${labels.collection.importCollection}" aria-label="${labels.collection.importCollection}">${iconImport}</button>
            <button class="mini-btn tool-icon" id="new-folder" type="button" title="${labels.nav.newFolder}" aria-label="${labels.nav.newFolder}">${iconFolderAdd}</button>
            <button class="mini-btn tool-icon" id="new-request" type="button" title="${labels.nav.newRequest}" aria-label="${labels.nav.newRequest}">${iconRequestAdd}</button>
          </div>
        </div>
        <label class="collection-search">
          <span class="sr-only">${labels.collection.search}</span>
          <div class="collection-search-field">
            <input
              id="collection-search"
              type="search"
              value="${options.escapeAttribute(options.collectionSearchQuery)}"
              placeholder="${labels.collection.searchPlaceholder}"
              spellcheck="false"
              autocomplete="off"
            />
            <button
              class="mini-btn collection-search-clear${options.collectionSearchQuery.trim() ? "" : " is-hidden"}"
              id="collection-search-clear"
              type="button"
              title="${labels.collection.searchClear}"
              aria-label="${labels.collection.searchClear}"
            >×</button>
            <button
              class="mini-btn collection-search-submit"
              id="collection-search-submit"
              type="button"
              title="${labels.collection.search}"
              aria-label="${labels.collection.search}"
            >${iconSearch}</button>
          </div>
        </label>
        <section class="tree" tabindex="0" aria-label="${labels.nav.collection}">${options.treeHtml}</section>
      </div>
    </aside>
  `;
}
