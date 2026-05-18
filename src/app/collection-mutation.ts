import { render } from "./render";
import { scheduleSave } from "./persistence";

let refreshCollectionTree: (() => void) | null = null;

/** Registered from app.ts to re-render the explorer tree without a full app shell rebuild. */
export function setCollectionTreeRefresh(handler: () => void) {
  refreshCollectionTree = handler;
}

/** Call after AI tools or other code mutates `state.items`. */
export function notifyCollectionChanged() {
  scheduleSave();
  refreshCollectionTree?.();
  render();
}
