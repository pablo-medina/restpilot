import { bindWindowChrome } from "../../ui/window-chrome";
import { bindRequestPopoverTriggers } from "../../ui/request-popovers";

let overlayBindingsReady = false;

/** One-time document-level bindings for overlays rendered outside React. */
export function bindOverlayBindings(): void {
  if (overlayBindingsReady) return;
  overlayBindingsReady = true;

  bindRequestPopoverTriggers();
  bindWindowChrome();
}
