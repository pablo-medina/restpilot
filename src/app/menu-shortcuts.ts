const isApple =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

function modKey() {
  return isApple ? "⌘" : "Ctrl";
}

/** Display labels for context menu shortcut hints (aligned with app keybindings). */
export const menuShortcuts = {
  cut: () => `${modKey()}+X`,
  copy: () => `${modKey()}+C`,
  paste: () => `${modKey()}+V`,
  undo: () => `${modKey()}+Z`,
  redo: () => (isApple ? `${modKey()}+Shift+Z` : "Ctrl+Y"),
  selectAll: () => `${modKey()}+A`,
  closeTab: () => `${modKey()}+W`,
  rename: () => "F2",
  delete: () => "Del"
};
