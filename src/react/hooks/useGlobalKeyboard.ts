import { useEffect } from "react";
import { state } from "../../app/state";
import { removePopovers } from "../../components/popover";
import { closeRequestPopovers } from "../../ui/request-popovers";
import { runFunctionExtractor } from "../lib/function-runtime";
import { closeRequestTab } from "../lib/tab-actions";
import { trySendRequest } from "../lib/request-send";
import { bumpRenderGeneration } from "../render-bridge";

function focusRequestUrl() {
  const urlInput = document.querySelector<HTMLInputElement>("#url");
  if (!urlInput) return;
  urlInput.focus();
  urlInput.select();
}

/** Mounts all global keyboard handlers: shortcuts, function extractor, popover close. */
export function useGlobalKeyboard() {
  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing) return;
      const hasDialog = Boolean(document.querySelector(".app-dialog"));
      const mod = event.ctrlKey || event.metaKey;
      const inCodeMirror = Boolean((event.target as HTMLElement).closest(".cm-editor"));

      // F9 / Ctrl+Enter — function extractor (when functions panel active)
      if (state.activePanel === "functions" && state.activeFunctionId) {
        const isF9 = event.key === "F9";
        const isCtrlEnter = mod && event.key === "Enter";
        if (isF9 || isCtrlEnter) {
          if (isCtrlEnter && inCodeMirror) { /* let CM handle it */ }
          else {
            event.preventDefault();
            const func = state.functions.find((f) => f.id === state.activeFunctionId);
            if (func) void runFunctionExtractor(func, bumpRenderGeneration);
            return;
          }
        }
      }

      // Escape — close popovers and context menus
      if (event.key === "Escape") {
        const activePopover = document.querySelector(".app-popover");
        if (activePopover) {
          event.stopPropagation();
          closeRequestPopovers();
          state.activeFunctionPopover = null;
          removePopovers();
          bumpRenderGeneration();
          return;
        }
      }

      // Global shortcuts (Ctrl+Enter send, Ctrl+W close, Ctrl+Shift+U focus URL)
      if (hasDialog || !mod) return;

      if (event.key === "Enter" && !inCodeMirror) {
        event.preventDefault();
        void trySendRequest(bumpRenderGeneration);
        return;
      }

      if (event.key === "w" || event.key === "W") {
        event.preventDefault();
        if (state.activeTabId) closeRequestTab(state.activeTabId, bumpRenderGeneration);
        return;
      }

      if (event.shiftKey && (event.key === "u" || event.key === "U")) {
        event.preventDefault();
        focusRequestUrl();
      }
    }

    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  }, []);
}
