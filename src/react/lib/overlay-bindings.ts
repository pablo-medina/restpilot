import { bindWindowChrome } from "../../ui/window-chrome";
import { bindRequestPopoverTriggers, type VariableChangeHandler } from "../../ui/request-popovers";

let overlayBindingsReady = false;
export function bindOverlayBindings(onVariablesChanged?: VariableChangeHandler): void {
  if (overlayBindingsReady) return;
  overlayBindingsReady = true;

  bindRequestPopoverTriggers(onVariablesChanged);
  bindWindowChrome();
}
