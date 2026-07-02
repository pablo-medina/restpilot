import { syncRequestPopover } from "../ui/request-popovers";
import { unmountResponseDisplays } from "../ui/response-panel";
import { closeAutocomplete } from "../ui/variable-autocomplete";
import { bumpRenderGeneration } from "../react/render-bridge";
import { state } from "./state";
import type { TabState } from "../types";

function invalidateLineCache(tab: TabState) {
  tab.bodyLinesKey = undefined;
  tab.bodyLineOffsets = undefined;
  tab.bodyLineScanLength = undefined;
  tab.responseDisplayKey = undefined;
  tab.responseDisplayBody = undefined;
}

export function unmountRequestTabEditors(requestId: string | null | undefined): void {
  if (!requestId) return;
  const tab = state.tabs[requestId];
  if (!tab) return;

  tab.displayUnmount?.();
  tab.displayUnmount = undefined;
  tab.bodyEditorUnmount?.();
  tab.bodyEditorUnmount = undefined;
  tab.gqlQueryUnmount?.();
  tab.gqlQueryUnmount = undefined;
  tab.gqlVarsUnmount?.();
  tab.gqlVarsUnmount = undefined;
  unmountResponseDisplays(tab);
  invalidateLineCache(tab);
}

export function refreshRequestWorkspace(): void {
  closeAutocomplete();
  bumpRenderGeneration();
  if (state.openRequestPopover) {
    requestAnimationFrame(() => syncRequestPopover());
  }
}
