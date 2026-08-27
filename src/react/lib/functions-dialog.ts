import type { Helper } from "../../types";

export type OpenFunctionOptions = {
  /**
   * A function that does not exist yet. Nothing is stored until Save, so opening the editor
   * and closing it again leaves the library exactly as it was.
   */
  create?: Helper;
  /**
   * A response to show in a pane beside the code and hand the function's first parameter.
   *
   * Only Create function from response passes one. It is scaffolding for that first run, not
   * a property of the function: nothing stores it, so reopening the same function later gives
   * the plain editor like any other.
   */
  sample?: string;
  /**
   * Opens the whole library: the catalogue beside the editor, maximized. Without it the editor
   * is scoped to one function and offers nothing to switch to.
   */
  library?: boolean;
};

type Opener = (helperId?: string, options?: OpenFunctionOptions) => void;

let opener: Opener | null = null;

export function registerFunctionsDialogOpener(fn: Opener): () => void {
  opener = fn;
  return () => {
    if (opener === fn) opener = null;
  };
}

export function openFunctionsDialog(helperId?: string, options?: OpenFunctionOptions): void {
  opener?.(helperId, options);
}
