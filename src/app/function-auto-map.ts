import { applyAutoMappedVariable, stringifyFunctionResult } from "../lib/function-auto-map";
import type { AppFunction, VariableScope } from "../types";
import { getActiveEnvironment } from "./environments";
import { scheduleSave } from "./persistence";
import { bumpRenderGeneration } from "../react/render-bridge";
import { id, state } from "./state";

export type AutoMapOutcome = {
  name: string;
  scope: VariableScope;
  /** Environment name when the value landed in the active environment. */
  envName?: string;
  created: boolean;
};

/** True when this function stores its result without asking. */
export function functionAutoMapEnabled(func: AppFunction): boolean {
  return func.autoMapEnabled === true && (func.autoMapVariable ?? "").trim() !== "";
}

/** Stores the function result in the variable configured on that function, creating it
 * when missing. Returns `null` when auto-mapping is off, so callers fall back to the dialog. */
export function autoMapFunctionResult(func: AppFunction, value: unknown): AutoMapOutcome | null {
  if (!functionAutoMapEnabled(func)) return null;

  const name = (func.autoMapVariable ?? "").trim();
  const activeEnv = getActiveEnvironment();
  // Without an active environment there is nowhere to put an environment-scoped value.
  const useEnvironment = func.autoMapScope === "environment" && activeEnv !== null;
  const list = useEnvironment ? activeEnv!.variables : state.variables;

  const { created } = applyAutoMappedVariable(list, name, stringifyFunctionResult(value), id);
  scheduleSave();
  bumpRenderGeneration();

  return {
    name,
    scope: useEnvironment ? "environment" : "global",
    envName: useEnvironment ? activeEnv!.name : undefined,
    created
  };
}
