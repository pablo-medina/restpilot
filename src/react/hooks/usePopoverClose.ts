import { useEffect } from "react";
import { state } from "../../app/state";
import { removePopovers } from "../../components/popover";
import { isAppActionTarget } from "../lib/app-action-targets";
import { closeRequestPopovers } from "../../ui/request-popovers";
import { bumpRenderGeneration } from "../render-bridge";

/** Closes open popovers when clicking outside them. */
export function usePopoverClose() {
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (isAppActionTarget(target)) return;
      const activePopover = document.querySelector(".app-popover");
      if (!activePopover) return;
      if (target.closest(".app-popover")) return;

      const isTrigger =
        target.closest(".request-popover-trigger") ||
        target.closest("#func-popover-params-btn") ||
        target.closest("#func-popover-headers-btn") ||
        target.closest("#func-popover-body-btn") ||
        target.closest("#func-popover-auth-btn") ||
        target.closest("#function-import-btn") ||
        target.closest("[data-popover-trigger]") ||
        target.closest(".env-chip") ||
        target.closest(".request-tool-btn") ||
        target.closest("[data-request-actions-trigger]");

      if (isTrigger) return;

      closeRequestPopovers();
      state.activeFunctionPopover = null;
      removePopovers();
      queueMicrotask(() => bumpRenderGeneration());
    }

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);
}
