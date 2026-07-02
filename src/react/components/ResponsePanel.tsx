import { useLayoutEffect, useRef } from "react";
import { hasResponseBodySelection } from "../../app/context-menu";
import { CodeMirrorEditor } from "./CodeMirrorEditor";
import { HeadersTable } from "./HeadersTable";
import { scheduleSave } from "../../app/persistence";
import { formatBytes, getRequest, setState, state } from "../../app/state";
import { inputDialog } from "../../components/dialogs";
import {
  getActiveResponse,
  getResponseBodyForDisplay,
  responseViewerMode
} from "../../ui/response-panel";
import { highlightResponse, isLargeText } from "../../lib/content-display";
import { iconBookmark, iconCopy } from "../../lib/icons";
import { t } from "../../i18n";
import type { ApiResponse, ResponseTab, SavedRequest, SavedResponseHistoryItem, TabState } from "../../types";
import { ensureTab } from "../lib/ensure-tab";

type Props = {
  requestId: string;
  refresh: () => void;
};

function statusClass(status: number): string {
  if (status >= 200 && status < 300) return "ok";
  if (status >= 400) return "bad";
  return "soft";
}

function ResponseHead({
  request,
  tab,
  response,
  refresh
}: {
  request: SavedRequest;
  tab: TabState;
  response: ApiResponse;
  refresh: () => void;
}) {
  const labels = t().request;
  const streamingBadge = tab.streaming ? <span className="stream-badge">{labels.streaming}</span> : null;
  const isViewingCurrent = !tab.selectedSavedResponseId || tab.selectedSavedResponseId === "current";

  const openCopyMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (state.contextMenu?.kind === "response-copy" && state.contextMenu.requestId === tab.requestId) {
      setState(prev => ({ ...prev, contextMenu: null }));
      void import("../../app").then((app) => app.syncContextMenu());
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    setState(prev => ({
      ...prev,
      contextMenu: {
        kind: "response-copy",
        x: rect.right,
        y: rect.bottom + 4,
        requestId: tab.requestId,
        canCopySelection: hasResponseBodySelection()
      }
    }));
    void import("../../app").then((app) => app.syncContextMenu());
  };

  const saveResponse = async () => {
    if (!tab.response) return;
    const titleLabel = labels.saveResponse ?? "Guardar respuesta";
    const promptLabel = labels.saveResponsePrompt ?? "Ingrese un nombre para esta respuesta:";
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

    if (!request.savedResponses) request.savedResponses = [];
    if (request.savedResponses.length >= 5) request.savedResponses.shift();
    request.savedResponses.push(savedItem);
    tab.selectedSavedResponseId = savedItem.id;
    scheduleSave();
    refresh();
  };

  const deleteSavedResponse = () => {
    if (!tab.selectedSavedResponseId) return;
    const index = request.savedResponses?.findIndex((item) => item.id === tab.selectedSavedResponseId);
    if (index !== undefined && index >= 0) request.savedResponses?.splice(index, 1);
    tab.selectedSavedResponseId = "current";
    scheduleSave();
    refresh();
  };

  return (
    <div className="response-head">
      <div className={`status ${statusClass(response.status)}`}>
        {response.status} {response.status_text}
      </div>
      {streamingBadge}
      {request.savedResponses && request.savedResponses.length > 0 ? (
        <div className="saved-responses-dropdown-shell" style={{ display: "flex", alignItems: "center", marginLeft: 12 }}>
          <select
            className="minimal-select"
            data-select-response-version
            aria-label="Historial de respuestas"
            value={tab.selectedSavedResponseId ?? "current"}
            onChange={(event) => {
              tab.selectedSavedResponseId = event.target.value;
              refresh();
            }}
          >
            <option value="current">{labels.responseActiveVersion ?? "Respuesta activa"}</option>
            {request.savedResponses.map((item) => {
              const statusIcon = item.status >= 200 && item.status < 300 ? "✓" : "✗";
              const formattedDate = new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
              return (
                <option key={item.id} value={item.id}>
                  {statusIcon} {item.title} ({formattedDate})
                </option>
              );
            })}
          </select>
          {tab.selectedSavedResponseId && tab.selectedSavedResponseId !== "current" ? (
            <button
              className="mini-btn field-remove-btn"
              data-delete-saved-response
              type="button"
              aria-label={labels.deleteSavedResponse ?? "Eliminar respuesta guardada"}
              style={{ marginLeft: 6, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22 }}
              onClick={deleteSavedResponse}
            >
              ×
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="response-head-actions">
        <div className="metrics">
          <span>{response.duration_ms} ms</span>
          <span>{formatBytes(response.body.length)}</span>
        </div>
        {isViewingCurrent ? (
          <button
            className="icon-btn"
            data-action-save-response
            type="button"
            aria-label={labels.saveResponse ?? "Guardar respuesta"}
            title={labels.saveResponse ?? "Guardar respuesta"}
            style={{ marginRight: 6, color: "var(--rp-text-muted)" }}
            onClick={() => void saveResponse()}
            dangerouslySetInnerHTML={{ __html: iconBookmark }}
          />
        ) : null}
        <button
          className="icon-btn"
          data-copy-menu-trigger
          id="copy-response-menu"
          type="button"
          aria-label={labels.copyResponseMenu}
          aria-haspopup="menu"
          aria-expanded={state.contextMenu?.kind === "response-copy" && state.contextMenu.requestId === tab.requestId}
          onClick={openCopyMenu}
          dangerouslySetInnerHTML={{ __html: iconCopy }}
        />
      </div>
    </div>
  );
}

function ResponseBodyView({
  request,
  tab,
  response
}: {
  request: SavedRequest;
  tab: TabState;
  response: ApiResponse;
}) {
  const streamRef = useRef<HTMLPreElement>(null);
  const displayBody = getResponseBodyForDisplay(tab, response.body, response.headers);
  const useStream = tab.streaming && !isLargeText(response.body);
  const useViewer = isLargeText(response.body);

  useLayoutEffect(() => {
    if (useStream && streamRef.current) {
      streamRef.current.textContent = displayBody;
    }
  }, [displayBody, useStream]);

  if (useStream) {
    return <pre ref={streamRef} className="response-body response-body-stream" data-response-body-stream />;
  }

  if (useViewer) {
    return (
      <CodeMirrorEditor
        readOnly
        key={`response-${request.id}-${tab.selectedSavedResponseId ?? "current"}`}
        value={displayBody}
        language={responseViewerMode(response.body, response.headers)}
        tabSize={state.settings.tabSize}
        className="response-body response-body-viewer"
      />
    );
  }

  return (
    <pre
      className="response-body"
      dangerouslySetInnerHTML={{ __html: highlightResponse(displayBody, response.headers) }}
    />
  );
}

function ResponseHeadersView({ request, tab }: { request: SavedRequest; tab: TabState }) {
  const response = getActiveResponse(request, tab);
  const labels = t().request;

  if (!response) return <div className="response-headers-panel" />;

  const rows = Object.entries(response.headers).map(([key, value]) => ({ key, value }));
  return (
    <div className="response-headers-panel">
      <HeadersTable
        rows={rows}
        labels={{
          search: labels.headersSearch,
          key: labels.headersKey,
          value: labels.headersValue,
          empty: labels.headersEmpty
        }}
      />
    </div>
  );
}

export function ResponsePanel({ requestId, refresh }: Props) {
  const request = getRequest(requestId);
  const tab = ensureTab(requestId);
  const labels = t().request;

  useLayoutEffect(() => {
    return () => {
      tab.responseBodyUnmount?.();
      tab.responseBodyUnmount = undefined;
    };
  }, [requestId]);

  if (tab.loading && !tab.response) {
    return (
      <article className="response-card">
        <div className="response-empty">
          <div className="loader" />
          <h2>{labels.waitingTitle}</h2>
          <p>{labels.waitingBody}</p>
        </div>
      </article>
    );
  }

  if (tab.error && !tab.response) {
    return (
      <article className="response-card">
        <div className="response-empty error">
          <h2>{labels.failedTitle}</h2>
          <p>{tab.error}</p>
        </div>
      </article>
    );
  }

  const response = request ? getActiveResponse(request, tab) : tab.response;
  if (!response) {
    return (
      <article className="response-card">
        <div className="response-empty">
          <h2>{labels.emptyTitle}</h2>
          <p>{labels.emptyBody}</p>
        </div>
      </article>
    );
  }

  if (!request) {
    return <article className="response-card" />;
  }

  const setResponseTab = (next: ResponseTab) => {
    tab.selectedResponseTab = next;
    refresh();
  };

  return (
    <article className="response-card">
      <ResponseHead request={request} tab={tab} response={response} refresh={refresh} />
      <div className="tabs">
        <button
          className={tab.selectedResponseTab === "body" ? "active" : ""}
          data-response-tab="body"
          type="button"
          onClick={() => setResponseTab("body")}
        >
          {labels.body}
        </button>
        <button
          className={tab.selectedResponseTab === "headers" ? "active" : ""}
          data-response-tab="headers"
          type="button"
          onClick={() => setResponseTab("headers")}
        >
          {labels.responseHeaders}
        </button>
      </div>
      {tab.selectedResponseTab === "body" ? (
        <ResponseBodyView request={request} tab={tab} response={response} />
      ) : (
        <ResponseHeadersView request={request} tab={tab} />
      )}
    </article>
  );
}
