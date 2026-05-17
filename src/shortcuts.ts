export type ShortcutHandlers = {
  send: () => void;
  closeTab: () => void;
  focusUrl: () => void;
};

const BOUND_KEY = "__restpilotShortcuts";

export function bindGlobalShortcuts(handlers: ShortcutHandlers) {
  const win = window as Window & { [BOUND_KEY]?: boolean };
  if (win[BOUND_KEY]) return;
  win[BOUND_KEY] = true;

  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.isComposing) return;
    if (document.querySelector(".app-dialog")) return;

    const mod = event.ctrlKey || event.metaKey;
    if (!mod) return;

    const inCodeMirror = Boolean((event.target as HTMLElement).closest(".cm-editor"));

    if (event.key === "Enter" && !inCodeMirror) {
      event.preventDefault();
      handlers.send();
      return;
    }

    if (event.key === "w" || event.key === "W") {
      event.preventDefault();
      handlers.closeTab();
      return;
    }

    if (event.shiftKey && (event.key === "u" || event.key === "U")) {
      event.preventDefault();
      handlers.focusUrl();
    }
  });
}
