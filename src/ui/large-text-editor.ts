import { tryPrettifyJson } from "../lib/content-display";
import { pushToast } from "../react/components/Toast";
import { t } from "../i18n";
import { json } from "@codemirror/lang-json";
import { xml } from "@codemirror/lang-xml";
import { javascript } from "@codemirror/lang-javascript";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
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

/** Highlight colours come from the `--rp-syntax-*` tokens rather than a hardcoded
 * light/dark pair: CodeMirror writes these values straight into its stylesheet, so
 * the custom properties resolve per theme and any future theme is picked up without
 * touching this file. It also keeps the editor in step with the `.json-*` / `.xml-*`
 * classes the response viewer uses, which read the same tokens. */
const highlightStyle = HighlightStyle.define([
  { tag: tags.propertyName, color: "var(--rp-syntax-key)" },
  { tag: tags.string, color: "var(--rp-syntax-string)" },
  { tag: tags.number, color: "var(--rp-syntax-number)" },
  { tag: tags.bool, color: "var(--rp-syntax-bool)" },
  { tag: tags.null, color: "var(--rp-syntax-null)" },
  { tag: tags.keyword, color: "var(--rp-syntax-bool)" },
  { tag: tags.comment, color: "var(--rp-syntax-comment)", fontStyle: "italic" },
  { tag: tags.punctuation, color: "var(--rp-syntax-punctuation)" },
  { tag: tags.bracket, color: "var(--rp-syntax-punctuation)" },
  { tag: tags.tagName, color: "var(--rp-syntax-key)" },
  { tag: tags.attributeName, color: "var(--rp-syntax-string)" }
]);

function syntaxTheme() {
  return syntaxHighlighting(highlightStyle, { fallback: true });
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

/** Ctrl/Cmd+Shift+F — the VS Code "format document" shortcut, on a JSON body. A body that
 * does not parse used to leave the key doing nothing at all, which is indistinguishable
 * from a broken shortcut, so say why instead. */
function prettifyJsonKeymap(rawType: ViewerMode, onChange: (value: string) => void) {
  return keymap.of([
    {
      key: "Mod-Shift-f",
      run(view) {
        if (rawType !== "json") return false;
        const current = view.state.doc.toString();
        if (!current.trim()) return true;

        const pretty = tryPrettifyJson(current);
        if (!pretty) {
          pushToast(t().messages.formatJsonFailed);
          return true;
        }
        if (pretty === current) return true;

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

function bodyPasteHandler(rawType: ViewerMode, autoPrettifyJson: boolean) {
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
    bodyPasteHandler(rawType, autoPrettifyJson),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) onChange(update.state.doc.toString());
    })
  ];

  const state = EditorState.create({ doc: initial, extensions });
  const view = new EditorView({ state, parent: host });
  (host as HTMLElement & { __cmView?: EditorView }).__cmView = view;
  return () => destroyView(host, view);
}

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
