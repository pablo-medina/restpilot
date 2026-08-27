import { t } from "../../i18n";
import { stringifyReturnedValue } from "../../lib/helpers";
import type { ApiResponse, SavedRequest } from "../../types";
import { state } from "../../app/state";
import { pushToast } from "../components/Toast";
import { runHelper } from "./run-helper";
import { applyScriptWrites } from "./run-script";
import { showScriptResult } from "./script-result-dialog";

/** Repeated header names joined with ", ", matching `Headers.get()`. */
function headerLookup(headers: ApiResponse["headers"]): Record<string, string> {
  const lookup: Record<string, string> = {};
  for (const [key, value] of headers) {
    lookup[key] = key in lookup ? `${lookup[key]}, ${value}` : value;
  }
  return lookup;
}

/** The response as the function receives it: JSON bodies already parsed. */
function responseArgument(response: ApiResponse): unknown {
  let body: unknown = response.body;
  try {
    body = JSON.parse(response.body);
  } catch {
    body = response.body;
  }
  return {
    status: response.status,
    statusText: response.status_text,
    headers: headerLookup(response.headers),
    body
  };
}

/**
 * Runs the request's library function over the response it just got.
 *
 * The response goes in as the **first argument**; any further parameters take their declared
 * defaults. A send never stops to ask for anything — a prompt in the middle of a request is
 * not a thing anyone wants.
 *
 * A target variable is optional. With one, what the function returned is stored. Without one
 * the function did its work through `env`, and whatever it returned is reported rather than
 * dropped in silence.
 */
export async function runRequestFunction(
  request: SavedRequest,
  response: ApiResponse
): Promise<void> {
  const call = request.functionCall;
  if (!call?.helperId) return;

  const labels = t().functions;
  const helper = state.helpers.find((item) => item.id === call.helperId);
  if (!helper) {
    pushToast(labels.missing);
    return;
  }

  const outcome = await runHelper({ helper, args: [responseArgument(response)] });
  if (!outcome) return;

  if (outcome.error) {
    showScriptResult({ signature: helper.name, outcome, logs: outcome.logs });
    return;
  }

  const variable = call.variable?.trim();
  const returned = outcome.value === null ? undefined : (JSON.parse(outcome.value) as unknown);

  if (variable) {
    await applyScriptWrites([{ name: variable, value: stringifyReturnedValue(returned) }]);
    pushToast(labels.variablesWritten.replace("{names}", variable));
    return;
  }

  // Nothing to store it in, but something came back: show it instead of discarding it
  // quietly. This is the whole output of the run, so it gets the roomier toast.
  if (returned !== undefined) {
    pushToast(
      labels.returnedValue.replace("{value}", stringifyReturnedValue(returned).slice(0, 200)),
      { variant: "result" }
    );
  }
}
