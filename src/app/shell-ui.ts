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
} from "../icons";

import type { TranslationTree } from "../i18n";
import type { ActivePanel } from "../types";

function renderSidebarNavigation(labels: TranslationTree, activePanel: ActivePanel) {
  const items = [
    { panel: "request", label: labels.nav.requests, icon: iconRequestAdd },
    { panel: "functions", label: labels.nav.functions, icon: iconFunction },
    { panel: "variables", label: labels.nav.variables, icon: iconVariables }
  ] as const;

  return `
    <nav class="sidebar-navigation" aria-label="${labels.nav.activityBar}">
      ${items.map(({ panel, label, icon }) => `
        <button
          class="sidebar-navigation-item${activePanel === panel ? " is-active" : ""}"
          type="button"
          data-activity="${panel}"
          title="${label}"
          aria-label="${label}"
          aria-current="${activePanel === panel ? "page" : "false"}">
          ${icon}
        </button>
      `).join("")}
    </nav>
  `;
}

function renderSearch(options: {
  id: string;
  clearId: string;
  submitId: string;
  label: string;
  placeholder: string;
  query: string;
  escapeAttribute: (value: string) => string;
}) {
  return `
    <label class="collection-search">
      <span class="sr-only">${options.label}</span>
      <div class="collection-search-field">
        <input id="${options.id}" type="search" value="${options.escapeAttribute(options.query)}"
          placeholder="${options.placeholder}" spellcheck="false" autocomplete="off" />
        <button class="mini-btn collection-search-clear${options.query.trim() ? "" : " is-hidden"}"
          id="${options.clearId}" type="button" title="${options.label}" aria-label="${options.label}">×</button>
        <button class="mini-btn collection-search-submit" id="${options.submitId}" type="button"
          title="${options.label}" aria-label="${options.label}">${iconSearch}</button>
      </div>
    </label>
  `;
}

export function renderAppSidebarShell(
  labels: TranslationTree,
  options: {
    activePanel: ActivePanel;
    collectionSearchQuery: string;
    functionSearchQuery: string;
    treeHtml: string;
    functionsHtml: string;
    variablesHtml: string;
    escapeAttribute: (value: string) => string;
  }
) {
  if (!(["request", "functions", "variables"] as ActivePanel[]).includes(options.activePanel)) return "";

  const contextTitle = options.activePanel === "request"
    ? labels.nav.collection
    : options.activePanel === "functions"
      ? labels.nav.functions
      : labels.nav.variables;

  let context = options.variablesHtml;
  if (options.activePanel === "request") {
    context = `
      <div class="sidebar-context-header">
        <h2>${contextTitle}</h2>
        <div class="sidebar-context-actions">
          <details class="sidebar-action-menu">
            <summary class="mini-btn tool-icon" role="button" aria-haspopup="menu" title="${labels.nav.newRequest}" aria-label="${labels.nav.newRequest}">${iconPlus}</summary>
            <div class="sidebar-action-popover">
              <button id="new-request" type="button">${iconRequestAdd}<span>${labels.tree.newRequest}</span></button>
              <button id="new-folder" type="button">${iconFolderAdd}<span>${labels.tree.newFolder}</span></button>
            </div>
          </details>
          <details class="sidebar-action-menu sidebar-action-menu--end">
            <summary class="mini-btn tool-icon" role="button" aria-haspopup="menu" title="${labels.collection.importCollection}" aria-label="${labels.collection.importCollection}">${iconMoreHorizontal}</summary>
            <div class="sidebar-action-popover">
              <button id="import-collection" type="button">${iconImport}<span>${labels.collection.importCollection}</span></button>
              <button id="export-collection" type="button">${iconExport}<span>${labels.collection.exportCollection}</span></button>
            </div>
          </details>
        </div>
      </div>
      ${renderSearch({ id: "collection-search", clearId: "collection-search-clear", submitId: "collection-search-submit", label: labels.collection.search, placeholder: labels.collection.searchPlaceholder, query: options.collectionSearchQuery, escapeAttribute: options.escapeAttribute })}
      <section class="tree" tabindex="0" aria-label="${labels.nav.collection}">${options.treeHtml}</section>
    `;
  } else if (options.activePanel === "functions") {
    context = `
      <div class="sidebar-context-header">
        <h2>${contextTitle}</h2>
        <button class="mini-btn tool-icon" id="new-function" type="button" title="${labels.nav.newFunction}" aria-label="${labels.nav.newFunction}">${iconFunctionAdd}</button>
      </div>
      ${renderSearch({ id: "function-search", clearId: "function-search-clear", submitId: "function-search-submit", label: labels.functions.search, placeholder: labels.functions.searchPlaceholder, query: options.functionSearchQuery, escapeAttribute: options.escapeAttribute })}
      <section class="tree" tabindex="0" aria-label="${labels.nav.functions}">${options.functionsHtml}</section>
    `;
  }

  return `
    <aside class="app-sidebar collection-sidebar"
      aria-label="${contextTitle}" aria-hidden="false">
      ${renderSidebarNavigation(labels, options.activePanel)}
      <div class="sidebar-context">${context}</div>
    </aside>
  `;
}
