import type { ScriptLogLine, ScriptOutcome } from "./run-script";

export type ScriptResult = {
  /** Signature of the function that ran, for the title. */
  signature: string;
  outcome: ScriptOutcome;
  logs: ScriptLogLine[];
};

let opener: ((result: ScriptResult) => void) | null = null;

export function registerScriptResultDialog(fn: (result: ScriptResult) => void): () => void {
  opener = fn;
  return () => {
    if (opener === fn) opener = null;
  };
}

/** Where a run started from the picker shows what it produced — the editor is not involved. */
export function showScriptResult(result: ScriptResult): void {
  opener?.(result);
}
