import { getActiveEnvironment } from "../../app/environments";
import { scheduleSave } from "../../app/persistence";
import { id, state } from "../../app/state";
import { t } from "../../i18n";
import { applyExtractedVariable, findExtractor, runExtractor, stringifyExtractedValue } from "../../lib/extractors";
import type { ApiResponse, SavedRequest } from "../../types";
import { pushToast } from "../components/Toast";
import { showExtractorResult } from "./extractor-result-dialog";

/**
 * Runs the request's extractor over the response it just got. With a target variable the value is
 * stored (active environment when there is one, else globals); without one it is shown in a
 * dialog to copy.
 */
export function runRequestExtractor(request: SavedRequest, response: ApiResponse): void {
  const config = request.extractor;
  if (!config?.extractorId) return;

  const extractor = findExtractor(state.extractors, config.extractorId);
  const labels = t().extractors;
  if (!extractor) {
    pushToast(labels.missing);
    return;
  }

  const outcome = runExtractor(extractor.code, response);
  const title = labels.resultTitle.replace("{name}", extractor.name);

  if (!outcome.success) {
    showExtractorResult({ title, value: "", error: outcome.error });
    return;
  }

  const value = stringifyExtractedValue(outcome.value);
  const variable = config.variable?.trim();
  if (!variable) {
    showExtractorResult({ title, value });
    return;
  }

  const environment = getActiveEnvironment();
  const list = environment ? environment.variables : state.variables;
  const { created } = applyExtractedVariable(list, variable, value, id);
  scheduleSave();
  pushToast((created ? labels.variableCreated : labels.variableUpdated).replace("{name}", variable));
}
