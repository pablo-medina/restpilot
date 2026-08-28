export type EditorRuntime = typeof import("../ui/large-text-editor");

let loading: Promise<EditorRuntime> | null = null;

export function preloadEditorRuntime(): Promise<EditorRuntime> {
  loading ??= import("../ui/large-text-editor");
  return loading;
}

export type { ViewerMode } from "../ui/large-text-editor";
