import { useEffect } from "react";
import { ensureContextMenuHandlers } from "../../app";

/**
 * Registers global contextmenu / keyboard-menu triggers and outside-click dismissal.
 * The actual menu rendering lives in app.ts until Phase 5 replaces it with a React portal.
 */
export function useContextMenuTrigger() {
  useEffect(() => {
    ensureContextMenuHandlers();
  }, []);
}
