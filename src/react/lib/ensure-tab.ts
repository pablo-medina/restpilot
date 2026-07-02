import { getRequest, state } from "../../app/state";
import type { TabState } from "../../types";

export function ensureTab(requestId: string): TabState {
  const request = getRequest(requestId);
  if (!state.tabs[requestId]) {
    state.tabs[requestId] = {
      requestId,
      response: request?.lastResponse ?? null,
      error: request?.lastError ?? null,
      loading: false,
      streaming: false,
      requestRunId: null,
      selectedResponseTab: "body",
      selectedRequestTab: "body",
      selectedSavedResponseId: "current"
    };
  }
  const tab = state.tabs[requestId];
  if (!tab.selectedRequestTab) tab.selectedRequestTab = "body";
  return tab;
}
