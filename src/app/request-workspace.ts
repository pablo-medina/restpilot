import { invalidateResponseRenderCache } from "../lib/content-display";
import { state } from "./state";

/** Drop cached response rendering for a tab whose editors are being torn down by React. */
export function unmountRequestTabEditors(requestId: string | null | undefined): void {
  if (!requestId) return;
  const tab = state.tabs[requestId];
  if (!tab) return;

  invalidateResponseRenderCache(tab);
}
