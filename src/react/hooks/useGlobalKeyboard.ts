import { useEffect } from "react";
import { state } from "../../app/state";
import { removePopovers } from "../../components/popover";
import { closeRequestPopovers } from "../../ui/request-popovers";
import { closeRequestTab } from "../lib/tab-actions";
import { trySendRequest } from "../lib/request-send";
import { bumpRenderGeneration } from "../render-bridge";

function focusRequestUrl() {
  const urlInput = document.querySelector<HTMLInputElement>("#url");
  if (!urlInput) return;
  urlInput.focus();
  urlInput.select();
}

/** Mounts all global keyboard handlers: shortcuts and popover close. */
export function useGlobalKeyboard() {
  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing) return;
      const hasDialog = Boolean(document.querySelector(".app-dialog"));
      const mod = event.ctrlKey || event.metaKey;
      const inCodeMirror = Boolean((event.target as HTMLElement).closest(".cm-editor"));

      // Escape — close popovers and context menus
      if (event.key === "Escape") {
        const activePopover = document.querySelector(".app-popover");
        if (activePopover) {
          event.stopPropagation();
          closeRequestPopovers();
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
