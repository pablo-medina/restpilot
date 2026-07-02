import { useCallback, type PointerEvent as ReactPointerEvent } from "react";

/** Primary-button press handler for Tauri/WebView2 (click is unreliable near drag regions). */
export function useReliablePress(handler: () => void) {
  return useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      queueMicrotask(handler);
    },
    [handler]
  );
}

export function useReliablePressTarget(handler: (target: HTMLElement) => void) {
  return useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const target = event.currentTarget;
      queueMicrotask(() => handler(target));
    },
    [handler]
  );
}
