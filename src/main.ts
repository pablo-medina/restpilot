import { invoke } from "@tauri-apps/api/core";
import {
  applicationDialog,
  bindDialogs,
  initDialogs,
  messageDialog,
  renderDialogLayer
} from "./components/dialogs";
import { applyCurlToRequest, looksLikeCurl, parseCurl } from "./curl";
import { iconDuplicate, iconFolderAdd, iconRemove, iconRename, iconRequestAdd } from "./icons";
import { brandLogo } from "./logo";
import { getLocale, setLocale, t } from "./i18n";
import { bindSettings, renderSettings } from "./settings";
import "./styles.css";
import {
  defaultConfig,
  defaultSettings,
  type ActivePanel,
  type ApiResponse,
  type AppConfig,
  type BodyMode,
  type Pair,
  type RawType,
  type ResponseTab,
  type SavedRequest,
  type TabState,
  type TreeItem,
  type UserSettings,
  type Variable
} from "./types";

const methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
const root = document.querySelector<HTMLDivElement>("#app");
let saveTimer: number | undefined;
let draggedTreeId: string | null = null;

if (!root) throw new Error("App root was not found.");
const appRoot = root;

type AppState = AppConfig & {
  tabs: Record<string, TabState>;
  activePanel: ActivePanel;
  headersOpen: boolean;
  selectedTreeId: string | null;
  editingTreeId: string | null;
  autoTitleFromUrlId: string | null;
  pendingCurl: SavedRequest | null;
  contextMenu: { x: number; y: number; itemId: string | null } | null;
  previousPanel: ActivePanel;
};

const state: AppState = {
  ...defaultConfig(),
  tabs: {},
  activePanel: "request",
  headersOpen: false,
  selectedTreeId: null,
  editingTreeId: null,
  autoTitleFromUrlId: null,
  pendingCurl: null,
  contextMenu: null,
  previousPanel: "request"
};

initDialogs(render);
boot();

async function boot() {
  try {
    const stored = await invoke<AppConfig | null>("load_app_config");
    if (stored) {
      const migrated = stored.items?.length && isSeedConfig(stored) ? defaultConfig() : normalizeConfig(stored);
      Object.assign(state, {
        items: migrated.items,
        variables: migrated.variables ?? [],
        openTabs: (migrated.openTabs ?? []).filter((id) => Boolean(getRequestFrom(migrated.items, id))),
        activeTabId: "",
        settings: migrated.settings
      });
      state.activeTabId = state.openTabs.includes(migrated.activeTabId) ? migrated.activeTabId : (state.openTabs[0] ?? "");
      if (migrated !== stored) scheduleSave();
    }
  } catch {
    const labels = t().messages;
    await messageDialog("warning", labels.configTitle, labels.configLoadFailed);
  }

  applyUserSettings(state.settings);
  for (const id of state.openTabs) ensureTab(id);
  render();
  requestAnimationFrame(() => focusUrlOnStartup());
}

function focusUrlOnStartup() {
  if (state.activePanel !== "request" || !getActiveRequest()) return;
  focusRequestUrl();
}

function proxyPayload(proxy: UserSettings["proxy"]) {
  if (proxy.mode === "none") return null;
  return {
    mode: proxy.mode,
    host: proxy.host.trim() || null,
    port: proxy.port || null,
    username: proxy.username.trim() || null,
    password: proxy.password || null
  };
}

function normalizeConfig(config: AppConfig): AppConfig {
  return {
    items: (config.items ?? []).map(normalizeTreeItem),
    variables: config.variables ?? [],
    openTabs: config.openTabs ?? [],
    activeTabId: config.activeTabId ?? "",
    settings: { ...defaultSettings(), ...config.settings, proxy: { ...defaultSettings().proxy, ...config.settings?.proxy } }
  };
}

function normalizeTreeItem(item: TreeItem): TreeItem {
  if (item.kind === "folder") return item;
  const request = item as SavedRequest & { rawType?: RawType };
  return {
    ...request,
    bodyMode: request.bodyMode === "form" || request.bodyMode === "node" ? request.bodyMode : "raw",
    rawType: request.rawType === "text" ? "text" : "json",
    headers: request.headers ?? [],
    form: request.form ?? []
  };
}

function isSeedConfig(config: AppConfig) {
  const hasOnlySeedItems =
    config.items.length === 2 &&
    config.items.some((item) => item.kind === "folder" && item.title === "Local") &&
    config.items.some((item) => item.kind === "request" && item.title === "Example" && item.url === "https://httpbin.org/get");
  const hasOnlySeedVariable = config.variables.length <= 1 && (config.variables[0]?.name ?? "base_url") === "base_url";
  return hasOnlySeedItems && hasOnlySeedVariable;
}

function applyUserSettings(settings: UserSettings) {
  document.documentElement.dataset.theme = settings.theme;
  setLocale(settings.language);
}

function render() {
  const request = getActiveRequest();
  const tab = request ? ensureTab(request.id) : null;
  const labels = t();

  appRoot.innerHTML = `
    <main class="shell">
      <aside class="rail">
        <div class="brand">
          ${brandLogo}
          <span class="brand-name">${labels.app.name}</span>
        </div>
        <div class="explorer-head">
          <strong>${labels.nav.collection}</strong>
          <div class="rail-actions">
            <button class="mini-btn tool-icon" id="new-folder" type="button" title="${labels.nav.newFolder}" aria-label="${labels.nav.newFolder}">${iconFolderAdd}</button>
            <button class="mini-btn tool-icon" id="new-request" type="button" title="${labels.nav.newRequest}" aria-label="${labels.nav.newRequest}">${iconRequestAdd}</button>
          </div>
        </div>
        <section class="tree" tabindex="0" aria-label="${labels.nav.collection}">${renderExplorerTree(null, 0)}</section>
        <nav class="rail-nav">
          <button class="rail-link ${state.activePanel === "variables" ? "active" : ""}" id="variables-panel" type="button">${labels.nav.variables}</button>
          <button class="rail-link ${state.activePanel === "settings" ? "active" : ""}" id="settings-panel" type="button">${labels.nav.settings}</button>
        </nav>
      </aside>
      <section class="workspace">
        ${state.activePanel === "request" ? renderTabBar(request, tab) : ""}
        ${state.activePanel === "variables" ? renderVariables() : state.activePanel === "settings" ? renderSettings(state.settings) : request && tab ? renderRequest(request, tab) : renderEmpty()}
      </section>
    </main>
    ${renderDialogLayer()}
    ${renderContextMenu()}
  `;

  bindEvents();
}

function renderContextMenu() {
  if (!state.contextMenu) return "";
  const labels = t().tree;
  const item = state.contextMenu.itemId ? getItem(state.contextMenu.itemId) : null;
  return `
    <div class="context-menu" style="left:${state.contextMenu.x}px;top:${state.contextMenu.y}px">
      <button data-menu-action="new-request" type="button">${labels.newRequest}</button>
      <button data-menu-action="new-folder" type="button">${labels.newFolder}</button>
      ${item ? `<hr><button data-menu-action="rename" type="button">${labels.rename}</button>` : ""}
      ${item?.kind === "request" ? `<button data-menu-action="duplicate" type="button">${labels.duplicate}</button>` : ""}
      ${item ? `<button data-menu-action="delete" class="danger" type="button">${labels.delete}</button>` : ""}
    </div>
  `;
}


function renderTabBar(request: SavedRequest | undefined, tab: TabState | null | undefined) {
  if (!state.openTabs.length) return "";
  const labels = t().request;
  const actions =
    request && tab
      ? `
      <div class="tab-bar-actions">
        <button class="quiet-button compact" id="duplicate-request" type="button">${labels.duplicate}</button>
        <button class="quiet-button compact" id="clear" type="button">${labels.clear}</button>
      </div>`
      : "";
  return `
    <header class="tab-bar">
      <div class="tab-strip">${state.openTabs.map(renderTab).join("")}</div>
      ${actions}
    </header>
  `;
}

function renderTab(requestId: string) {
  const request = getRequest(requestId);
  if (!request) return "";
  return `
    <div class="request-tab ${state.activeTabId === requestId ? "active" : ""}" data-open-tab="${requestId}" role="tab" aria-selected="${state.activeTabId === requestId}" tabindex="0">
      <span class="tab-label">${escapeHtml(request.title)}</span>
      <button class="mini-btn tab-close" data-close-tab="${requestId}" type="button" aria-label="${t().dialog.close}">×</button>
    </div>
  `;
}

function renderRequest(request: SavedRequest, tab: TabState) {
  const labels = t().request;
  return `
    <div class="request-editor">
    <section class="request-line">
      <select id="method">${methods.map((method) => `<option ${method === request.method ? "selected" : ""}>${method}</option>`).join("")}</select>
      <input id="url" value="${escapeAttribute(request.url)}" spellcheck="false" />
      ${
        tab.loading
          ? `<button id="cancel" class="danger-button" type="button"><span class="pulse"></span>${labels.cancel}</button>`
          : `<button id="send" type="button">${labels.send}</button>`
      }
    </section>
    <section class="editor-grid">
      <article class="request-card">
        <details class="foldable" ${state.headersOpen ? "open" : ""}>
          <summary><span>${labels.headers}</span><button class="mini-btn" id="add-header" type="button" aria-label="${t().variables.add}">+</button></summary>
          <div class="headers-list">${request.headers.map((pair) => renderPair(pair, "header")).join("")}</div>
        </details>
        <div class="body-toolbar">
          <div class="segmented">
            <button class="${request.bodyMode === "raw" ? "active" : ""}" data-body-mode="raw" type="button">${labels.raw}</button>
            <button class="${request.bodyMode === "form" ? "active" : ""}" data-body-mode="form" type="button">${labels.form}</button>
            <button class="${request.bodyMode === "node" ? "active" : ""}" data-body-mode="node" type="button">${labels.node}</button>
          </div>
          ${
            request.bodyMode === "raw"
              ? `<div class="segmented raw-type-switch">
                  <button class="${request.rawType === "text" ? "active" : ""}" data-raw-type="text" type="button">${labels.rawText}</button>
                  <button class="${request.rawType === "json" ? "active" : ""}" data-raw-type="json" type="button">${labels.rawJson}</button>
                </div>`
              : ""
          }
          <span class="hint">${bodyModeHint(request)}</span>
        </div>
        ${renderBodyEditor(request, labels)}
      </article>
      <article class="response-card">${renderResponse(tab)}</article>
    </section>
    </div>
  `;
}

function bodyModeHint(request: SavedRequest) {
  const labels = t().request;
  if (request.bodyMode === "form") return labels.formHint;
  if (request.bodyMode === "node") return labels.nodeHint;
  return request.rawType === "json" ? labels.rawJsonHint : labels.rawTextHint;
}

function renderBodyEditor(request: SavedRequest, labels: ReturnType<typeof t>["request"]) {
  if (request.bodyMode === "raw") {
    const placeholder = request.rawType === "json" ? '{"key":"value"}' : "Plain text body";
    return `<div class="code-editor ${request.rawType === "json" ? "json-mode" : "text-mode"}"><pre aria-hidden="true">${highlightBodyContent(request)}</pre><textarea id="body" spellcheck="false" placeholder="${escapeAttribute(placeholder)}">${escapeHtml(request.body)}</textarea></div>`;
  }
  const addId = request.bodyMode === "node" ? "add-node-field" : "add-form";
  return `<div class="headers-list form-list">${request.form.map((pair) => renderPair(pair, "form")).join("")}</div><button class="quiet-button add-form" id="${addId}" type="button">${labels.addField}</button>`;
}

function renderPair(pair: Pair, scope: "header" | "form") {
  const labels = t().pairs;
  return `
    <div class="pair-row" data-${scope}-id="${pair.id}">
      <input class="${scope}-enabled" type="checkbox" ${pair.enabled ? "checked" : ""} />
      <input class="${scope}-key" value="${escapeAttribute(pair.key)}" placeholder="${scope === "header" ? labels.header : "Name"}" spellcheck="false" />
      <input class="${scope}-value" value="${escapeAttribute(pair.value)}" placeholder="${labels.value}" spellcheck="false" />
      <button class="mini-btn remove-${scope}" type="button" aria-label="${t().tree.delete}">×</button>
    </div>
  `;
}

function renderResponse(tab: TabState) {
  const labels = t().request;
  if (tab.loading) {
    return `<div class="response-empty"><div class="loader"></div><h2>${labels.waitingTitle}</h2><p>${labels.waitingBody}</p></div>`;
  }
  if (tab.error) return `<div class="response-empty error"><h2>${labels.failedTitle}</h2><p>${escapeHtml(tab.error)}</p></div>`;
  if (!tab.response) return `<div class="response-empty"><h2>${labels.emptyTitle}</h2><p>${labels.emptyBody}</p></div>`;

  const response = tab.response;
  const statusClass = response.status >= 200 && response.status < 300 ? "ok" : response.status >= 400 ? "bad" : "soft";
  return `
    <div class="response-head">
      <div class="status ${statusClass}">${response.status} ${escapeHtml(response.status_text)}</div>
      <div class="metrics"><span>${response.duration_ms} ms</span><span>${formatBytes(response.body.length)}</span></div>
    </div>
    <div class="tabs">
      <button class="${tab.selectedResponseTab === "body" ? "active" : ""}" data-response-tab="body" type="button">${labels.body}</button>
      <button class="${tab.selectedResponseTab === "headers" ? "active" : ""}" data-response-tab="headers" type="button">${labels.responseHeaders}</button>
    </div>
    ${
      tab.selectedResponseTab === "body"
        ? `<pre class="response-body">${highlightResponse(response.body, response.headers)}</pre>`
        : `<div class="response-headers">${Object.entries(response.headers)
            .map(([key, value]) => `<div><strong>${escapeHtml(key)}</strong><span>${escapeHtml(value)}</span></div>`)
            .join("")}</div>`
    }
  `;
}

function renderVariables() {
  const labels = t().variables;
  return `
    <header class="topbar settings-topbar">
      <button class="settings-back compact" id="panel-back" type="button"><span aria-hidden="true">←</span> ${t().nav.backToWorkspace}</button>
      <div><h1>${labels.title}</h1><p>${labels.description}</p></div>
      <button class="quiet-button" id="add-variable" type="button">${labels.add}</button>
    </header>
    <article class="request-card variables-card">
      ${state.variables
        .map(
          (variable) => `
          <div class="variable-row" data-variable-id="${variable.id}">
            <input class="variable-enabled" type="checkbox" ${variable.enabled ? "checked" : ""} />
            <input class="variable-name" value="${escapeAttribute(variable.name)}" placeholder="${labels.namePlaceholder}" spellcheck="false" />
            <input class="variable-value" value="${escapeAttribute(variable.value)}" placeholder="${labels.valuePlaceholder}" spellcheck="false" />
            <button class="mini-btn remove-variable" type="button" aria-label="${t().tree.delete}">×</button>
          </div>`
        )
        .join("")}
    </article>
  `;
}

function renderExplorerTree(parentId: string | null, depth: number): string {
  const labels = t().tree;
  return state.items
    .filter((item) => item.parentId === parentId)
    .map((item) => {
      const active = state.selectedTreeId === item.id || state.activeTabId === item.id;
      const editing = state.editingTreeId === item.id;
      const expanded = item.kind === "folder" && item.expanded;
      const children = item.kind === "folder" && item.expanded ? renderExplorerTree(item.id, depth + 1) : "";
      return `
        <div class="tree-row ${active ? "active" : ""} ${editing ? "is-editing" : ""}" draggable="${editing ? "false" : "true"}" tabindex="0" data-tree-id="${item.id}" data-kind="${item.kind}" style="--depth:${depth}">
          <span class="tree-chevron">${item.kind === "folder" ? (expanded ? "v" : ">") : ""}</span>
          <span class="tree-item-icon ${item.kind === "folder" ? "folder-icon" : "request-icon"}"></span>
          <div class="tree-main">
            ${
              editing
                ? `<input class="tree-rename-input" value="${escapeAttribute(item.title)}" spellcheck="false" aria-label="${labels.rename}" />`
                : `<span class="tree-title">${escapeHtml(item.title)}</span>${item.kind === "request" ? `<span class="tree-method">${item.method}</span>` : ""}`
            }
          </div>
          ${
            editing
              ? ""
              : `<span class="tree-row-actions">
                  <button class="mini-btn tree-action-btn" data-tree-action="rename" data-tree-id="${item.id}" type="button" title="${labels.rename}" aria-label="${labels.rename}">${iconRename}</button>
                  ${item.kind === "request" ? `<button class="mini-btn tree-action-btn" data-tree-action="duplicate" data-tree-id="${item.id}" type="button" title="${labels.duplicate}" aria-label="${labels.duplicate}">${iconDuplicate}</button>` : ""}
                  <button class="mini-btn tree-action-btn danger" data-tree-action="delete" data-tree-id="${item.id}" type="button" title="${labels.delete}" aria-label="${labels.delete}">${iconRemove}</button>
                </span>`
          }
        </div>
        ${children}
      `;
    })
    .join("");
}

function renderEmpty() {
  return `<div class="empty-editor"><span>${t().request.noTab}</span></div>`;
}

function bindEvents() {
  const request = getActiveRequest();
  const tab = request ? ensureTab(request.id) : null;

  bindTree();
  bindDialogs();

  document.querySelector("#new-folder")?.addEventListener("click", createFolder);
  document.querySelector("#new-request")?.addEventListener("click", createRequest);
  document.querySelector("#variables-panel")?.addEventListener("click", () => openPanel("variables"));
  document.querySelector("#settings-panel")?.addEventListener("click", () => openPanel("settings"));
  document.querySelector("#panel-back")?.addEventListener("click", backToWorkspace);

  if (state.activePanel === "settings") {
    bindSettings(state.settings, onSettingsChanged, backToWorkspace, clearAllData);
    return;
  }

  document.querySelectorAll<HTMLElement>("[data-open-tab]").forEach((tab) => {
    tab.addEventListener("click", (event) => {
      const closeTarget = (event.target as HTMLElement).closest("[data-close-tab]");
      if (closeTarget) {
        event.stopPropagation();
        closeTab(closeTarget.getAttribute("data-close-tab") ?? "");
        return;
      }
      openRequest(tab.dataset.openTab ?? "");
    });
    tab.addEventListener("auxclick", (event) => {
      if (event.button !== 1) return;
      event.preventDefault();
      closeTab(tab.dataset.openTab ?? "");
    });
    tab.addEventListener("mousedown", (event) => {
      if (event.button !== 1) return;
      event.preventDefault();
      closeTab(tab.dataset.openTab ?? "");
    });
  });

  bindContextMenu();

  if (state.activePanel === "variables") {
    bindVariables();
    return;
  }

  if (!request || !tab) return;

  document.querySelector<HTMLSelectElement>("#method")?.addEventListener("change", (event) => {
    request.method = (event.target as HTMLSelectElement).value;
    scheduleSave();
    render();
  });
  const urlInput = document.querySelector<HTMLInputElement>("#url");
  urlInput?.addEventListener("input", (event) => {
    request.url = (event.target as HTMLInputElement).value;
    if (state.autoTitleFromUrlId === request.id) applyAutoTitleFromUrl(request);
    scheduleSave();
  });
  urlInput?.addEventListener("blur", () => {
    if (state.autoTitleFromUrlId === request.id) state.autoTitleFromUrlId = null;
  });
  urlInput?.addEventListener("paste", handleCurlPaste);
  document.querySelector("#send")?.addEventListener("click", sendRequest);
  document.querySelector("#cancel")?.addEventListener("click", cancelActiveRequest);
  document.querySelector("#clear")?.addEventListener("click", () => {
    tab.response = null;
    tab.error = null;
    render();
  });
  document.querySelector("#duplicate-request")?.addEventListener("click", () => duplicateRequest(request.id));
  document.querySelector(".foldable")?.addEventListener("toggle", (event) => {
    state.headersOpen = (event.target as HTMLDetailsElement).open;
  });
  document.querySelector("#add-header")?.addEventListener("click", (event) => {
    event.preventDefault();
    request.headers.push({ id: id(), key: "", value: "", enabled: true });
    scheduleSave();
    render();
  });
  document.querySelectorAll<HTMLButtonElement>("[data-body-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      request.bodyMode = button.dataset.bodyMode as BodyMode;
      scheduleSave();
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-raw-type]").forEach((button) => {
    button.addEventListener("click", () => {
      request.rawType = button.dataset.rawType as RawType;
      scheduleSave();
      render();
    });
  });
  document.querySelector<HTMLTextAreaElement>("#body")?.addEventListener("input", (event) => {
    request.body = (event.target as HTMLTextAreaElement).value;
    scheduleSave();
    renderRequestCodeOnly(request);
  });
  document.querySelector<HTMLTextAreaElement>("#body")?.addEventListener("paste", handleCurlPaste);
  document.querySelector("#add-form")?.addEventListener("click", () => {
    request.form.push({ id: id(), key: "", value: "", enabled: true });
    scheduleSave();
    render();
  });
  document.querySelector("#add-node-field")?.addEventListener("click", () => {
    request.form.push({ id: id(), key: "", value: "", enabled: true });
    scheduleSave();
    render();
  });
  bindPairs(request.headers, "header");
  bindPairs(request.form, "form");
  document.querySelectorAll<HTMLButtonElement>("[data-response-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      tab.selectedResponseTab = button.dataset.responseTab as ResponseTab;
      render();
    });
  });
}

function openPanel(panel: ActivePanel) {
  if (panel !== state.activePanel && (panel === "settings" || panel === "variables")) {
    state.previousPanel = state.activePanel;
  }
  state.activePanel = panel;
  state.contextMenu = null;
  render();
}

function backToWorkspace() {
  openPanel("request");
}

function onSettingsChanged() {
  const languageChanged = getLocale() !== state.settings.language;
  applyUserSettings(state.settings);
  scheduleSave();
  if (languageChanged) render();
}

async function clearAllData() {
  const labels = t().settings;
  const answer = await messageDialog("confirmation", labels.clearDataTitle, labels.clearDataBody);
  if (answer !== "confirm") return;

  const settings = state.settings;
  const fresh = defaultConfig();
  state.items = fresh.items;
  state.variables = fresh.variables;
  state.openTabs = fresh.openTabs;
  state.activeTabId = fresh.activeTabId;
  state.settings = settings;
  state.tabs = {};
  state.selectedTreeId = null;
  state.editingTreeId = null;
  state.autoTitleFromUrlId = null;
  state.contextMenu = null;
  state.activePanel = "request";
  state.previousPanel = "request";
  await saveConfig();
  render();
}

function bindTree() {
  const tree = document.querySelector<HTMLElement>(".tree");
  tree?.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    const row = (event.target as HTMLElement).closest<HTMLElement>("[data-tree-id]");
    const itemId = row?.dataset.treeId ?? null;
    state.contextMenu = { x: event.clientX, y: event.clientY, itemId };
    selectTreeItem(itemId, { render: true, focus: true });
  });
  tree?.addEventListener("keydown", async (event) => {
    if (state.editingTreeId) {
      if (event.key === "Enter") {
        event.preventDefault();
        commitTreeRename(state.editingTreeId);
      }
      if (event.key === "Escape") {
        event.preventDefault();
        cancelTreeRename();
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      selectAdjacentTreeItem(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      selectAdjacentTreeItem(-1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      const first = visibleTreeItems()[0];
      if (first) selectTreeItem(first.id, { render: true, focus: true });
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      const visible = visibleTreeItems();
      const last = visible[visible.length - 1];
      if (last) selectTreeItem(last.id, { render: true, focus: true });
      return;
    }

    const selected = state.selectedTreeId ? getItem(state.selectedTreeId) : null;
    if (!selected) return;

    if (event.key === "F2") {
      event.preventDefault();
      startTreeRename(selected.id);
      return;
    }
    if (event.key === "Delete") {
      event.preventDefault();
      await deleteItem(selected.id);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      activateTreeItem(selected.id);
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
      } else if (selected.parentId) {
        selectTreeItem(selected.parentId, { render: true, focus: true });
      }
    }
  });
  tree?.addEventListener("dragover", (event) => {
    if ((event.target as HTMLElement).closest("[data-tree-id]")) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    clearDropState();
    tree.classList.add("drop-root");
  });
  tree?.addEventListener("dragleave", (event) => {
    if (!tree.contains(event.relatedTarget as Node | null)) tree.classList.remove("drop-root");
  });
  tree?.addEventListener("drop", (event) => {
    if ((event.target as HTMLElement).closest("[data-tree-id]")) return;
    event.preventDefault();
    tree.classList.remove("drop-root");
    const sourceId = readDraggedId(event);
    if (!sourceId) return;
    moveItemTo(sourceId, null, state.items.filter((item) => item.parentId === null).length);
  });

  document.querySelectorAll<HTMLElement>(".tree-row[data-tree-id]").forEach((row) => {
    const item = getItem(row.dataset.treeId ?? "");
    if (!item) return;

    row.querySelector<HTMLInputElement>(".tree-rename-input")?.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        commitTreeRename(item.id);
      }
      if (event.key === "Escape") {
        event.preventDefault();
        cancelTreeRename();
      }
    });
    row.querySelector<HTMLInputElement>(".tree-rename-input")?.addEventListener("blur", () => {
      if (state.editingTreeId === item.id) commitTreeRename(item.id);
    });

    row.querySelectorAll<HTMLButtonElement>("[data-tree-action]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const action = button.dataset.treeAction ?? "";
        const targetId = button.dataset.treeId ?? item.id;
        if (action === "rename") startTreeRename(targetId);
        if (action === "duplicate") duplicateRequest(targetId);
        if (action === "delete") {
          void deleteItem(targetId);
        }
      });
    });

    row.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).closest("[data-tree-action], .tree-rename-input")) return;
      state.contextMenu = null;
      selectTreeItem(item.id, { render: true, focus: true });
    });
    row.addEventListener("dblclick", (event) => {
      if ((event.target as HTMLElement).closest("[data-tree-action], .tree-rename-input")) return;
      activateTreeItem(item.id);
    });
    row.addEventListener("dragstart", (event) => {
      draggedTreeId = item.id;
      row.classList.add("dragging");
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", item.id);
        event.dataTransfer.setData("application/x-restpilot-item", item.id);
      }
    });
    row.addEventListener("dragend", () => {
      draggedTreeId = null;
      clearDropState();
    });
    row.addEventListener("dragover", (event) => {
      const sourceId = readDraggedId(event) || draggedTreeId;
      if (!sourceId || sourceId === item.id) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      clearDropState(row);
      row.classList.add(dropClassFor(row, event, sourceId));
    });
    row.addEventListener("dragleave", () => row.classList.remove("drop-before", "drop-after", "drop-into", "drop-near"));
    row.addEventListener("drop", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const sourceId = readDraggedId(event);
      if (!sourceId || sourceId === item.id) return;
      const placement = dropPlacementFor(row, event, sourceId);
      clearDropState();
      moveDroppedItem(sourceId, item, placement);
    });
  });

  focusTreeSelection();
}

function visibleTreeItems(): TreeItem[] {
  const result: TreeItem[] = [];
  const walk = (parentId: string | null) => {
    for (const item of childrenOf(parentId)) {
      result.push(item);
      if (item.kind === "folder" && item.expanded) walk(item.id);
    }
  };
  walk(null);
  return result;
}

function selectTreeItem(itemId: string | null, options: { render?: boolean; focus?: boolean } = {}) {
  state.selectedTreeId = itemId;
  if (options.render) {
    render();
    if (options.focus) focusTreeSelection();
  }
}

function selectAdjacentTreeItem(direction: 1 | -1) {
  const visible = visibleTreeItems();
  if (!visible.length) return;
  const currentIndex = state.selectedTreeId ? visible.findIndex((item) => item.id === state.selectedTreeId) : -1;
  let nextIndex = currentIndex < 0 ? (direction > 0 ? 0 : visible.length - 1) : currentIndex + direction;
  nextIndex = Math.max(0, Math.min(nextIndex, visible.length - 1));
  selectTreeItem(visible[nextIndex].id, { render: true, focus: true });
}

function startTreeRename(itemId: string) {
  const item = getItem(itemId);
  if (!item) return;
  state.editingTreeId = itemId;
  state.selectedTreeId = itemId;
  state.contextMenu = null;
  render();
  focusTreeRenameInput(itemId);
}

function commitTreeRename(itemId: string) {
  const item = getItem(itemId);
  const input = document.querySelector<HTMLInputElement>(`.tree-row[data-tree-id="${itemId}"] .tree-rename-input`);
  const nextTitle = input?.value.trim() ?? item?.title ?? "";
  state.editingTreeId = null;
  if (!item) {
    render();
    return;
  }
  if (nextTitle) item.title = nextTitle;
  scheduleSave();
  render();
  focusTreeSelection();
}

function cancelTreeRename() {
  const editingId = state.editingTreeId;
  if (editingId) {
    const item = getRequest(editingId);
    if (item && item.title === "New request" && !item.url.trim()) {
      state.items = state.items.filter((entry) => entry.id !== editingId);
      state.openTabs = state.openTabs.filter((id) => id !== editingId);
      delete state.tabs[editingId];
      if (state.activeTabId === editingId) state.activeTabId = state.openTabs[0] ?? "";
      if (state.selectedTreeId === editingId) state.selectedTreeId = null;
      scheduleSave();
    }
  }
  state.editingTreeId = null;
  render();
  focusTreeSelection();
}

function focusTreeRenameInput(itemId: string) {
  const input = document.querySelector<HTMLInputElement>(`.tree-row[data-tree-id="${itemId}"] .tree-rename-input`);
  if (!input) return;
  input.focus();
  input.select();
}

function focusTreeSelection() {
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

  if (item.parentId) return item.parentId;

  const visible = visibleTreeItems().filter((entry) => entry.id !== itemId && !collectChildren(itemId).includes(entry.id));
  return visible[0]?.id ?? null;
}

function bindContextMenu() {
  document.addEventListener(
    "click",
    () => {
      if (!state.contextMenu) return;
      state.contextMenu = null;
      render();
    },
    { once: true }
  );

  document.querySelectorAll<HTMLElement>("[data-menu-action]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const action = button.dataset.menuAction ?? "";
      const itemId = state.contextMenu?.itemId ?? null;
      state.contextMenu = null;
      if (action === "new-request") createRequest();
      if (action === "new-folder") createFolder();
      if (action === "rename" && itemId) startTreeRename(itemId);
      if (action === "duplicate" && itemId) duplicateRequest(itemId);
      if (action === "delete" && itemId) deleteItem(itemId);
    });
  });
}

function dropClassFor(row: HTMLElement, event: DragEvent, sourceId: string) {
  const placement = dropPlacementFor(row, event, sourceId);
  if (placement === "before") return "drop-before";
  if (placement === "after") return "drop-after";
  return "drop-into";
}

function dropPlacementFor(row: HTMLElement, event: DragEvent, sourceId: string): "before" | "after" | "inside" {
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

function readDraggedId(event: DragEvent) {
  return event.dataTransfer?.getData("application/x-restpilot-item") || event.dataTransfer?.getData("text/plain") || draggedTreeId || "";
}

function clearDropState(except?: HTMLElement) {
  document.querySelector(".tree")?.classList.remove("drop-root");
  document.querySelectorAll<HTMLElement>(".tree-row.drop-before, .tree-row.drop-after, .tree-row.drop-into, .tree-row.drop-near, .tree-row.dragging").forEach((row) => {
    if (row !== except) row.classList.remove("drop-before", "drop-after", "drop-into", "drop-near", "dragging");
  });
}

function activateTreeItem(itemId: string) {
  const item = getItem(itemId);
  if (!item) return;
  if (item.kind === "folder") {
    item.expanded = !item.expanded;
  } else {
    openRequest(item.id);
  }
  scheduleSave();
  render();
}

function bindPairs(list: Pair[], scope: "header" | "form") {
  document.querySelectorAll<HTMLElement>(`[data-${scope}-id]`).forEach((row) => {
    const pair = list.find((item) => item.id === row.getAttribute(`data-${scope}-id`));
    if (!pair) return;
    row.querySelector<HTMLInputElement>(`.${scope}-enabled`)?.addEventListener("change", (event) => {
      pair.enabled = (event.target as HTMLInputElement).checked;
      scheduleSave();
    });
    row.querySelector<HTMLInputElement>(`.${scope}-key`)?.addEventListener("input", (event) => {
      pair.key = (event.target as HTMLInputElement).value;
      scheduleSave();
    });
    row.querySelector<HTMLInputElement>(`.${scope}-value`)?.addEventListener("input", (event) => {
      pair.value = (event.target as HTMLInputElement).value;
      scheduleSave();
    });
    row.querySelector(`.remove-${scope}`)?.addEventListener("click", () => {
      const index = list.findIndex((item) => item.id === pair.id);
      if (index >= 0) list.splice(index, 1);
      scheduleSave();
      render();
    });
  });
}

function bindVariables() {
  document.querySelector("#add-variable")?.addEventListener("click", () => {
    state.variables.push({ id: id(), name: "", value: "", enabled: true });
    scheduleSave();
    render();
  });
  document.querySelectorAll<HTMLElement>("[data-variable-id]").forEach((row) => {
    const variable = state.variables.find((item) => item.id === row.dataset.variableId);
    if (!variable) return;
    row.querySelector<HTMLInputElement>(".variable-enabled")?.addEventListener("change", (event) => {
      variable.enabled = (event.target as HTMLInputElement).checked;
      scheduleSave();
    });
    row.querySelector<HTMLInputElement>(".variable-name")?.addEventListener("input", (event) => {
      variable.name = (event.target as HTMLInputElement).value;
      scheduleSave();
    });
    row.querySelector<HTMLInputElement>(".variable-value")?.addEventListener("input", (event) => {
      variable.value = (event.target as HTMLInputElement).value;
      scheduleSave();
    });
    row.querySelector(".remove-variable")?.addEventListener("click", () => {
      state.variables = state.variables.filter((item) => item.id !== variable.id);
      scheduleSave();
      render();
    });
  });
}

async function sendRequest() {
  const request = getActiveRequest();
  if (!request) return;
  const tab = ensureTab(request.id);
  const runId = id();
  tab.loading = true;
  tab.requestRunId = runId;
  tab.error = null;
  tab.response = null;
  render();

  try {
    const headers = withContentType(
      request,
      Object.fromEntries(
        request.headers
          .filter((header) => header.enabled && header.key.trim())
          .map((header) => [applyVariables(header.key.trim()), applyVariables(header.value)])
      )
    );
    tab.response = await invoke<ApiResponse>("send_request", {
      payload: {
        request: {
          id: runId,
          method: request.method,
          url: applyVariables(request.url.trim()),
          headers,
          body_mode: request.bodyMode,
          raw_type: request.rawType,
          body: request.bodyMode === "raw" ? applyVariables(request.body) : "",
          form: request.form.map((field) => ({ ...field, key: applyVariables(field.key), value: applyVariables(field.value) }))
        },
        proxy: proxyPayload(state.settings.proxy)
      }
    });
  } catch (error) {
    tab.error = error instanceof Error ? error.message : String(error);
  } finally {
    tab.loading = false;
    tab.requestRunId = null;
    render();
  }
}

async function cancelActiveRequest() {
  const request = getActiveRequest();
  const tab = request ? ensureTab(request.id) : null;
  if (!tab?.requestRunId) return;
  await invoke("cancel_request", { id: tab.requestRunId });
}

async function handleCurlPaste(event: ClipboardEvent) {
  const text = event.clipboardData?.getData("text") ?? "";
  if (!looksLikeCurl(text)) return;
  event.preventDefault();
  const parsed = parseCurl(text, id);
  const labels = t().messages;
  if (!parsed) {
    await messageDialog("error", labels.importCurlTitle, labels.importCurlFailed);
    return;
  }
  state.pendingCurl = parsed;
  const result = await applicationDialog({
    title: labels.importCurlTitle,
    body: labels.importCurlBody,
    mode: "curl-preview",
    resizable: true,
    previewHtml: renderCurlPreview(parsed)
  });
  if (result === "import") {
    const current = getActiveRequest();
    if (current) applyCurlToRequest(current, parsed);
    scheduleSave();
    render();
  }
  state.pendingCurl = null;
}

function renderCurlPreview(request: SavedRequest) {
  return `
    <div class="curl-preview">
      <div><b>${escapeHtml(request.method)}</b><span>${escapeHtml(request.url)}</span></div>
      <div class="curl-meta">${escapeHtml(request.bodyMode)} · ${escapeHtml(request.rawType)}</div>
      <pre>${escapeHtml(JSON.stringify({ headers: request.headers, body: request.body, form: request.form }, null, 2))}</pre>
    </div>
  `;
}

function createFolder() {
  const parentId = selectedFolderId();
  const folder: TreeItem = { id: id(), kind: "folder", parentId, title: "New folder", expanded: true };
  insertItemAt(folder, parentId, childCount(parentId));
  scheduleSave();
  startTreeRename(folder.id);
}

function createRequest() {
  const parentId = selectedFolderId();
  const request = blankRequest(parentId);
  insertItemAt(request, parentId, childCount(parentId));
  state.autoTitleFromUrlId = request.id;
  openRequest(request.id);
  requestAnimationFrame(() => focusRequestUrl());
}

function focusRequestUrl() {
  const urlInput = document.querySelector<HTMLInputElement>("#url");
  if (!urlInput) return;
  urlInput.focus();
  urlInput.select();
}

function applyAutoTitleFromUrl(request: SavedRequest) {
  const derived = titleFromUrl(request.url);
  if (!derived) return;
  request.title = derived;
  syncRequestTitle(request.id);
}

function titleFromUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    const withProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(withProtocol);
    const path = parsed.pathname.replace(/\/+$/, "");
    const segments = path.split("/").filter(Boolean);
    if (segments.length) return decodeURIComponent(segments[segments.length - 1]).slice(0, 80);
    const host = parsed.hostname.replace(/^www\./i, "");
    return host || null;
  } catch {
    const fallback = trimmed.split(/[/?#]/).filter(Boolean).pop();
    return fallback ? decodeURIComponent(fallback).slice(0, 80) : null;
  }
}

function duplicateRequest(requestId: string) {
  const source = getRequest(requestId);
  if (!source) return;
  const copy = structuredClone(source);
  copy.id = id();
  copy.title = `${source.title} copy`;
  copy.headers = copy.headers.map((pair) => ({ ...pair, id: id() }));
  copy.form = copy.form.map((pair) => ({ ...pair, id: id() }));
  const siblings = childrenOf(source.parentId);
  insertItemAt(copy, source.parentId, siblings.findIndex((item) => item.id === source.id) + 1);
  openRequest(copy.id);
  scheduleSave();
  render();
}

async function deleteItem(itemId: string) {
  const item = getItem(itemId);
  if (!item) return;
  const labels = t().messages;
  const answer = await messageDialog("confirmation", labels.deleteTitle, labels.deleteBody.replace("{name}", item.title));
  if (answer !== "confirm") {
    requestAnimationFrame(() => focusTreeSelection());
    return;
  }

  const ids = collectChildren(itemId);
  const nextFocus = pickTreeFocusAfterDelete(itemId);

  state.items = state.items.filter((entry) => !ids.includes(entry.id));
  state.openTabs = state.openTabs.filter((id) => !ids.includes(id));
  for (const idToDelete of ids) delete state.tabs[idToDelete];
  state.activeTabId = state.openTabs.includes(state.activeTabId) ? state.activeTabId : (state.openTabs[0] ?? "");
  if (state.editingTreeId && ids.includes(state.editingTreeId)) state.editingTreeId = null;
  if (state.autoTitleFromUrlId && ids.includes(state.autoTitleFromUrlId)) state.autoTitleFromUrlId = null;
  if (!state.selectedTreeId || ids.includes(state.selectedTreeId)) {
    state.selectedTreeId = nextFocus;
  }

  scheduleSave();
  render();
  requestAnimationFrame(() => focusTreeSelection());
}

function moveDroppedItem(sourceId: string, target: TreeItem, placement: "before" | "after" | "inside") {
  if (sourceId === target.id) return;

  if (placement === "inside" && target.kind === "folder") {
    moveItemTo(sourceId, target.id, childCount(target.id));
    return;
  }

  const siblings = childrenOf(target.parentId);
  const targetIndex = siblings.findIndex((item) => item.id === target.id);
  moveItemTo(sourceId, target.parentId, targetIndex + (placement === "after" ? 1 : 0));
}

function moveItemTo(sourceId: string, targetParentId: string | null, targetChildIndex: number) {
  const source = getItem(sourceId);
  const targetParent = targetParentId ? getItem(targetParentId) : null;
  if (!source || source.id === targetParentId || (targetParent && targetParent.kind !== "folder")) return;
  if (targetParentId && collectChildren(source.id).includes(targetParentId)) return;

  const previousParentId = source.parentId;
  const previousIndex = childrenOf(previousParentId).findIndex((item) => item.id === source.id);
  let nextIndex = Math.max(0, targetChildIndex);
  if (previousParentId === targetParentId && previousIndex >= 0 && previousIndex < nextIndex) nextIndex -= 1;

  state.items = state.items.filter((item) => item.id !== source.id);
  source.parentId = targetParentId;
  insertItemAt(source, targetParentId, nextIndex);
  if (targetParent?.kind === "folder") targetParent.expanded = true;
  scheduleSave();
  render();
}

function insertItemAt(item: TreeItem, parentId: string | null, childIndex: number) {
  item.parentId = parentId;
  const siblings = childrenOf(parentId);
  const normalizedIndex = Math.max(0, Math.min(childIndex, siblings.length));
  const beforeSibling = siblings[normalizedIndex];
  if (beforeSibling) {
    state.items.splice(state.items.findIndex((entry) => entry.id === beforeSibling.id), 0, item);
    return;
  }

  if (siblings.length) {
    const lastSiblingIndex = state.items.findIndex((entry) => entry.id === siblings[siblings.length - 1].id);
    state.items.splice(lastSiblingIndex + 1, 0, item);
    return;
  }

  if (parentId) {
    const parentIndex = state.items.findIndex((entry) => entry.id === parentId);
    state.items.splice(parentIndex + 1, 0, item);
    return;
  }

  state.items.push(item);
}

function openRequest(requestId: string) {
  if (!getRequest(requestId)) return;
  if (state.autoTitleFromUrlId && state.autoTitleFromUrlId !== requestId) state.autoTitleFromUrlId = null;
  if (!state.openTabs.includes(requestId)) state.openTabs.push(requestId);
  state.activeTabId = requestId;
  state.selectedTreeId = requestId;
  state.activePanel = "request";
  ensureTab(requestId);
  scheduleSave();
  render();
}

function closeTab(requestId: string) {
  state.openTabs = state.openTabs.filter((id) => id !== requestId);
  if (state.activeTabId === requestId) state.activeTabId = state.openTabs[0] ?? "";
  scheduleSave();
  render();
}

function ensureTab(requestId: string) {
  state.tabs[requestId] ??= { requestId, response: null, error: null, loading: false, requestRunId: null, selectedResponseTab: "body" };
  return state.tabs[requestId];
}

function scheduleSave() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(saveConfig, 300);
}

async function saveConfig() {
  const config: AppConfig = {
    items: state.items,
    variables: state.variables,
    openTabs: state.openTabs,
    activeTabId: state.activeTabId,
    settings: state.settings
  };
  await invoke("save_app_config", { config });
}

function applyVariables(value: string) {
  return value.replace(/\$\{([^}]+)\}/g, (_, name: string) => {
    const variable = state.variables.find((item) => item.enabled && item.name === name.trim());
    return variable?.value ?? "";
  });
}

function highlightResponse(body: string, headers: Record<string, string>) {
  const contentType = Object.entries(headers).find(([key]) => key.toLowerCase() === "content-type")?.[1] ?? "";
  return contentType.toLowerCase().includes("json") ? highlightJson(formatJson(body)) : escapeHtml(body);
}

function highlightJson(value: string) {
  return escapeHtml(value).replace(
    /("(?:\\.|[^"\\])*"(?=\s*:))|("(?:\\.|[^"\\])*")|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/gi,
    (match, key, string, literal, number) => {
      const cls = key ? "json-key" : string ? "json-string" : literal ? "json-literal" : number ? "json-number" : "";
      return `<span class="${cls}">${match}</span>`;
    }
  );
}

function formatJson(value: string) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function highlightBodyContent(request: SavedRequest) {
  if (request.rawType !== "json") return escapeHtml(request.body);
  return highlightJson(request.body);
}

function renderRequestCodeOnly(request: SavedRequest) {
  const pre = document.querySelector(".code-editor pre");
  if (pre) pre.innerHTML = highlightBodyContent(request);
}

function withContentType(request: SavedRequest, headers: Record<string, string>) {
  if (request.bodyMode !== "raw" || !request.body.trim()) return headers;
  if (Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) return headers;
  const type = request.rawType === "json" ? "application/json" : "text/plain";
  return { ...headers, "Content-Type": type };
}

function blankRequest(parentId: string | null): SavedRequest {
  return {
    id: id(),
    kind: "request",
    parentId,
    title: "New request",
    method: "GET",
    url: "",
    headers: [],
    bodyMode: "raw",
    rawType: "json",
    body: "",
    form: []
  };
}

function getActiveRequest() {
  return getRequest(state.activeTabId);
}

function getRequest(itemId: string) {
  return state.items.find((item): item is SavedRequest => item.kind === "request" && item.id === itemId);
}

function getRequestFrom(items: TreeItem[], itemId: string) {
  return items.find((item): item is SavedRequest => item.kind === "request" && item.id === itemId);
}

function getItem(itemId: string) {
  return state.items.find((item) => item.id === itemId);
}

function selectedFolderId() {
  const selected = state.selectedTreeId ? getItem(state.selectedTreeId) : null;
  return selected?.kind === "folder" ? selected.id : selected?.parentId ?? null;
}

function childrenOf(parentId: string | null) {
  return state.items.filter((item) => item.parentId === parentId);
}

function childCount(parentId: string | null) {
  return childrenOf(parentId).length;
}

function collectChildren(itemId: string): string[] {
  return [itemId, ...state.items.filter((item) => item.parentId === itemId).flatMap((item) => collectChildren(item.id))];
}

function syncRequestTitle(requestId: string) {
  const request = getRequest(requestId);
  if (!request) return;
  const row = document.querySelector(`[data-tree-id="${requestId}"] .tree-title`);
  if (row) row.textContent = request.title;
  const tabLabel = document.querySelector(`[data-open-tab="${requestId}"] .tab-label`);
  if (tabLabel) tabLabel.textContent = request.title;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function id() {
  return crypto.randomUUID();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char] ?? char);
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
