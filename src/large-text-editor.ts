import { tryPrettifyJson } from "./content-display";
import { json } from "@codemirror/lang-json";
import { xml } from "@codemirror/lang-xml";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { history, historyKeymap } from "@codemirror/commands";
import { EditorSelection, EditorState, Transaction, type ChangeSpec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import type { RawType } from "./types";

export type ViewerMode = RawType;

export type BodyEditorOptions = {
  tabSize: number;
  rawType: RawType;
  autoPrettifyJson?: boolean;
  onChange: (value: string) => void;
  onSend?: () => void;
};

export function clampTabSize(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 2;
  return Math.max(1, Math.min(8, Math.round(parsed)));
}

function codeEditorTheme() {
  return EditorView.theme({
    "&": { height: "100%" },
    ".cm-scroller": {
      fontFamily: '"Cascadia Code", "SFMono-Regular", Consolas, monospace',
      fontSize: "13px",
      lineHeight: "1.5"
    },
    ".cm-content": { padding: "10px" },
    "&.cm-focused": { outline: "none" }
  });
}

/** Tab inserts spaces at the cursor; Shift+Tab removes spaces immediately before the cursor. */
function insertTabKeymap(tabSize: number) {
  const width = clampTabSize(tabSize);
  const spaces = " ".repeat(width);

  return keymap.of([
    {
      key: "Tab",
      run(view) {
        view.dispatch(view.state.replaceSelection(spaces));
        return true;
      }
    },
    {
      key: "Shift-Tab",
      run(view) {
        const changes: ChangeSpec[] = [];
        const ranges = view.state.selection.ranges;
        for (const range of ranges) {
          const line = view.state.doc.lineAt(range.from);
          const before = view.state.doc.sliceString(line.from, range.from);
          const removable = Math.min(width, before.length, before.match(/ *$/)?.[0]?.length ?? 0);
          if (removable > 0) {
            changes.push({ from: range.from - removable, to: range.from, insert: "" });
          }
        }
        if (!changes.length) return false;
        view.dispatch(view.state.update({ changes }));
        return true;
      }
    }
  ]);
}

function sendKeymap(onSend?: () => void) {
  if (!onSend) return keymap.of([]);
  return keymap.of([
    {
      key: "Mod-Enter",
      run: () => {
        onSend();
        return true;
      }
    }
  ]);
}

function prettifyJsonKeymap(rawType: RawType, onChange: (value: string) => void) {
  return keymap.of([
    {
      key: "Mod-Shift-f",
      run(view) {
        if (rawType !== "json") return false;
        const current = view.state.doc.toString();
        const pretty = tryPrettifyJson(current);
        if (!pretty || pretty === current) return false;
        view.dispatch({
          changes: { from: 0, to: current.length, insert: pretty },
          selection: EditorSelection.cursor(pretty.length)
        });
        onChange(pretty);
        return true;
      }
    }
  ]);
}

function bodyPasteHandler(rawType: RawType, autoPrettifyJson: boolean, onChange: (value: string) => void) {
  return EditorView.domEventHandlers({
    paste(event, view) {
      if (!autoPrettifyJson || rawType !== "json") return false;
      const text = event.clipboardData?.getData("text/plain") ?? "";
      const pretty = tryPrettifyJson(text);
      if (!pretty) return false;

      event.preventDefault();
      const ranges = view.state.selection.ranges;
      const changes = ranges.map((range) => ({ from: range.from, to: range.to, insert: pretty }));
      const head = ranges[0].from + pretty.length;
      view.dispatch({
        changes,
        selection: EditorSelection.cursor(head)
      });
      return true;
    }
  });
}

function baseExtensions(editable: boolean, tabSize: number) {
  const extensions = [
    EditorView.lineWrapping,
    codeEditorTheme(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    insertTabKeymap(tabSize),
    EditorState.readOnly.of(!editable),
    EditorView.editable.of(editable)
  ];
  if (editable) {
    extensions.unshift(history(), keymap.of([...historyKeymap]));
  }
  return extensions;
}

function languageExtension(mode: ViewerMode) {
  if (mode === "json") return json();
  if (mode === "xml") return xml();
  return [];
}

export function mountBodyEditor(host: HTMLElement, initial: string, options: BodyEditorOptions): () => void {
  const { tabSize, rawType, autoPrettifyJson = false, onChange } = options;
  host.classList.add("cm-host");
  const extensions = [
    ...baseExtensions(true, tabSize),
    languageExtension(rawType),
    sendKeymap(options.onSend),
    prettifyJsonKeymap(rawType, onChange),
    bodyPasteHandler(rawType, autoPrettifyJson, onChange),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) onChange(update.state.doc.toString());
    })
  ];

  const state = EditorState.create({ doc: initial, extensions });
  const view = new EditorView({ state, parent: host });
  (host as HTMLElement & { __cmView?: EditorView }).__cmView = view;
  return () => destroyView(host, view);
}

/** @deprecated Use mountBodyEditor */
export const mountLargeTextEditor = mountBodyEditor;

export function mountReadonlyViewer(host: HTMLElement, initial: string, mode: ViewerMode, tabSize = 2): () => void {
  host.classList.add("cm-host", "cm-readonly");
  const extensions = [...baseExtensions(false, tabSize), languageExtension(mode)];
  const state = EditorState.create({ doc: initial, extensions });
  const view = new EditorView({ state, parent: host });
  (host as HTMLElement & { __cmView?: EditorView }).__cmView = view;
  return () => destroyView(host, view);
}

export function setReadonlyViewerValue(host: HTMLElement, value: string): boolean {
  const view = (host as HTMLElement & { __cmView?: EditorView }).__cmView ?? EditorView.findFromDOM(host);
  if (!view) return false;
  const current = view.state.doc.toString();
  if (current === value) return true;
  view.dispatch({
    changes: { from: 0, to: current.length, insert: value },
    annotations: Transaction.addToHistory.of(false)
  });
  return true;
}

export function setBodyEditorValue(host: HTMLElement, value: string): boolean {
  return setReadonlyViewerValue(host, value);
}

export function prettifyBodyEditor(host: HTMLElement): boolean {
  const view = (host as HTMLElement & { __cmView?: EditorView }).__cmView ?? EditorView.findFromDOM(host);
  if (!view) return false;
  const current = view.state.doc.toString();
  const pretty = tryPrettifyJson(current);
  if (!pretty || pretty === current) return false;
  view.dispatch({
    changes: { from: 0, to: current.length, insert: pretty },
    selection: EditorSelection.cursor(pretty.length)
  });
  return true;
}

function destroyView(host: HTMLElement, view: EditorView) {
  delete (host as HTMLElement & { __cmView?: EditorView }).__cmView;
  view.destroy();
  host.classList.remove("cm-host", "cm-readonly");
  host.replaceChildren();
}

/** @deprecated Use setBodyEditorValue */
export const setLargeTextEditorValue = setBodyEditorValue;
