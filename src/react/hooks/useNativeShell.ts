import { useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";

/** Browser accelerators that have no meaning in a desktop app and only expose
 * webview plumbing: reload, print, the webview's own find bar, and view-source. */
function isWebShortcut(event: KeyboardEvent): boolean {
  const mod = event.ctrlKey || event.metaKey;
  if (event.key === "F5") return true;
  if (event.key === "F3") return true;
  if (!mod) return false;
  const key = event.key.toLowerCase();
  // Ctrl+R reload, Ctrl+P print, Ctrl+F find, Ctrl+U view source, Ctrl+G find next.
  if (key === "r" || key === "p" || key === "f" || key === "u" || key === "g") return true;
  // Ctrl +/-/0 zoom.
  return key === "+" || key === "-" || key === "=" || key === "0";
}

/** Suppresses leftover browser behaviour so the window behaves like a native app.
 *
 * Only active in release builds inside Tauri: during `tauri dev` (and in the plain
 * browser used for tests) reload and find stay available as development tools. */
export function useNativeShell(): void {
  useEffect(() => {
    if (import.meta.env.DEV || !isTauri()) return;

    function handleKeydown(event: KeyboardEvent) {
      if (!isWebShortcut(event)) return;
      // Ctrl+U is the app's own "focus URL" chord when combined with Shift.
      if (event.shiftKey && event.key.toLowerCase() === "u") return;
      event.preventDefault();
      event.stopPropagation();
    }

    function handleWheel(event: WheelEvent) {
      if (event.ctrlKey) event.preventDefault();
    }

    // Tauri's drag-drop handler already stops the webview from navigating to a
    // dropped file, but the guard costs nothing and covers the webview fallback.
    function handleDragDrop(event: DragEvent) {
      event.preventDefault();
    }

    document.addEventListener("keydown", handleKeydown, true);
    document.addEventListener("wheel", handleWheel, { passive: false });
    document.addEventListener("dragover", handleDragDrop);
    document.addEventListener("drop", handleDragDrop);
    return () => {
      document.removeEventListener("keydown", handleKeydown, true);
      document.removeEventListener("wheel", handleWheel);
      document.removeEventListener("dragover", handleDragDrop);
      document.removeEventListener("drop", handleDragDrop);
    };
  }, []);
}
