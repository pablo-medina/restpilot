import type { RawType } from "../types";

export type EditorRuntime = typeof import("../large-text-editor");

let runtime: EditorRuntime | null = null;
let loading: Promise<EditorRuntime> | null = null;

export function preloadEditorRuntime(): Promise<EditorRuntime> {
  loading ??= import("../large-text-editor").then((mod) => {
    runtime = mod;
    return mod;
  });
  return loading;
}

export async function getEditorRuntime(): Promise<EditorRuntime> {
  return runtime ?? preloadEditorRuntime();
}

export type { ViewerMode } from "../large-text-editor";
