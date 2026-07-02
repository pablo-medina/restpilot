import { applicationDialog, messageDialog } from "../components/dialogs";
import {
  applyCurlToRequest,
  bodyModeCurlLabel,
  curlPreviewPayload,
  looksLikeCurl,
  parseCurl,
  rawTypeCurlLabel
} from "../lib/curl";
import { escapeHtml } from "../lib/content-display";
import { t } from "../i18n";
import { displayRequestUrl } from "../lib/variables";
import { scheduleSave } from "./persistence";
import { getActiveRequest, id, state } from "./state";
import type { SavedRequest } from "../types";
import { tryPrettifyJson } from "../lib/content-display";

function maybePrettifyRequestJson(request: SavedRequest) {
  if (!state.settings.autoPrettifyJson || request.bodyMode !== "raw" || request.rawType !== "json") return;
  const pretty = tryPrettifyJson(request.body);
  if (pretty) request.body = pretty;
}

function renderCurlPreview(request: SavedRequest) {
  const modeLabel = bodyModeCurlLabel(request.bodyMode);
  const typeLabel = request.bodyMode === "raw" ? rawTypeCurlLabel(request.rawType) : "";
  return `
    <div class="curl-preview">
      <div class="curl-preview-summary">
        <div class="curl-preview-line"><b>${escapeHtml(request.method)}</b><span>${escapeHtml(displayRequestUrl(request))}</span></div>
        <div class="curl-preview-meta">${escapeHtml(typeLabel ? `${modeLabel} · ${typeLabel}` : modeLabel)}</div>
      </div>
      <pre>${escapeHtml(curlPreviewPayload(request))}</pre>
    </div>
  `;
}

export async function handleRequestCurlPaste(event: ClipboardEvent, refresh: () => void): Promise<void> {
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
  const importAction = typeof result === "string" ? result : result.action;
  if (importAction === "import") {
    const current = getActiveRequest();
    if (current) {
      applyCurlToRequest(current, parsed);
      maybePrettifyRequestJson(current);
    }
    scheduleSave();
    refresh();
  }
  state.pendingCurl = null;
}
