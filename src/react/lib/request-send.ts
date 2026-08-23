import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getEffectiveVariables } from "../../app/environments";
import { httpTransportPayload, scheduleSave } from "../../app/persistence";
import { resolvedOutboundUrl } from "../../app/request-auth";
import { getActiveRequest, id, state } from "../../app/state";
import { buildFormPayload, buildRequestHeaders, withContentType } from "../../app/request-utils";
import { messageDialog } from "../../components/dialogs";
import { applyVariables } from "../../lib/variables";
import { requestParameterNames } from "../../lib/parameters";
import { hasMissingMultipartFiles, missingMultipartFileNames } from "../../lib/request-multipart";
import { invalidateResponseRenderCache } from "../../lib/content-display";
import { scheduleResponseRender } from "../../ui/response-panel";
import { t } from "../../i18n";
import type { ApiResponse, HeaderPair, ParameterAnswers, TabState } from "../../types";
import { promptForParameters } from "./parameter-prompt";
import { runRequestExtractor } from "./run-extractor";
import { ensureTab } from "./ensure-tab";

const STREAM_EVENT = "restpilot:request-stream";

type StreamPayload = {
  request_id: string;
  chunk: string;
  done: boolean;
  status?: number;
  status_text?: string;
  headers?: HeaderPair[];
  duration_ms?: number;
  error?: string;
};

function handleStreamEvent(
  payload: StreamPayload,
  runId: string,
  tab: TabState,
  onFinished?: () => void
) {
  if (payload.request_id !== runId || tab.requestRunId !== runId) return;

  if (payload.error) {
    tab.error = payload.error;
    tab.streaming = false;
    scheduleResponseRender();
    onFinished?.();
    return;
  }

  if (payload.status !== undefined && payload.headers) {
    const body = tab.response?.body ?? "";
    tab.response = {
      status: payload.status,
      status_text: payload.status_text ?? "",
      duration_ms: payload.duration_ms ?? 0,
      headers: payload.headers,
      body,
      // Streaming is always decoded as UTF-8 text; body_size tracks the
      // running length and isn't meant to be byte-exact for multi-byte text.
      body_is_base64: false,
      body_size: body.length
    };
    tab.loading = false;
    tab.streaming = !payload.done;
    tab.error = null;
  }

  if (payload.chunk) {
    if (!tab.response) {
      tab.response = { status: 0, status_text: "", duration_ms: 0, headers: [], body: "", body_is_base64: false, body_size: 0 };
      tab.loading = false;
      tab.streaming = true;
    }
    tab.response.body += payload.chunk;
    tab.response.body_size = tab.response.body.length;
  }

  if (payload.done) {
    tab.streaming = false;
    if (tab.response && payload.duration_ms !== undefined) tab.response.duration_ms = payload.duration_ms;
    invalidateResponseRenderCache(tab);
    onFinished?.();
  }

  scheduleResponseRender();
}

export async function trySendRequest(refresh: () => void): Promise<void> {
  if (state.activePanel !== "request") return;
  const request = getActiveRequest();
  if (!request) return;
  const tab = ensureTab(request.id);
  if (tab.loading) return;

  if (request.bodyMode === "multipart" && hasMissingMultipartFiles(request)) {
    const labels = t().request;
    const names = missingMultipartFileNames(request).join(", ");
    await messageDialog(
      "warning",
      labels.multipartFilesMissingTitle,
      labels.multipartFilesMissingBody.replace("{names}", names)
    );
    return;
  }

  // Cancelling the prompt cancels the run, before anything goes on the wire.
  let answers: ParameterAnswers = {};
  if (requestParameterNames(request).length) {
    const given = await promptForParameters(request);
    if (given === null) return;
    answers = given;
  }

  await sendRequest(refresh, answers);
}

async function sendRequest(refresh: () => void, answers: ParameterAnswers): Promise<void> {
  const request = getActiveRequest();
  if (!request) return;
  const tab = ensureTab(request.id);
  const runId = id();
  let unlisten: UnlistenFn | undefined;
  let finishStream: (() => void) | undefined;

  tab.selectedSavedResponseId = "current";
  tab.loading = true;
  tab.streaming = false;
  tab.requestRunId = runId;
  tab.error = null;
  tab.response = null;
  invalidateResponseRenderCache(tab);
  refresh();

  try {
    const effectiveVariables = getEffectiveVariables();
    const headers = withContentType(request, buildRequestHeaders(request, answers));

    const streamFinished = request.streamResponse
      ? new Promise<void>((resolve) => {
          finishStream = resolve;
        })
      : null;

    if (request.streamResponse) {
      unlisten = await listen<StreamPayload>(STREAM_EVENT, (event) => {
        handleStreamEvent(event.payload, runId, tab, finishStream);
      });
    }

    let body = "";
    if (request.bodyMode === "raw") {
      body = applyVariables(request.body, effectiveVariables, answers);
    } else if (request.bodyMode === "graphql") {
      const query = applyVariables(request.body, effectiveVariables, answers);
      let variables: Record<string, unknown> = {};
      if (request.graphqlVariables) {
        try {
          variables = JSON.parse(applyVariables(request.graphqlVariables, effectiveVariables, answers));
        } catch {
          /* send as-is */
        }
      }
      body = JSON.stringify({ query, variables });
    } else if (request.bodyMode === "binary" && request.binaryFilePath) {
      try {
        const { readFile } = await import("@tauri-apps/plugin-fs");
        const fileBytes = await readFile(request.binaryFilePath);
        let binaryStr = "";
        for (let i = 0; i < fileBytes.length; i++) {
          binaryStr += String.fromCharCode(fileBytes[i]);
        }
        body = btoa(binaryStr);
      } catch {
        tab.error = "Failed to read binary file: " + request.binaryFilePath;
        tab.loading = false;
        refresh();
        return;
      }
    }

    const payload = {
      request: {
        id: runId,
        method: request.method,
        url: resolvedOutboundUrl(request, effectiveVariables, answers).trim(),
        headers,
        body_mode: request.bodyMode,
        raw_type: request.bodyMode === "graphql" ? "json" : request.rawType,
        body,
        form: buildFormPayload(request, answers),
        stream: request.streamResponse
      },
      ...httpTransportPayload(state.settings, request.streamResponse)
    };

    if (request.streamResponse) {
      await invoke("send_request", { payload });
      if (streamFinished) await streamFinished;
    } else {
      tab.response = await invoke<ApiResponse>("send_request", { payload });
      invalidateResponseRenderCache(tab);
    }

    tab.error = null;
    if (tab.response) {
      request.lastResponse = tab.response;
      request.lastError = null;
      scheduleSave();
      runRequestExtractor(request, tab.response);
    }
  } catch (error) {
    tab.error = error instanceof Error ? error.message : String(error);
    request.lastError = tab.error;
    scheduleSave();
  } finally {
    unlisten?.();
    tab.loading = false;
    tab.streaming = false;
    tab.requestRunId = null;
    refresh();
  }
}

export async function cancelActiveRequest(): Promise<void> {
  const request = getActiveRequest();
  const tab = request ? ensureTab(request.id) : null;
  if (!tab?.requestRunId) return;
  await invoke("cancel_request", { id: tab.requestRunId });
}
