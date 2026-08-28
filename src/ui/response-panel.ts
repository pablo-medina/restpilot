import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import {
  bodySourceKey,
  detectContentKind,
  formatResponseBody
} from "../lib/content-display";
import {
  responseBodyBytes,
  responseFileExtension,
  suggestedResponseFileName
} from "../lib/response-binary";
import { messageDialog } from "../components/dialogs";
import { bumpRenderGeneration } from "../react/render-bridge";
import { pushToast } from "../react/components/index";
import { t } from "../i18n";
import type { TabState, SavedRequest, RawType, ApiResponse, HeaderPair } from "../types";

/** Response shown in the panel: a saved snapshot when selected, otherwise the live one. */
export function getActiveResponse(request: SavedRequest, tab: TabState): ApiResponse | null {
  if (tab.selectedSavedResponseId && tab.selectedSavedResponseId !== "current") {
    const saved = request.savedResponses?.find((r) => r.id === tab.selectedSavedResponseId);
    if (saved) return saved;
  }
  return tab.response;
}

let responseRenderFrame: number | undefined;

export function getResponseBodyForDisplay(tab: TabState, body: string, headers: HeaderPair[]): string {
  if (tab.streaming) return body;
  const cacheKey = `${bodySourceKey(body, headers)}:display`;
  if (tab.responseDisplayKey === cacheKey && tab.responseDisplayBody) return tab.responseDisplayBody;
  const display = formatResponseBody(body, headers);
  tab.responseDisplayKey = cacheKey;
  tab.responseDisplayBody = display;
  return display;
}

export function responseViewerMode(body: string, headers: HeaderPair[]): RawType {
  return detectContentKind(body, headers);
}

export async function copyResponseStatus(request: SavedRequest, tab: TabState): Promise<void> {
  const response = getActiveResponse(request, tab);
  if (!response) return;
  await copyText(`${response.status} ${response.status_text} · ${response.duration_ms} ms`);
}

export async function copyResponseBody(request: SavedRequest, tab: TabState): Promise<void> {
  const response = getActiveResponse(request, tab);
  if (!response) return;
  await copyText(getResponseBodyForDisplay(tab, response.body, response.headers));
}

export async function copyResponseHeaders(request: SavedRequest, tab: TabState): Promise<void> {
  const response = getActiveResponse(request, tab);
  if (!response) return;
  const text = response.headers.map(([key, value]) => `${key}: ${value}`).join("\n");
  await copyText(text);
}

/** Write the raw response bytes to a file the user picks. Works for text, binary and PDF bodies. */
export async function downloadResponseBody(request: SavedRequest, tab: TabState): Promise<void> {
  const response = getActiveResponse(request, tab);
  if (!response) return;
  const labels = t().request;

  const bytes = responseBodyBytes(response);
  if (!bytes) {
    await messageDialog("error", labels.downloadResponseFailedTitle, labels.downloadResponseFailedBody);
    return;
  }

  const defaultPath = suggestedResponseFileName(response);
  const extension = defaultPath.split(".").pop() ?? responseFileExtension(response.headers);

  const path = await save({
    title: labels.downloadResponse,
    defaultPath,
    filters: [{ name: extension.toUpperCase(), extensions: [extension] }]
  });
  if (!path) return;

  try {
    await writeFile(path, bytes);
    pushToast(labels.downloadResponseSuccess);
  } catch {
    await messageDialog("error", labels.downloadResponseFailedTitle, labels.downloadResponseFailedBody);
  }
}

async function copyText(text: string): Promise<void> {
  const labels = t().messages;
  try {
    await navigator.clipboard.writeText(text);
    pushToast(labels.copySuccess);
  } catch {
    await messageDialog("error", labels.copyCurlTitle, labels.copyFailed);
  }
}

/** Coalesce streaming chunk re-renders into one frame. */
export function scheduleResponseRender(): void {
  if (responseRenderFrame) return;
  responseRenderFrame = requestAnimationFrame(() => {
    responseRenderFrame = undefined;
    bumpRenderGeneration();
  });
}
