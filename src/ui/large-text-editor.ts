import { tryPrettifyJson } from "../lib/content-display";
import { json } from "@codemirror/lang-json";
import { xml } from "@codemirror/lang-xml";
import { javascript } from "@codemirror/lang-javascript";
import { defaultHighlightStyle, HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { history, historyKeymap } from "@codemirror/commands";
import { tags } from "@lezer/highlight";
import { EditorSelection, EditorState, Transaction, type ChangeSpec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { clampTabSize, type RawType } from "../types";

export type ViewerMode = RawType | "javascript";

export type BodyEditorOptions = {
  tabSize: number;
  rawType: ViewerMode;
  autoPrettifyJson?: boolean;
  onChange: (value: string) => void;
  onSend?: () => void;
};

const darkHighlightStyle = HighlightStyle.define([
  { tag: tags.propertyName, color: "#b4d4e8" },
  { tag: tags.string, color: "#f0a8c8" },
  { tag: tags.number, color: "#e8a868" },
  { tag: tags.bool, color: "#c4a0f0" },
  { tag: tags.null, color: "#9a8cb8" },
  { tag: tags.keyword, color: "#c4a0f0" },
  { tag: tags.comment, color: "#7a756c", fontStyle: "italic" },
  { tag: tags.punctuation, color: "#8a847c" },
  { tag: tags.bracket, color: "#8a847c" },
  { tag: tags.tagName, color: "#b4d4e8" },
  { tag: tags.attributeName, color: "#f0a8c8" }
]);

function syntaxTheme() {
  const dark = document.documentElement.dataset.theme === "dark";
  return syntaxHighlighting(dark ? darkHighlightStyle : defaultHighlightStyle, { fallback: true });
}

function codeEditorTheme() {
  return EditorView.theme({
    "&": { height: "100%" },
    ".cm-scroller": {
      fontFamily: '"Cascadia Code", "SFMono-Regular", Consolas, monospace',
      fontSize: "13px",
      lineHeight: "1.5"
    },
    // CodeMirror's base theme hardcodes `caret-color: black`, which makes the cursor
    // invisible on a dark background. Follow the app's text color instead so the caret
    // stays visible in both themes.
    ".cm-content": { padding: "10px", caretColor: "var(--rp-text)" },
    ".cm-cursor, .cm-cursor-primary": { borderLeftColor: "var(--rp-text)" },
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

function prettifyJsonKeymap(rawType: ViewerMode, onChange: (value: string) => void) {
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

function bodyPasteHandler(rawType: ViewerMode, autoPrettifyJson: boolean, onChange: (value: string) => void) {
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
    syntaxTheme(),
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
  if (mode === "javascript") return javascript();
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
