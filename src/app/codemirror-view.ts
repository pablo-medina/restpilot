import type { EditorView } from "@codemirror/view";

/** Resolve a CodeMirror view from a DOM target via the host ref set at mount time. */
export function codeMirrorViewFromTarget(target: EventTarget | null): EditorView | null {
  if (!(target instanceof Node)) return null;
  const node = target instanceof Element ? target : target.parentElement;
  const editor = node?.closest(".cm-editor");
  if (!editor) return null;
  const host = editor.closest(".cm-host") as HTMLElement & { __cmView?: EditorView };
  return host?.__cmView ?? null;
}
