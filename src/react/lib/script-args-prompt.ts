import type { HelperParam } from "../../lib/helpers";

/** What was typed for each parameter, keyed by parameter name. Still text at this point:
 * `coerceArgument` is what turns it into the value the function receives. */
export type ScriptArgAnswers = Record<string, string>;

export type ScriptArgsRequest = {
  /** Shown in the title, e.g. `cuil(dni: string, monto: number)`. */
  signature: string;
  /** Parameters, in declaration order, with whatever types the source declared. */
  params: HelperParam[];
  /** Values to start from — the last ones used. */
  seed: ScriptArgAnswers;
};

/**
 * Bridge between the run path (plain functions) and the prompt dialog (React), mirroring
 * `parameter-prompt.ts`: running has to wait for an answer, and `null` means cancelled.
 */
type Opener = (request: ScriptArgsRequest) => Promise<ScriptArgAnswers | null>;

let opener: Opener | null = null;

export function registerScriptArgsPrompt(fn: Opener): () => void {
  opener = fn;
  return () => {
    if (opener === fn) opener = null;
  };
}

/** With no dialog mounted (tests, headless), a function with no parameters still runs; one
 * that needs arguments is abandoned rather than run with blanks. */
export function promptForScriptArgs(request: ScriptArgsRequest): Promise<ScriptArgAnswers | null> {
  if (opener) return opener(request);
  return Promise.resolve(request.params.length === 0 ? {} : null);
}
