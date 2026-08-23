import type { ParameterAnswers, SavedRequest } from "../../types";

/**
 * Bridge between the send path (plain functions) and the prompt dialog (React), mirroring
 * `variables-manager-dialog.ts` but promise-based, because sending has to wait for an answer.
 *
 * Resolves to the answers, or `null` when the user cancels — which aborts the send.
 */
type Opener = (request: SavedRequest) => Promise<ParameterAnswers | null>;

let opener: Opener | null = null;

export function registerParameterPrompt(fn: Opener): () => void {
  opener = fn;
  return () => {
    if (opener === fn) opener = null;
  };
}

/** With no dialog mounted (tests, headless), sending proceeds with no answers rather than
 * hanging forever — unanswered parameters then resolve to empty, like unknown variables. */
export function promptForParameters(request: SavedRequest): Promise<ParameterAnswers | null> {
  return opener ? opener(request) : Promise.resolve({});
}
