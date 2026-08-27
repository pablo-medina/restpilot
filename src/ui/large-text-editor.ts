import { tryPrettifyJson } from "../lib/content-display";
import { pushToast } from "../react/components/Toast";
import { t } from "../i18n";
import { json } from "@codemirror/lang-json";
import { xml } from "@codemirror/lang-xml";
import { javascript } from "@codemirror/lang-javascript";
import { bracketMatching, HighlightStyle, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import {
  acceptCompletion,
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  type Completion,
  type CompletionContext,
  type CompletionResult
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { tags } from "@lezer/highlight";
import { EditorSelection, EditorState, Prec, Transaction, type ChangeSpec } from "@codemirror/state";
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers
} from "@codemirror/view";
import { clampTabSize, type RawType } from "../types";

export type ViewerMode = RawType | "javascript";

export type BodyEditorOptions = {
  tabSize: number;
  rawType: ViewerMode;
  autoPrettifyJson?: boolean;
  onChange: (value: string) => void;
  onSend?: () => void;
  /** Turns on the code-editing extras: gutter, brackets, completion of what is in scope. */
  script?: boolean;
  /** Library functions offered after `lib.`, with their signatures. Read through a getter so
   * signatures that resolve after the editor mounted are still offered. */
  library?: () => readonly LibraryCompletion[];
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

/** One library function as the editor offers it: what to insert, and what it takes. */
export type LibraryCompletion = {
  name: string;
  /** Rendered beside the name, e.g. `(dni: string, monto: number)`. */
  signature: string;
  /** Whether to leave the cursor between the parentheses after inserting. */
  takesArguments: boolean;
};

/** What a library script has in scope, so the editor can offer it rather than leaving the
 * author to remember. Kept in step with the prelude in `src-tauri/src/script.rs`. */
const SCRIPT_GLOBALS: Completion[] = [
  { label: "env", type: "variable", detail: "RestPilot variables" },
  { label: "lib", type: "variable", detail: "the script library" },
  { label: "response", type: "variable", detail: "the response, when there is one" },
  { label: "args", type: "variable", detail: "the arguments this run was given" },
  { label: "console", type: "variable", detail: "log / warn / error" },
  { label: "ui", type: "variable", detail: "showToast" }
];

const MEMBERS: Record<string, Completion[]> = {
  console: [
    { label: "log", type: "method" },
    { label: "warn", type: "method" },
    { label: "error", type: "method" }
  ],
  ui: [{ label: "showToast", type: "method" }],
  response: [
    { label: "status", type: "property" },
    { label: "statusText", type: "property" },
    { label: "headers", type: "property" },
    { label: "body", type: "property" }
  ]
};

/**
 * Completion for what the engine puts in scope, plus the library by name.
 *
 * Deliberately small: it offers what this app provides and leaves JavaScript itself to the
 * language extension. A half-remembered subset of the standard library would be worse than
 * offering none at all.
 */
export function scriptCompletions(getLibrary: () => readonly LibraryCompletion[]) {
  const toOption = (entry: LibraryCompletion): Completion => ({
    label: entry.name,
    type: "function",
    detail: entry.signature,
    // Inserting the parentheses and landing between them is the point: the next thing to
    // write is the arguments, and the list has just said which ones.
    apply: (view, _completion, from, to) => {
      const inside = from + entry.name.length + 1;
      view.dispatch({
        changes: { from, to, insert: entry.name + "()" },
        selection: { anchor: entry.takesArguments ? inside : inside + 1 }
      });
    }
  });

  return (context: CompletionContext): CompletionResult | null => {
    const member = context.matchBefore(/\w+\.\w*/);
    if (member) {
      const owner = member.text.slice(0, member.text.indexOf("."));
      const options = owner === "lib" ? getLibrary().map(toOption) : MEMBERS[owner];
      if (!options?.length) return null;
      return { from: member.from + owner.length + 1, options, validFor: /^\w*$/ };
    }

    const word = context.matchBefore(/\w+/);
    if (!word || (word.from === word.to && !context.explicit)) return null;
    return { from: word.from, options: SCRIPT_GLOBALS, validFor: /^\w*$/ };
  };
}

/** Completion popup, gutter and active line, in the app's tokens.
 *
 * Kept in the CodeMirror theme rather than in `styles.css` for the same reason the syntax
 * colours are: CodeMirror writes these straight into its own stylesheet, so a token resolves
 * per theme and there is no light/dark pair to keep in step by hand. */
function scriptTheme() {
  return EditorView.theme({
    ".cm-gutters": {
      borderRight: "1px solid var(--rp-border)",
      background: "var(--rp-surface-muted)",
      color: "var(--rp-text-faint)"
    },
    ".cm-activeLineGutter": { background: "transparent", color: "var(--rp-text-secondary)" },
    ".cm-activeLine": { background: "var(--rp-accent-soft)" },
    ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": {
      background: "var(--rp-accent-soft-md)",
      outline: "1px solid var(--rp-accent-soft-strong)"
    },

    ".cm-tooltip.cm-tooltip-autocomplete": {
      border: "1px solid var(--rp-border)",
      borderRadius: "7px",
      background: "var(--rp-surface-raised)",
      boxShadow: "0 10px 28px rgb(0 0 0 / 0.18)",
      overflow: "hidden"
    },
    ".cm-tooltip-autocomplete > ul": {
      fontFamily: "inherit",
      maxHeight: "16em"
    },
    ".cm-tooltip-autocomplete > ul > li": {
      display: "flex",
      alignItems: "baseline",
      gap: "6px",
      padding: "4px 10px",
      color: "var(--rp-text)",
      lineHeight: "1.5"
    },
    // A tint rather than a solid fill: the detail text has to stay readable on it.
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
      background: "var(--rp-accent-soft-strong)",
      color: "var(--rp-text)"
    },
    ".cm-completionLabel": { color: "inherit" },
    ".cm-completionMatchedText": {
      color: "var(--rp-accent-text)",
      textDecoration: "none",
      fontWeight: "600"
    },
    ".cm-completionDetail": {
      marginLeft: "auto",
      paddingLeft: "12px",
      color: "var(--rp-text-muted)",
      fontStyle: "normal"
    },
    ".cm-completionIcon": {
      width: "1.1em",
      color: "var(--rp-text-faint)",
      opacity: "1"
    }
  });
}

/** The comforts a code editor is expected to have. Kept off the request body editor, so a
 * JSON body does not grow a gutter it never asked for. */
function scriptExtensions(getLibrary: () => readonly LibraryCompletion[]) {
  return [
    scriptTheme(),
    lineNumbers(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    bracketMatching(),
    closeBrackets(),
    indentOnInput(),
    autocompletion({ override: [scriptCompletions(getLibrary)] }),
    // Tab takes the highlighted completion while the list is open, the way an editor is
    // expected to behave. Above everything else on purpose, or `insertTabKeymap` would put
    // spaces in first; `acceptCompletion` declines when no list is open, so Tab still indents
    // the rest of the time.
    Prec.high(keymap.of([{ key: "Tab", run: acceptCompletion }])),
    keymap.of([...closeBracketsKeymap, ...completionKeymap, ...defaultKeymap])
  ];
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
  if (options.script) host.classList.add("cm-script");
  const extensions = [
    ...baseExtensions(true, tabSize),
    ...(options.script ? scriptExtensions(options.library ?? (() => [])) : []),
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
