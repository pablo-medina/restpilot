import { isAppActionTarget } from "../react/lib/app-action-targets";
import { state } from "../app/state";
import { bumpRenderGeneration } from "../react/render-bridge";

export type RequestPopoverKind = "environment";
export type VariableChangeHandler = () => void;

let handlersBound = false;
let variablesChangedHook: VariableChangeHandler | null = null;

export function setRequestPopoverHooks(hooks: { onVariablesChanged?: VariableChangeHandler }) {
  variablesChangedHook = hooks.onVariablesChanged ?? null;
}

export function closeRequestPopovers() {
  if (!state.openRequestPopover) return;
  state.openRequestPopover = null;
  bumpRenderGeneration();
}

export function syncRequestPopover() {
  bumpRenderGeneration();
}

export function bindRequestPopoverTriggers(onVariablesChanged?: VariableChangeHandler) {
  if (onVariablesChanged) variablesChangedHook = onVariablesChanged;
  ensurePopoverHandlers();
}

function togglePopover(kind: RequestPopoverKind) {
  // Let React unmount the context menu portal itself; do not touch its DOM node directly
  // (removing it manually here races with React's reconciliation and crashes the app).
  state.contextMenu = null;

  if (state.openRequestPopover === kind) {
    closeRequestPopovers();
    return;
  }
  state.openRequestPopover = kind;
  syncRequestPopover();
  bumpRenderGeneration();
}

export function toggleRequestPopover(kind: RequestPopoverKind) {
  togglePopover(kind);
}

function ensurePopoverHandlers() {
  if (handlersBound) return;
  handlersBound = true;

  document.addEventListener(
    "click",
    (event) => {
      if (!state.openRequestPopover) return;
      const target = event.target as HTMLElement;
      if (isAppActionTarget(target)) return;
      if (target.closest(".app-popover")) return;
      if (target.closest("#request-env-btn")) return;
      queueMicrotask(() => closeRequestPopovers());
    },
    true
  );

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.openRequestPopover) {
      event.stopPropagation();
      closeRequestPopovers();
    }
  });
}
