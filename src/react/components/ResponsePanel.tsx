import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { hasResponseBodySelection } from "../../app/context-menu";
import { CodeMirrorEditor } from "./CodeMirrorEditor";
import { HeadersTable } from "./HeadersTable";
import { scheduleSave } from "../../app/persistence";
import { formatBytes, getRequest, setState, state } from "../../app/state";
import { inputDialog } from "../../components/dialogs";
import { pushToast } from "./index";
import {
  downloadResponseBody,
  getActiveResponse,
  getResponseBodyForDisplay,
  responseViewerMode
} from "../../ui/response-panel";
import { isImageResponse, isPdfResponse, responseBodyBytes, responseMimeType } from "../../lib/response-binary";
import { highlightResponse, isLargeText } from "../../lib/content-display";
import { iconBookmark, iconCopy, iconDownload } from "../../lib/icons";
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
      headers: [...tab.response.headers],
      body: tab.response.body,
      body_is_base64: tab.response.body_is_base64,
      body_size: tab.response.body_size
    };

    if (!request.savedResponses) request.savedResponses = [];
    if (request.savedResponses.length >= 5) request.savedResponses.shift();
    request.savedResponses.push(savedItem);
    tab.selectedSavedResponseId = savedItem.id;
    scheduleSave();
    pushToast(labels.saveResponseSuccess);
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
          <span>{formatBytes(response.body_size)}</span>
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
          data-action-download-response
          type="button"
          aria-label={labels.downloadResponse}
          title={labels.downloadResponse}
          style={{ marginRight: 6, color: "var(--rp-text-muted)" }}
          onClick={() => void downloadResponseBody(request, tab)}
          dangerouslySetInnerHTML={{ __html: iconDownload }}
        />
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

function DownloadBodyButton({ request, tab }: { request: SavedRequest; tab: TabState }) {
  const labels = t().request;
  return (
    <button
      className="mini-btn response-download-btn"
      data-download-response-body
      type="button"
      onClick={() => void downloadResponseBody(request, tab)}
    >
      {labels.downloadResponseAction}
    </button>
  );
}

function BinaryBodyPlaceholder({
  request,
  tab,
  response,
  message
}: {
  request: SavedRequest;
  tab: TabState;
  response: ApiResponse;
  message?: string;
}) {
  const labels = t().request;
  const body = message ?? labels.binaryBodyBody;
  return (
    <div className="response-empty">
      <h2>{labels.binaryBodyTitle}</h2>
      <p>{body.replace("{size}", formatBytes(response.body_size))}</p>
      <div className="response-empty-actions">
        <DownloadBodyButton request={request} tab={tab} />
      </div>
    </div>
  );
}

/**
 * One blob URL per rendered response, revoked when the body changes or the view unmounts.
 * This is what lets the webview render PDFs and images with no bundled library.
 */
type ObjectUrlState = { url: string | null; decodeFailed: boolean };

function useResponseObjectUrl(response: ApiResponse, mimeType: string): ObjectUrlState {
  const [entry, setEntry] = useState<ObjectUrlState>({ url: null, decodeFailed: false });

  useEffect(() => {
    const bytes = responseBodyBytes(response);
    if (!bytes) {
      setEntry({ url: null, decodeFailed: true });
      return;
    }
    const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
    setEntry({ url, decodeFailed: false });
    return () => {
      URL.revokeObjectURL(url);
      setEntry({ url: null, decodeFailed: false });
    };
  }, [response.body, response.body_is_base64, mimeType]);

  return entry;
}

/** Renders the body with the webview's built-in PDF viewer — no bundled PDF library. */
function PdfBodyView({
  request,
  tab,
  response
}: {
  request: SavedRequest;
  tab: TabState;
  response: ApiResponse;
}) {
  const labels = t().request;
  const { url: objectUrl, decodeFailed } = useResponseObjectUrl(response, "application/pdf");
  const bodyKey = `${response.body_is_base64}:${response.body.length}`;
  const [failedKey, setFailedKey] = useState<string | null>(null);

  if (decodeFailed || failedKey === bodyKey) {
    return (
      <BinaryBodyPlaceholder
        request={request}
        tab={tab}
        response={response}
        message={labels.pdfPreviewUnavailable}
      />
    );
  }

  return (
    <div className="response-body response-body-pdf" data-response-pdf>
      {objectUrl ? (
        <iframe
          className="response-pdf-frame"
          src={objectUrl}
          title={labels.pdfPreviewTitle}
          onError={() => setFailedKey(bodyKey)}
        />
      ) : null}
    </div>
  );
}

/** Shows an image response as a picture, with its pixel size once the webview has decoded it. */
function ImageBodyView({
  request,
  tab,
  response
}: {
  request: SavedRequest;
  tab: TabState;
  response: ApiResponse;
}) {
  const labels = t().request;
  const mime = responseMimeType(response.headers);
  const { url: objectUrl, decodeFailed } = useResponseObjectUrl(response, mime.startsWith("image/") ? mime : "");
  const bodyKey = `${response.body_is_base64}:${response.body.length}`;
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  if (decodeFailed || failedKey === bodyKey) {
    return (
      <BinaryBodyPlaceholder
        request={request}
        tab={tab}
        response={response}
        message={labels.imagePreviewUnavailable}
      />
    );
  }

  return (
    <div className="response-body response-body-image" data-response-image>
      {objectUrl ? (
        <img
          className="response-image-preview"
          src={objectUrl}
          alt={labels.imagePreviewTitle}
          onLoad={(event) =>
            setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })
          }
          onError={() => setFailedKey(bodyKey)}
        />
      ) : null}
      {size ? (
        <div className="response-image-meta">
          {size.width} × {size.height}
        </div>
      ) : null}
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
  const displayBody = response.body_is_base64 ? "" : getResponseBodyForDisplay(tab, response.body, response.headers);
  const useStream = tab.streaming && !isLargeText(response.body);
  const useViewer = isLargeText(response.body);

  useLayoutEffect(() => {
    if (useStream && streamRef.current) {
      streamRef.current.textContent = displayBody;
    }
  }, [displayBody, useStream]);

  if (!tab.streaming && isPdfResponse(response)) {
    return <PdfBodyView request={request} tab={tab} response={response} />;
  }

  if (!tab.streaming && isImageResponse(response)) {
    return <ImageBodyView request={request} tab={tab} response={response} />;
  }

  if (response.body_is_base64) {
    return <BinaryBodyPlaceholder request={request} tab={tab} response={response} />;
  }

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

  const rows = response.headers.map(([key, value]) => ({ key, value }));
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
