import { state } from "../../app/state";
import {
  FALLBACK_HELPER_NAME,
  identifierFromTitle,
  responseHelper,
  responseSampleJson,
  uniqueHelperName
} from "../../lib/helpers";
import type { ApiResponse, SavedRequest } from "../../types";
import { openFunctionsDialog } from "./functions-dialog";

/**
 * Starts a library function from the response on screen, and opens the editor on it.
 *
 * The name comes from the request's title, which is the only thing on screen that says what
 * the response is; a title that leaves nothing usable falls back to `newFunction`. Either way
 * it is made unique, because every entry is reached through the same `lib` and two functions
 * with one name would shadow each other.
 */
export function createFunctionFromResponse(request: SavedRequest, response: ApiResponse): void {
  const base = identifierFromTitle(request.title) || FALLBACK_HELPER_NAME;
  const name = uniqueHelperName(base, state.helpers);
  const helper = responseHelper(crypto.randomUUID(), name);

  // Nothing is stored until Save. The response rides along to the editor for this one
  // session only — it is never stored at all.
  openFunctionsDialog(helper.id, {
    create: helper,
    sample: responseSampleJson(response)
  });
}
