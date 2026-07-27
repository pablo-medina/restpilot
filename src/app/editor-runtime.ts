export type EditorRuntime = typeof import("../ui/large-text-editor");

let runtime: EditorRuntime | null = null;
let loading: Promise<EditorRuntime> | null = null;

export function preloadEditorRuntime(): Promise<EditorRuntime> {
  loading ??= import("../ui/large-text-editor").then((mod) => {
    runtime = mod;
    return mod;
  });
  return loading;
}

export async function getEditorRuntime(): Promise<EditorRuntime> {
  return runtime ?? preloadEditorRuntime();
}

export type { ViewerMode } from "../ui/large-text-editor";
