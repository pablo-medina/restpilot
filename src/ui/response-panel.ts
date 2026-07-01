import { t } from "../i18n";
import { iconBookmark, iconCopy } from "../icons";
import {
  bodySourceKey,
  escapeHtml,
  detectContentKind,
  formatResponseBody,
  highlightResponse,
  isLargeText
} from "../content-display";
import {
  state,
  formatBytes,
  getActiveRequest,
  getRequest
} from "../app/state";
import { scheduleSave } from "../app/persistence";
import { hasResponseBodySelection } from "../app/context-menu";
import { getEditorRuntime } from "../app/editor-runtime";
import { mountHeadersTable } from "../headers-table";
import { messageDialog, inputDialog } from "../components/dialogs";
import { render } from "../app/render";
import type { TabState, SavedRequest, RawType, ResponseTab, SavedResponseHistoryItem, ApiResponse } from "../types";

export interface ResponsePanelCallbacks {
  closeContextMenu: () => void;
  syncContextMenu: () => void;
  showToast: (message: string) => void;
}

let callbacks: ResponsePanelCallbacks | undefined;

export function initResponsePanel(cb: ResponsePanelCallbacks): void {
  callbacks = cb;
}

export function getActiveResponse(request: SavedRequest, tab: TabState): ApiResponse | null {
  if (tab.selectedSavedResponseId && tab.selectedSavedResponseId !== "current") {
    const saved = request.savedResponses?.find((r) => r.id === tab.selectedSavedResponseId);
    if (saved) return saved;
  }
  return tab.response;
}

let responseRenderFrame: number | undefined;

export function getResponseBodyForDisplay(tab: TabState, body: string, headers: Record<string, string>): string {
  if (tab.streaming) return body;
  const cacheKey = `${bodySourceKey(body, headers)}:display`;
  if (tab.responseDisplayKey === cacheKey && tab.responseDisplayBody) return tab.responseDisplayBody;
  const display = formatResponseBody(body, headers);
  tab.responseDisplayKey = cacheKey;
  tab.responseDisplayBody = display;
  return display;
}

export function responseViewerMode(body: string, headers: Record<string, string>): RawType {
  return detectContentKind(body, headers);
}

export async function mountResponseBodyViewer(request: SavedRequest, tab: TabState): Promise<void> {
  tab.responseBodyUnmount?.();
  tab.responseBodyUnmount = undefined;

  const host = document.querySelector<HTMLElement>("[data-response-body-viewer]");
  const response = getActiveResponse(request, tab);
  if (!host || !response || tab.selectedResponseTab !== "body") return;

  const editors = await getEditorRuntime();
  const body = response.body;
  const headers = response.headers;
  const displayBody = getResponseBodyForDisplay(tab, body, headers);
  tab.responseBodyUnmount = editors.mountReadonlyViewer(
    host,
    displayBody,
    responseViewerMode(body, headers),
    state.settings.tabSize
  );
}

export function mountHeadersPanel(request: SavedRequest, tab: TabState): void {
  tab.headersTableUnmount?.();
  tab.headersTableUnmount = undefined;

  const host = document.querySelector<HTMLElement>("[data-headers-table]");
  const response = getActiveResponse(request, tab);
  if (!host || !response || tab.selectedResponseTab !== "headers") return;

  const labels = t().request;
  const rows = Object.entries(response.headers).map(([key, value]) => ({ key, value }));
  tab.headersTableUnmount = mountHeadersTable(host, rows, {
    search: labels.headersSearch,
    key: labels.headersKey,
    value: labels.headersValue,
    empty: labels.headersEmpty
  });
}

export async function mountResponseDisplays(request: SavedRequest, tab: TabState): Promise<void> {
  tab.responseBodyUnmount?.();
  tab.headersTableUnmount?.();
  tab.responseBodyUnmount = undefined;
  tab.headersTableUnmount = undefined;

  await mountResponseBodyViewer(request, tab);
  mountHeadersPanel(request, tab);
}

export function unmountResponseDisplays(tab: TabState): void {
  tab.responseBodyUnmount?.();
  tab.headersTableUnmount?.();
  tab.responseBodyUnmount = undefined;
  tab.headersTableUnmount = undefined;
}

export function renderResponseHead(tab: TabState): string {
  const labels = t().request;
  const request = getRequest(tab.requestId);
  const response = request ? getActiveResponse(request, tab) : tab.response;
  if (!response) return "";
  
  const statusClass = response.status >= 200 && response.status < 300 ? "ok" : response.status >= 400 ? "bad" : "soft";
  const streamingBadge = tab.streaming ? `<span class="stream-badge">${labels.streaming}</span>` : "";

  let selectorHtml = "";
  if (request && request.savedResponses && request.savedResponses.length > 0) {
    selectorHtml = `
      <div class="saved-responses-dropdown-shell" style="display: flex; align-items: center; margin-left: 12px;">
        <select class="minimal-select" data-select-response-version aria-label="Historial de respuestas">
          <option value="current" ${!tab.selectedSavedResponseId || tab.selectedSavedResponseId === "current" ? "selected" : ""}>
            ${labels.responseActiveVersion ?? "Respuesta activa"}
          </option>
          ${request.savedResponses.map(res => {
            const isSelected = tab.selectedSavedResponseId === res.id;
            const statusIcon = res.status >= 200 && res.status < 300 ? "✓" : "✗";
            const formattedDate = new Date(res.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return `<option value="${res.id}" ${isSelected ? "selected" : ""}>
              ${statusIcon} ${escapeHtml(res.title)} (${formattedDate})
            </option>`;
          }).join("")}
        </select>
        ${tab.selectedSavedResponseId && tab.selectedSavedResponseId !== "current" ? `
          <button class="mini-btn field-remove-btn" data-delete-saved-response aria-label="${labels.deleteSavedResponse ?? "Eliminar respuesta guardada"}" style="margin-left: 6px; padding: 0; display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px;">×</button>
        ` : ""}
      </div>
    `;
  }

  const isViewingCurrent = !tab.selectedSavedResponseId || tab.selectedSavedResponseId === "current";
  const saveButtonHtml = isViewingCurrent ? `
    <button
      class="icon-btn"
      data-action-save-response
      type="button"
      aria-label="${labels.saveResponse ?? "Guardar respuesta"}"
      title="${labels.saveResponse ?? "Guardar respuesta"}"
      style="margin-right: 6px; color: var(--rp-text-muted);"
    >
      ${iconBookmark}
    </button>
  ` : "";

  return `
    <div class="response-head">
      <div class="status ${statusClass}">${response.status} ${escapeHtml(response.status_text)}</div>${streamingBadge}
      ${selectorHtml}
      <div class="response-head-actions">
        <div class="metrics"><span>${response.duration_ms} ms</span><span>${formatBytes(response.body.length)}</span></div>
        ${saveButtonHtml}
        <button
          class="icon-btn"
          data-copy-menu-trigger
          id="copy-response-menu"
          type="button"
          aria-label="${labels.copyResponseMenu}"
          aria-haspopup="menu"
          aria-expanded="false"
        >${iconCopy}</button>
      </div>
    </div>
  `;
}

export async function refreshResponseBodyDisplay(request: SavedRequest, tab: TabState): Promise<void> {
  const response = getActiveResponse(request, tab);
  if (!response) return;

  const body = response.body;
  const headers = response.headers;
  const displayBody = getResponseBodyForDisplay(tab, body, headers);

  const head = document.querySelector(".response-head");
  if (head) {
    head.outerHTML = renderResponseHead(tab);
    bindResponseCopyMenu(tab);
  }

  const streamHost = document.querySelector<HTMLElement>("[data-response-body-stream]");
  if (streamHost) {
    streamHost.textContent = displayBody;
    return;
  }

  const host = document.querySelector<HTMLElement>("[data-response-body-viewer]");
  if (!host) return;

  const editors = await getEditorRuntime();
  if (editors.setReadonlyViewerValue(host, displayBody)) return;
  await mountResponseBodyViewer(request, tab);
}

export function renderResponseBodyMarkup(body: string, headers: Record<string, string>, streaming = false): string {
  if (streaming && !isLargeText(body)) {
    return `<pre class="response-body response-body-stream" data-response-body-stream></pre>`;
  }
  if (isLargeText(body)) {
    return `<div class="response-body response-body-viewer" data-response-body-viewer></div>`;
  }
  return `<pre class="response-body">${highlightResponse(body, headers)}</pre>`;
}

export function renderResponseHeadersMarkup(): string {
  return `<div class="response-headers-panel" data-headers-table></div>`;
}

export function renderResponse(tab: TabState): string {
  const request = getRequest(tab.requestId);
  const labels = t().request;
  if (tab.loading && !tab.response) {
    return `<div class="response-empty"><div class="loader"></div><h2>${labels.waitingTitle}</h2><p>${labels.waitingBody}</p></div>`;
  }
  if (tab.error && !tab.response) return `<div class="response-empty error"><h2>${labels.failedTitle}</h2><p>${escapeHtml(tab.error)}</p></div>`;

  const response = request ? getActiveResponse(request, tab) : tab.response;
  if (!response) return `<div class="response-empty"><h2>${labels.emptyTitle}</h2><p>${labels.emptyBody}</p></div>`;

  return `
    ${renderResponseHead(tab)}
    <div class="tabs">
      <button class="${tab.selectedResponseTab === "body" ? "active" : ""}" data-response-tab="body" type="button">${labels.body}</button>
      <button class="${tab.selectedResponseTab === "headers" ? "active" : ""}" data-response-tab="headers" type="button">${labels.responseHeaders}</button>
    </div>
    ${
      tab.selectedResponseTab === "body"
        ? renderResponseBodyMarkup(response.body, response.headers, tab.streaming)
        : renderResponseHeadersMarkup()
    }
  `;
}

export function bindResponseCopyMenu(tab: TabState): void {
  const button = document.querySelector<HTMLButtonElement>("#copy-response-menu");
  button?.addEventListener("click", (event) => {
    event.stopPropagation();
    if (state.contextMenu?.kind === "response-copy" && state.contextMenu.requestId === tab.requestId) {
      callbacks?.closeContextMenu();
      return;
    }
    const rect = button.getBoundingClientRect();
    state.contextMenu = {
      kind: "response-copy",
      x: rect.right,
      y: rect.bottom + 4,
      requestId: tab.requestId,
      canCopySelection: hasResponseBodySelection()
    };
    callbacks?.syncContextMenu();
  });

  bindResponseHeadActions(tab);
}

export function bindResponseHeadActions(tab: TabState): void {
  const select = document.querySelector<HTMLSelectElement>("[data-select-response-version]");
  select?.addEventListener("change", () => {
    tab.selectedSavedResponseId = select.value;
    render();
  });

  const saveBtn = document.querySelector<HTMLButtonElement>("[data-action-save-response]");
  saveBtn?.addEventListener("click", async (event) => {
    event.stopPropagation();
    const request = getRequest(tab.requestId);
    if (!request || !tab.response) return;

    const titleLabel = t().request.saveResponse ?? "Guardar respuesta";
    const promptLabel = t().request.saveResponsePrompt ?? "Ingrese un nombre para esta respuesta:";
    const name = await inputDialog(titleLabel, promptLabel, "");
    if (!name || name === "cancel") return;

    const trimmedName = name.trim();
    if (!trimmedName) return;

    const savedItem: SavedResponseHistoryItem = {
      id: crypto.randomUUID(),
      title: trimmedName,
      timestamp: Date.now(),
      status: tab.response.status,
      status_text: tab.response.status_text,
      duration_ms: tab.response.duration_ms,
      headers: { ...tab.response.headers },
      body: tab.response.body
    };

    if (!request.savedResponses) {
      request.savedResponses = [];
    }

    if (request.savedResponses.length >= 5) {
      request.savedResponses.shift();
    }

    request.savedResponses.push(savedItem);
    tab.selectedSavedResponseId = savedItem.id;

    scheduleSave();
    if (callbacks?.showToast) {
      callbacks.showToast(t().request.saveResponseSuccess ?? "Respuesta guardada correctamente");
    }
    render();
  });

  const deleteBtn = document.querySelector<HTMLButtonElement>("[data-delete-saved-response]");
  deleteBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    const request = getRequest(tab.requestId);
    if (!request || !tab.selectedSavedResponseId) return;

    const index = request.savedResponses?.findIndex(r => r.id === tab.selectedSavedResponseId);
    if (index !== undefined && index >= 0) {
      request.savedResponses?.splice(index, 1);
    }

    tab.selectedSavedResponseId = "current";
    scheduleSave();
    render();
  });
}

export async function copyResponseStatus(tab: TabState): Promise<void> {
  if (!tab.response) return;
  const line = `${tab.response.status} ${tab.response.status_text} · ${tab.response.duration_ms} ms`;
  await copyText(line);
}

export async function copyResponseBody(request: SavedRequest, tab: TabState): Promise<void> {
  if (!tab.response) return;
  const body = getResponseBodyForDisplay(tab, tab.response.body, tab.response.headers);
  await copyText(body);
}

export async function copyResponseHeaders(tab: TabState): Promise<void> {
  if (!tab.response) return;
  const text = Object.entries(tab.response.headers)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
  await copyText(text);
}

async function copyText(text: string): Promise<void> {
  const labels = t().messages;
  try {
    await navigator.clipboard.writeText(text);
    callbacks?.showToast(labels.copySuccess);
  } catch {
    await messageDialog("error", labels.copyCurlTitle, labels.copyFailed);
  }
}

export function bindResponseTabs(requestId: string): void {
  const tab = state.tabs[requestId];
  if (!tab) return;
  document.querySelectorAll<HTMLButtonElement>(".response-card [data-response-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      tab.selectedResponseTab = button.dataset.responseTab as ResponseTab;
      render();
    });
  });
}

export function scheduleResponseRender(): void {
  if (responseRenderFrame) return;
  responseRenderFrame = requestAnimationFrame(() => {
    responseRenderFrame = undefined;
    const request = getActiveRequest();
    if (!request) return;
    const tab = state.tabs[request.id];
    if (!tab?.response) return;
    const card = document.querySelector(".response-card");
    if (!card) return;

    const canPatchBody =
      tab.selectedResponseTab === "body" &&
      card.querySelector("[data-response-body-viewer], [data-response-body-stream]");

    if (canPatchBody) {
      void refreshResponseBodyDisplay(request, tab);
      return;
    }

    card.innerHTML = renderResponse(tab);
    bindResponseTabs(request.id);
    void mountResponseDisplays(request, tab);
  });
}
