import type { EditorView } from "@codemirror/view";
import { escapeHtml } from "../content-display";
import { t } from "../i18n";
import { codeMirrorViewFromTarget } from "./codemirror-view";
import { menuShortcuts } from "./menu-shortcuts";
import type { ContextMenuState } from "./state";

export { codeMirrorViewFromTarget } from "./codemirror-view";

export function contextMenuButton(
  action: string,
  label: string,
  options: { shortcut?: string; enabled?: boolean; danger?: boolean; checked?: boolean } = {}
): string {
  const { shortcut, enabled = true, danger = false } = options;
  const shortcutHtml = shortcut
    ? `<span class="context-menu-shortcut">${escapeHtml(shortcut)}</span>`
    : "";
  const checkHtml =
    "checked" in options
      ? `<span class="context-menu-check" aria-hidden="true">${options.checked ? "✓" : ""}</span>`
      : "";
  return `<button data-menu-action="${action}" type="button"${danger ? ' class="danger"' : ""}${
    enabled ? "" : " disabled"
  }>${checkHtml}<span class="context-menu-label">${escapeHtml(label)}</span>${shortcutHtml}</button>`;
}

export type TextContextFlags = {
  canCut: boolean;
  canCopy: boolean;
  canCopySelection: boolean;
  canPaste: boolean;
  canSelectAll: boolean;
  /** Set only for editable surfaces that support undo/redo. */
  canUndo?: boolean;
  canRedo?: boolean;
};

async function cmCopy(view: EditorView): Promise<void> {
  const { from, to } = view.state.selection.main;
  const text = from === to ? view.state.doc.toString() : view.state.sliceDoc(from, to);
  if (!text) return;
  await navigator.clipboard.writeText(text);
}

async function cmCopySelection(view: EditorView): Promise<void> {
  const { from, to } = view.state.selection.main;
  if (from === to) return;
  await navigator.clipboard.writeText(view.state.sliceDoc(from, to));
}

function responseBodyRoot(target?: HTMLElement | null): HTMLElement | null {
  if (target) {
    const fromTarget = target.closest(
      ".response-body, [data-response-body-viewer], [data-response-body-stream]"
    );
    if (fromTarget instanceof HTMLElement) return fromTarget;
  }
  return document.querySelector<HTMLElement>(
    "[data-response-body-viewer], [data-response-body-stream], .response-card .response-body:not(.response-body-viewer)"
  );
}

/** Whether the response body has a non-empty text selection (CodeMirror or native). */
export function hasResponseBodySelection(target?: HTMLElement | null): boolean {
  const bodyRoot = responseBodyRoot(target);
  if (!bodyRoot) return false;

  const view =
    (target ? codeMirrorViewFromTarget(target) : null) ??
    (() => {
      const editor = bodyRoot.querySelector(".cm-editor");
      return editor ? codeMirrorViewFromTarget(editor) : null;
    })();
  if (view && bodyRoot.contains(view.dom)) {
    return !view.state.selection.main.empty;
  }

  const selection = window.getSelection();
  return Boolean(
    selection &&
      !selection.isCollapsed &&
      selection.toString().length > 0 &&
      selection.anchorNode &&
      bodyRoot.contains(selection.anchorNode)
  );
}

export async function copyResponseBodySelection(target?: HTMLElement | null): Promise<void> {
  const bodyRoot = responseBodyRoot(target);
  if (!bodyRoot) return;

  const view =
    (target ? codeMirrorViewFromTarget(target) : null) ??
    (() => {
      const editor = bodyRoot.querySelector(".cm-editor");
      return editor ? codeMirrorViewFromTarget(editor) : null;
    })();
  if (view && bodyRoot.contains(view.dom)) {
    await cmCopySelection(view);
    return;
  }

  const selection = window.getSelection();
  if (selection && !selection.isCollapsed && selection.anchorNode && bodyRoot.contains(selection.anchorNode)) {
    await navigator.clipboard.writeText(selection.toString());
  }
}

async function cmCut(view: EditorView): Promise<void> {
  if (view.state.readOnly) return;
  const { from, to } = view.state.selection.main;
  if (from === to) return;
  const text = view.state.sliceDoc(from, to);
  await navigator.clipboard.writeText(text);
  view.dispatch({ changes: { from, to, insert: "" } });
}

async function cmPaste(view: EditorView): Promise<void> {
  if (view.state.readOnly) return;
  const text = await navigator.clipboard.readText();
  const { from, to } = view.state.selection.main;
  const { EditorSelection } = await import("@codemirror/state");
  view.dispatch({
    changes: { from, to, insert: text },
    selection: EditorSelection.cursor(from + text.length)
  });
}

export function resolveTextContextMenu(target: HTMLElement): TextContextFlags | null {
  const view = codeMirrorViewFromTarget(target);
  if (view) {
    const selected = !view.state.selection.main.empty;
    const editable = view.state.readOnly === false;
    return {
      canCut: editable && selected,
      canCopy: selected || view.state.doc.length > 0,
      canCopySelection: selected,
      canPaste: editable,
      canSelectAll: view.state.doc.length > 0,
      ...(editable ? { canUndo: true, canRedo: true } : {})
    };
  }

  const field = target.closest(
    "input:not([type=checkbox]):not([type=file]):not([type=hidden]), textarea"
  ) as HTMLInputElement | HTMLTextAreaElement | null;
  if (field && !field.disabled) {
    const start = field.selectionStart ?? 0;
    const end = field.selectionEnd ?? 0;
    const selected = start !== end;
    const editable = !field.readOnly;
    const supportsHistory =
      editable &&
      (typeof document.queryCommandSupported !== "function" ||
        document.queryCommandSupported("undo") ||
        document.queryCommandSupported("redo"));
    return {
      canCut: editable && selected,
      canCopy: selected || field.value.length > 0,
      canCopySelection: selected,
      canPaste: editable,
      canSelectAll: field.value.length > 0,
      ...(supportsHistory ? { canUndo: true, canRedo: true } : {})
    };
  }

  if (
    target.closest(
      ".response-body:not(.response-body-viewer), .response-body-stream, .headers-table-key, .headers-table-value"
    )
  ) {
    const selection = window.getSelection();
    const selected = Boolean(selection && !selection.isCollapsed && selection.toString().length > 0);
    return {
      canCut: false,
      canCopy: selected,
      canCopySelection: selected,
      canPaste: false,
      canSelectAll: true
    };
  }

  return null;
}

function activeTextField(): HTMLInputElement | HTMLTextAreaElement | null {
  const el = document.activeElement;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (el.disabled || el.type === "checkbox" || el.type === "file" || el.type === "hidden") return null;
    return el;
  }
  return null;
}

export async function runTextMenuAction(action: string): Promise<void> {
  const view =
    codeMirrorViewFromTarget(document.activeElement) ??
    codeMirrorViewFromTarget(document.querySelector(".cm-editor:focus-within"));

  if (view) {
    if (action === "text-cut") await cmCut(view);
    else if (action === "text-copy") await cmCopy(view);
    else if (action === "text-copy-selection") await cmCopySelection(view);
    else if (action === "text-paste") await cmPaste(view);
    else if (action === "text-undo" || action === "text-redo") {
      const { undo, redo } = await import("@codemirror/commands");
      if (action === "text-undo") undo(view);
      else redo(view);
    } else if (action === "text-select-all") {
      const { EditorSelection } = await import("@codemirror/state");
      view.dispatch({ selection: EditorSelection.single(0, view.state.doc.length) });
      view.focus();
    }
    return;
  }

  const field = activeTextField();
  if (field) {
    if (action === "text-cut") document.execCommand("cut");
    else if (action === "text-copy" || action === "text-copy-selection") document.execCommand("copy");
    else if (action === "text-paste") document.execCommand("paste");
    else if (action === "text-undo") document.execCommand("undo");
    else if (action === "text-redo") document.execCommand("redo");
    else if (action === "text-select-all") field.select();
    return;
  }

  if (action === "text-copy" || action === "text-copy-selection" || action === "text-select-all") {
    const block = document.querySelector<HTMLElement>(
      ".response-body:not(.response-body-viewer), .response-body-stream, .headers-table-key:focus-within, .headers-table-value:focus-within"
    );
    const selection = window.getSelection();
    if (
      (action === "text-copy" || action === "text-copy-selection") &&
      selection &&
      !selection.isCollapsed
    ) {
      await navigator.clipboard.writeText(selection.toString());
      return;
    }
    if (block && action === "text-copy") {
      await navigator.clipboard.writeText(block.textContent ?? "");
      return;
    }
    if (block && action === "text-select-all") {
      const range = document.createRange();
      range.selectNodeContents(block);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }
}

export function renderTextContextMenuMarkup(menu: Extract<ContextMenuState, { kind: "text" }>): string {
  const labels = t().contextMenu;
  const btn = (action: string, label: string, enabled: boolean, shortcut?: string) =>
    contextMenuButton(action, label, { enabled, shortcut });

  const undoRedo =
    menu.canUndo !== undefined
      ? `<hr>${btn("text-undo", labels.undo, menu.canUndo, menuShortcuts.undo())}${btn(
          "text-redo",
          labels.redo,
          menu.canRedo ?? false,
          menuShortcuts.redo()
        )}`
      : "";

  return `
    <div class="context-menu" style="left:${menu.x}px;top:${menu.y}px">
      ${btn("text-cut", labels.cut, menu.canCut, menuShortcuts.cut())}
      ${btn("text-copy", labels.copy, menu.canCopy, menuShortcuts.copy())}
      ${menu.canCopySelection ? btn("text-copy-selection", labels.copySelection, true, menuShortcuts.copy()) : ""}
      ${btn("text-paste", labels.paste, menu.canPaste, menuShortcuts.paste())}
      ${undoRedo}
      <hr>
      ${btn("text-select-all", labels.selectAll, menu.canSelectAll, menuShortcuts.selectAll())}
    </div>
  `;
}
