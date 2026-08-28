import { listen } from "@tauri-apps/api/event";
import { pushToast } from "../components/Toast";

const SCRIPT_TOAST_EVENT = "restpilot:script-toast";

type ScriptToastEvent = { title: string; message: string };

/** The subscription lives as long as the app does, so the handle is never kept. */
let started = false;

/**
 * Shows what a script asked for with `ui.showToast`, wherever the run was started from.
 *
 * One subscription for the whole app rather than a hook per caller: a message is the script's
 * to send, and whether it reached the screen should not depend on which surface ran it. It
 * also arrives while the script is still going, the way `console` output does.
 *
 * Nothing is throttled. A loop firing eighty of these is the author's own doing, and a cap
 * would only make the honest cases harder to reason about.
 */
export async function startScriptToasts(): Promise<void> {
  if (started) return;
  started = true;
  try {
    await listen<ScriptToastEvent>(SCRIPT_TOAST_EVENT, (event) => {
      const { title, message } = event.payload;
      if (!message.trim() && !title.trim()) return;
      pushToast(message, { variant: "message", title });
    });
  } catch {
    // No Tauri runtime — nothing emits the event either, so there is nothing to report.
  }
}
